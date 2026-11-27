/* ============================================================
   13. SALES HISTORY & AFTERSALES (RETURNS & EXCHANGES)
   ============================================================ */
let salesFilterStatus = 'all';
let salesSearchQuery = '';
let salesDateFrom = currentYearStartISO();
let salesDateTo = currentYearEndISO();
let salesYearFilter = 'current';
let returnExchangeCart = [];
let currentReturnResolution = 'exchange'; // 'exchange' | 'refund'
let returnItemConditions = {}; // rowIdx -> 'sealed' | 'opened' | 'defective'
let adminReviewApproved = false;
let adminReviewReason = '';
let adminReviewAdminName = '';

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
    onSelect: function (iso) {
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

function clearSalesDates() {
  setSalesDatePreset('all');
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

function isCurrentUserSale(s) {
  if (!s || !currentUser) return false;
  if (currentUser.role === 'admin') return true;
  // Match by authenticated cashier user ID
  const sCashierId = String(s.cashierId || s.cashier_id || '').trim();
  const curUserId = String(currentUser.id || '').trim();
  if (sCashierId && curUserId && sCashierId === curUserId) {
    return true;
  }
  // Fallback to name or username match for historical records
  const sCashierName = String(s.cashierName || s.cashier_name || '').trim().toLowerCase();
  const curName = String(currentUser.name || '').trim().toLowerCase();
  const curUsername = String(currentUser.username || '').trim().toLowerCase();
  return (sCashierName !== '' && (sCashierName === curName || sCashierName === curUsername));
}

function renderCashierSalesSummaryHtml(cashierSales, fromDate, toDate) {
  const periodInfo = getReportingPeriodDisplayInfo(fromDate, toDate);
  const completedSales = cashierSales.filter(s => {
    const ns = normalizeSaleStatus(s.status);
    return ns !== 'voided' && ns !== 'cancelled';
  });
  const totalGross = completedSales.reduce((sum, s) => sum + Number(s.subtotal || s.total || 0), 0);
  const totalNet = typeof sumSales === 'function'
    ? sumSales(completedSales)
    : completedSales.reduce((sum, s) => {
      const refund = Number(s.refundTotal || 0);
      return sum + Math.max(0, Number(s.total || 0) - refund);
    }, 0);
  const totalTx = completedSales.length;
  const returnTx = cashierSales.filter(s => Array.isArray(s.returns) && s.returns.length > 0).length;

  return `
    <div class="sh-cashier-summary-wrap" style="margin-bottom:14px;">
      <div class="sh-period-banner" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-weight:700; color:var(--ink-soft); text-transform:uppercase; font-size:11px; letter-spacing:0.04em;">Cashier Overview:</span>
          <span class="badge" style="background:var(--teal-tint); color:var(--teal-dark); font-weight:700; border:1px solid var(--teal-tint-border);">👤 ${escapeHtml(currentUser.name)}</span>
          <span class="sh-period-pill">${periodInfo.icon} ${escapeHtml(periodInfo.badge)}</span>
          <strong style="font-family:'Space Grotesk',sans-serif; font-size:13.5px; color:var(--ink);">${escapeHtml(periodInfo.rangeText)}</strong>
        </div>
        <div class="muted small" style="font-size:12px;">
          Showing <b>${cashierSales.length}</b> transaction record${cashierSales.length === 1 ? '' : 's'}
        </div>
      </div>
      <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
        <div class="stat-card" style="border-left:4px solid var(--teal); padding:12px 16px;">
          <div class="label" style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em;">My Total Net Sales</div>
          <div class="value" style="color:var(--teal-text); font-size:22px; font-family:'Space Grotesk',sans-serif; font-weight:700;">${peso(totalNet)}</div>
          <div class="sub" style="font-size:11px;">Total net revenue collected</div>
        </div>
        <div class="stat-card sage" style="padding:12px 16px;">
          <div class="label" style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em;">My Completed Transactions</div>
          <div class="value" style="font-size:22px; font-family:'Space Grotesk',sans-serif; font-weight:700;">${totalTx.toLocaleString()}</div>
          <div class="sub" style="font-size:11px;">Completed sales transactions</div>
        </div>
        <div class="stat-card mustard" style="padding:12px 16px;">
          <div class="label" style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em;">My Gross Transaction Value</div>
          <div class="value" style="font-size:22px; font-family:'Space Grotesk',sans-serif; font-weight:700;">${peso(totalGross)}</div>
          <div class="sub" style="font-size:11px;">Gross sales before discounts/refunds</div>
        </div>
        ${returnTx > 0 ? `
        <div class="stat-card" style="border-left:4px solid #D97706; padding:12px 16px;">
          <div class="label" style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em;">My Returns &amp; Exchanges</div>
          <div class="value" style="color:var(--warning-text); font-size:22px; font-family:'Space Grotesk',sans-serif; font-weight:700;">${returnTx.toLocaleString()}</div>
          <div class="sub" style="font-size:11px;">Transactions with return / exchange slips</div>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

function salesHistoryPage() {
  const curY = getCurrentYear();
  const availableYears = getAvailableRecordYears();
  const selectedYear = getSalesSelectedYear();
  const activePreset = getSalesDatePreset();
  const hasDates = Boolean(salesDateFrom || salesDateTo);
  const isHistorical = isHistoricalView(salesDateFrom, salesDateTo);
  const isCashier = currentUser && currentUser.role === 'cashier';
  const mySales = (db.sales || []).filter(s => isCurrentUserSale(s));
  const pendingVoidCount = mySales.filter(s => normalizeSaleStatus(s.status) === 'pending_void').length;
  const voidedCount = mySales.filter(s => normalizeSaleStatus(s.status) === 'voided').length;
  const voidRejectedCount = mySales.filter(s => normalizeSaleStatus(s.status) === 'void_rejected').length;

  return `
  <div class="panel" id="sales-history-panel" style="padding:0; overflow:hidden;">
    <div class="panel-head row wrap" style="padding:14px 18px 12px; gap:10px;">
      <div>
        <h3 style="margin:0;">Sales History &amp; Aftersales</h3>
        <span class="muted small">${isCashier ? `Viewing your personal sales transactions (Cashier: <b>${escapeHtml(currentUser.name)}</b>)` : 'Review sales receipts, process same-day product returns &amp; exchanges (within day only), and issue exchange slips'}</span>
      </div>
      <div class="spacer"></div>
      <div class="row wrap" style="gap:8px; align-items:center;">
        ${isCashier ? `
          <span class="badge" style="background:var(--teal-tint); color:var(--teal-dark); font-weight:700; border:1px solid var(--teal-tint-border); padding:4px 10px; border-radius:12px;">
            👤 ${escapeHtml(currentUser.name)} (Cashier)
          </span>
        ` : ''}
        <input id="sh-search" type="text" placeholder="${isCashier ? '🔍 Search receipt #, customer, items…' : '🔍 Search receipt #, cashier, customer…'}" value="${escapeHtml(salesSearchQuery)}" style="width:250px;" oninput="onSalesSearchInput(this.value)">
        <button type="button" class="btn ghost small" onclick="resetAllSalesFilters()" title="Reset all search and date filters to current year">Reset All</button>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div style="padding:10px 18px; display:flex; gap:8px; border-bottom:1px solid var(--line-light); background:var(--surface-2); flex-wrap:wrap;">
      <button class="btn ghost small filter-tab ${salesFilterStatus === 'all' ? 'active' : ''}" onclick="setSalesFilter('all')">All Transactions</button>
      <button class="btn ghost small filter-tab ${salesFilterStatus === 'completed' ? 'active' : ''}" onclick="setSalesFilter('completed')">Completed</button>
      <button class="btn ghost small filter-tab ${salesFilterStatus === 'pending_void' ? 'active' : ''}" onclick="setSalesFilter('pending_void')">⏳ Pending Void (${pendingVoidCount})</button>
      <button class="btn ghost small filter-tab ${salesFilterStatus === 'refunded' ? 'active' : ''}" onclick="setSalesFilter('refunded')">Returned / Exchanged</button>
      <button class="btn ghost small filter-tab ${salesFilterStatus === 'voided' ? 'active' : ''}" onclick="setSalesFilter('voided')">🚫 Voided (${voidedCount})</button>
      <button class="btn ghost small filter-tab ${salesFilterStatus === 'void_rejected' ? 'active' : ''}" onclick="setSalesFilter('void_rejected')">✕ Void Rejected (${voidRejectedCount})</button>
    </div>

    <!-- Dedicated Date Range Bar, Year Selector & Historical Records Option -->
    <div class="audit-date-bar" style="padding:10px 18px; border-top:none; border-bottom:1px solid var(--line-light); background:var(--surface-2);">
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
  if (typeof syncRouteState === 'function') syncRouteState({ push: true });
  renderSalesHistoryTable(true);
  // Update tab visual state
  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${status}'`));
  });
}

let _salesSearchTimer = null;
function onSalesSearchInput(val) {
  salesSearchQuery = val || '';
  if (_salesSearchTimer) clearTimeout(_salesSearchTimer);
  _salesSearchTimer = setTimeout(() => {
    _salesSearchTimer = null;
    renderSalesHistoryTable();
  }, 150);
}

function renderSalesHistoryTable(keepPage = false) {
  const searchEl = document.getElementById('sh-search');
  if (searchEl) salesSearchQuery = searchEl.value;
  if (!keepPage) {
    resetPaginationPage('sales_history');
  }
  const el = document.getElementById('sales-history-table');
  if (el) el.innerHTML = salesHistoryTableHtml();
  if (typeof syncRouteState === 'function') syncRouteState({ push: false });
}

function normalizeSaleStatus(status) {
  const s = String(status || 'completed').trim().toLowerCase();
  if (s === 'pending void approval' || s === 'pending_void' || s === 'pending void') return 'pending_void';
  if (s === 'void rejected' || s === 'void_rejected') return 'void_rejected';
  if (s === 'voided' || s === 'void') return 'voided';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'refunded' || s === 'exchanged' || s === 'returned') return 'refunded';
  if (s === 'partially_refunded' || s === 'partially_exchanged' || s === 'partially_returned') return 'partially_refunded';
  return 'completed';
}

function saleStatusBadge(status) {
  const norm = normalizeSaleStatus(status);
  if (norm === 'pending_void') {
    return `<span class="badge warning" style="background:var(--warning-bg); color:var(--warning-text); border:1px solid var(--warning-border); font-weight:700;">⏳ Pending Void Approval</span>`;
  }
  if (norm === 'void_rejected') {
    return `<span class="badge danger" style="background:var(--danger-bg); color:var(--danger-text); border:1px solid var(--danger-border); font-weight:700;">✕ Void Rejected</span>`;
  }
  if (norm === 'voided') {
    return `<span class="badge out">🚫 Voided</span>`;
  }
  if (norm === 'cancelled') {
    return `<span class="badge out">Cancelled</span>`;
  }
  if (norm === 'refunded') {
    return `<span class="badge sale-refunded">Returned / Exchanged</span>`;
  }
  if (norm === 'partially_refunded') {
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
  return Math.max(0, Number(sale.refundTotal || 0));
}

function isSaleReturnWithinDay(sale) {
  if (!sale || !sale.date) return false;
  const parsed = new Date(sale.date);
  const saleDateISO = !isNaN(parsed.getTime()) ? toLocalISODate(parsed) : String(sale.date).slice(0, 10);
  return saleDateISO === todayISO();
}

function hasSaleReturnableItems(sale, includeLockedMix = false) {
  if (!sale || !Array.isArray(sale.items)) return false;
  return sale.items.some(it => {
    const qty = Number(it.qty || 0);
    const ret = Number(it.returnedQty || 0);
    const rem = qty - ret;
    if (rem <= 0.001) return false;
    // Under official store policy, Custom Color Mix is strictly Final Sale (non-returnable / non-exchangeable)
    // unless includeLockedMix is explicitly true (for admin exception review)
    if (!includeLockedMix && it.type === 'colormix') return false;
    return true;
  });
}

function saleHasOnlyCustomMixItems(sale) {
  if (!sale || !Array.isArray(sale.items)) return false;
  const unreturned = sale.items.filter(it => (Number(it.qty || 0) - Number(it.returnedQty || 0)) > 0.001);
  return unreturned.length > 0 && unreturned.every(it => it.type === 'colormix');
}

function salesHistoryTableHtml() {
  const q = String(salesSearchQuery || '').trim().toLowerCase();
  const fromDate = salesDateFrom;
  const toDate = salesDateTo;
  const isCashier = currentUser && currentUser.role === 'cashier';
  let list = [...(db.sales || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Role-based filtering: Cashier only sees their own transactions
  if (isCashier) {
    list = list.filter(s => isCurrentUserSale(s));
  }

  if (salesFilterStatus !== 'all') {
    list = list.filter(s => {
      const norm = normalizeSaleStatus(s.status);
      if (salesFilterStatus === 'refunded') {
        return norm === 'refunded' || norm === 'partially_refunded';
      }
      return norm === salesFilterStatus;
    });
  }
  if (q) {
    list = list.filter(s => {
      const itemsText = (s.items || []).map(it => it.name || it.productName || '').join(' ');
      const custText = s.customerName || s.customer_name || '';
      return (getReceiptNo(s) + ' ' + (s.cashierName || '') + ' ' + custText + ' ' + itemsText).toLowerCase().includes(q);
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

  const historicalBannerHtml = isHistorical ? `
    <div class="historical-records-banner">
      <div>
        🏛️ <b>${escapeHtml(histLabel)}:</b> <b>${list.length}</b> transaction(s) found. All historical business records are permanently retained in the database.
      </div>
      <button type="button" class="btn ghost small" onclick="setSalesDatePreset('year')" style="color:var(--warning-text); border-color:var(--warning-border); background:var(--surface);">Return to Current Year (${curY}) &rarr;</button>
    </div>
  ` : '';

  let cashierNoticeHtml = '';
  if (isCashier) {
    const dismissed = getDismissedCashierVoidNotifs();
    const decided = (db.sales || []).filter(s => isCurrentUserSale(s) && (normalizeSaleStatus(s.status) === 'voided' || normalizeSaleStatus(s.status) === 'void_rejected') && !dismissed.has(s.id));
    if (decided.length > 0) {
      cashierNoticeHtml = `
        <div style="margin:12px 18px 0; background:var(--success-bg); border:1.5px solid var(--success-border); border-radius:8px; padding:12px 16px; display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div>
            <div style="font-weight:700; color:var(--success-text); font-size:13px; display:flex; align-items:center; gap:6px;">
              <span>🔔 Void Request Decision Notice</span>
              <span class="badge ok" style="font-size:10px;">${decided.length} Notification${decided.length === 1 ? '' : 's'}</span>
            </div>
            <div style="margin-top:6px; font-size:12px; color:var(--success-text); display:flex; flex-direction:column; gap:4px;">
              ${decided.slice(0, 4).map(ds => {
        const isApproved = normalizeSaleStatus(ds.status) === 'voided';
        const rNo = getReceiptNo(ds);
        const decAdmin = isApproved ? (ds.voidedBy || 'Admin') : (ds.voidRejectedBy || 'Admin');
        const decDate = isApproved ? ds.voidedAt : ds.voidRejectedAt;
        const decTimeStr = decDate ? formatDateTime(decDate) : '';
        return `
                  <div>
                    • <b>Receipt ${escapeHtml(rNo)}</b>:
                    ${isApproved
            ? `<span style="color:var(--success-text); font-weight:700;">Approved</span> by ${escapeHtml(decAdmin)} ${decTimeStr ? `(${decTimeStr})` : ''} — Sale voided &amp; eligible inventory restored.`
            : `<span style="color:var(--danger-text); font-weight:700;">Rejected</span> by ${escapeHtml(decAdmin)} ${decTimeStr ? `(${decTimeStr})` : ''} — Original transaction kept Completed. Reason: "${escapeHtml(ds.voidAdminRemarks || ds.voidRejectReason || 'No note')}".`}
                    <a href="#" onclick="openVoidDetailsModal('${ds.id}'); return false;" style="margin-left:6px; text-decoration:underline; font-weight:600; color:inherit;">View Details</a>
                  </div>
                `;
      }).join('')}
            </div>
          </div>
          <button type="button" class="btn ghost small" onclick="dismissAllCashierVoidNotifs()" style="font-size:11px; padding:2px 8px; color:var(--success-text);" title="Dismiss notifications">✕ Dismiss</button>
        </div>
      `;
    }
  }

  return `
  ${historicalBannerHtml}
  ${cashierNoticeHtml}
  ${!isCashier && typeof renderSalesHistorySummaryAndBreakdownsHtml === 'function'
      ? `<div style="padding:14px 18px 0;">${renderSalesHistorySummaryAndBreakdownsHtml(list, fromDate, toDate)}</div>`
      : (isCashier ? renderCashierSalesSummaryHtml(list, fromDate, toDate) : '')}
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
        const normStatus = normalizeSaleStatus(status);
        const returnedVal = getSaleReturnedValue(s);
        const exchangeTotal = getSaleExchangeTotal(s);
        const refundTotal = Number(s.refundTotal || 0);
        const netTotal = Number((s.total - refundTotal).toFixed(2));
        const hasReturns = Array.isArray(s.returns) && s.returns.length > 0;
        const isWithinDay = isSaleReturnWithinDay(s);

        return `
        <tr>
          <td><code style="color:var(--teal-text); font-weight:700;">${escapeHtml(getReceiptNo(s))}</code></td>
          <td>${formatDateTime(s.date)}</td>
          <td>${escapeHtml(s.cashierName)}</td>
          <td>
            <div>${s.items.length} item${s.items.length === 1 ? '' : 's'}</div>
            ${(() => {
            const mixes = (s.items || []).filter(it => it && it.type === 'colormix');
            if (!mixes.length) return '';
            return mixes.slice(0, 2).map(mx => `
                <div class="muted small" style="display:flex; align-items:center; gap:4px; font-size:11px; margin-top:2px;">
                  <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${escapeAttr(mx.hexColor || '#1F6F6B')}; border:1px solid rgba(0,0,0,0.2); flex-shrink:0;"></span>
                  <span>Mix: <b>${escapeHtml(mx.colorName || 'Custom')}</b> (${formatStock(mx.liters || mx.qty || 1)}L)</span>
                </div>
              `).join('') + (mixes.length > 2 ? `<div class="muted small" style="font-size:10.5px;">+${mixes.length - 2} more mix</div>` : '');
          })()}
          </td>
          <td class="center">${saleStatusBadge(status)}</td>
          <td class="right">
            ${(returnedVal > 0 || refundTotal !== 0)
            ? `<div><strong style="font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; font-size:13.5px;">${peso(netTotal)}</strong></div>
                 <div class="muted small" style="color:${exchangeTotal > 0 ? 'var(--teal)' : 'var(--danger)'}; font-size:11px;">
                   ${exchangeTotal > 0
              ? `Exchanged: ${peso(exchangeTotal)}`
              : `Returned: -${peso(returnedVal || refundTotal)}`}
                 </div>`
            : `<div><strong style="font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; font-size:13.5px;">${peso(s.total)}</strong></div>
           ${(Number(s.discountAmount || s.discount || 0) > 0) ? `<div class="muted small" style="color:var(--teal-text); font-size:11px; font-weight:600;">${Number(s.discountPct || s.discountPercentage || 10)}% Discount: -${peso(Number(s.discountAmount || s.discount || 0))}</div>` : ''}`}
          </td>
          <td class="right" style="white-space:nowrap;">
            <div class="row wrap" style="justify-content:flex-end; gap:6px;">
              <button class="btn ghost small" onclick='viewSale("${s.id}")' title="View Sales Receipt">🧾 Receipt</button>
              ${normStatus === 'completed' && !hasReturns ? `
                <button class="btn ghost small" style="color:var(--danger); border-color:var(--danger-border); background:var(--danger-bg);" onclick='openVoidSaleModal("${s.id}")' title="Submit Void Request for Admin Approval">🚫 Void</button>
              ` : ''}
              ${normStatus === 'pending_void' ? `
                <button class="btn ghost small" style="color:var(--warning-text); border-color:var(--warning-border); background:var(--warning-bg); font-weight:600;" onclick='openVoidDetailsModal("${s.id}")' title="Void request submitted. Awaiting Admin review. Click to view details.">⏳ Pending Void</button>
              ` : ''}
              ${normStatus === 'voided' ? `
                <button class="btn ghost small" style="color:var(--ink-soft); font-size:11px;" onclick='openVoidDetailsModal("${s.id}")' title="View void approval details">ℹ️ Void Details</button>
              ` : ''}
              ${normStatus === 'void_rejected' ? `
                <button class="btn ghost small" style="color:var(--danger); border-color:var(--danger-border); background:var(--danger-bg); font-size:11px;" onclick='openVoidDetailsModal("${s.id}")' title="View Admin rejection details">✕ Void Rejected</button>
              ` : ''}
              ${normStatus !== 'refunded' && normStatus !== 'voided' && normStatus !== 'pending_void' && normStatus !== 'cancelled' ? (
            hasSaleReturnableItems(s)
              ? `<button class="btn secondary small" onclick='openReturnRefundModal("${s.id}")' title="Process Return &amp; Exchange under store policy">↩️ Return / Exchange</button>`
              : (saleHasOnlyCustomMixItems(s)
                ? (currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager')
                  ? `<button class="btn ghost small" onclick='openReturnRefundModal("${s.id}")' style="border-color:var(--warning-border); color:var(--warning-text);" title="Custom Color Mix is strictly Final Sale under standard policy. Click to open Administrator Review for store mixing errors.">🛡️ Custom Mix (Admin Review)</button>`
                  : `<button class="btn ghost small" disabled style="opacity:0.65; cursor:not-allowed;" title="Custom Color Mix cannot be returned or exchanged once mixed (Final Sale)">🔒 Custom Mix (Final Sale)</button>`)
                : `<button class="btn ghost small" disabled style="opacity:0.55; cursor:not-allowed;" title="All items from this transaction have already been returned or exchanged">✓ Fully Returned</button>`)
          ) : ''}
              ${hasReturns ? `
                <button class="btn ghost small" onclick='viewReturnVouchers("${s.id}")' title="View return &amp; exchange slips" style="color:var(--warning-text); background:var(--warning-bg); border:1px solid var(--warning-border);">📋 Slip (${s.returns.length})</button>
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
  const sale = (db.sales || []).find(s => s.id === id);
  if (!sale) return;
  if (currentUser && currentUser.role === 'cashier' && !isCurrentUserSale(sale)) {
    showToast('Access denied: You are restricted from viewing other cashiers\' receipts.', 'error');
    return;
  }
  showReceipt(sale);
}

/* ============================================================
   VOID SALE TRANSACTION WORKFLOW (ADMIN APPROVAL REQUEST)
   ============================================================ */

let dismissedCashierVoidNotifIds = null;
function getDismissedCashierVoidNotifs() {
  if (dismissedCashierVoidNotifIds) return dismissedCashierVoidNotifIds;
  try {
    const raw = localStorage.getItem('mrgr_dismissed_void_notifs');
    dismissedCashierVoidNotifIds = new Set(raw ? JSON.parse(raw) : []);
  } catch (e) {
    dismissedCashierVoidNotifIds = new Set();
  }
  return dismissedCashierVoidNotifIds;
}

function dismissAllCashierVoidNotifs() {
  const set = getDismissedCashierVoidNotifs();
  (db.sales || []).forEach(s => {
    if (normalizeSaleStatus(s.status) === 'voided' || normalizeSaleStatus(s.status) === 'void_rejected') {
      set.add(s.id);
    }
  });
  try {
    localStorage.setItem('mrgr_dismissed_void_notifs', JSON.stringify([...set]));
  } catch (e) { }
  renderSalesHistoryTable(true);
}

function openVoidSaleModal(saleId) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale) {
    showToast('Sale transaction not found.', 'error');
    return;
  }
  if (currentUser && currentUser.role === 'cashier' && !isCurrentUserSale(sale)) {
    showToast('Access denied: You cannot void transactions of other cashiers.', 'error');
    return;
  }
  const norm = normalizeSaleStatus(sale.status);
  if (norm === 'voided') {
    showToast('This transaction has already been voided.', 'error');
    return;
  }
  if (norm === 'pending_void' || (Array.isArray(db.voidRequests) && db.voidRequests.some(vr => (vr.saleId === sale.id || vr.receiptNo === getReceiptNo(sale)) && vr.status === 'pending'))) {
    showToast('A void request for this receipt is already pending Admin approval.', 'warning');
    return;
  }
  if (sale.status === 'refunded' || (Array.isArray(sale.returns) && sale.returns.length > 0)) {
    showToast('Cannot void a transaction that already has returns or exchanges processed.', 'error');
    return;
  }

  const receiptNo = getReceiptNo(sale);
  const items = Array.isArray(sale.items) ? sale.items : [];
  const hasCustomMix = items.some(it => it.type === 'colormix');

  const itemsListHtml = items.map(it => {
    const size = Number(it.size) || 1;
    const qty = Number(it.qty) || 1;
    const isMix = it.type === 'colormix';
    const sizeStr = !isMix ? `${size}L` : `${formatStock(it.liters || qty)}L`;
    const mixTag = isMix ? `<span class="badge low" style="font-size:10px; margin-left:4px;">Custom Mix</span>` : '';
    return `
      <tr style="border-bottom:1px solid var(--line-light);">
        <td style="padding:6px 8px; font-weight:600;">${escapeHtml(it.name)}${mixTag}</td>
        <td style="padding:6px 8px; text-align:center;">${sizeStr}</td>
        <td style="padding:6px 8px; text-align:center; font-weight:700;">${qty}</td>
        <td style="padding:6px 8px; text-align:right; font-family:'Space Grotesk',monospace;">${peso(it.lineTotal)}</td>
      </tr>
    `;
  }).join('');

  const bodyHtml = `
    <div style="display:flex; flex-direction:column; gap:14px; max-width:540px;">
      <div style="background:var(--warning-bg); border:1.5px solid var(--warning-border); border-radius:8px; padding:12px 14px; display:flex; gap:10px; align-items:flex-start;">
        <span style="font-size:24px; line-height:1;">⏳</span>
        <div>
          <div style="font-weight:700; color:var(--warning-text); font-size:13.5px;">Void Sale Request — Receipt ${escapeHtml(receiptNo)}</div>
          <div style="font-size:12px; color:var(--warning-text); margin-top:2px;">
            Submitting will send this void request to the Administrator's <b>Pending Approvals Hub</b> for review. The transaction will be marked as <b>Pending Void Approval</b>.
            Inventory will remain unchanged until an Administrator reviews and approves the request.
          </div>
        </div>
      </div>

      <div style="background:var(--surface-2); border:1px solid var(--line-light); border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12.5px; color:var(--ink-soft);">Total Transaction Amount:</span>
        <span style="font-family:'Space Grotesk',monospace; font-size:16px; font-weight:700; color:var(--ink);">${peso(sale.total)}</span>
      </div>

      <div>
        <label style="font-size:12px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em;">Purchased Items in Transaction</label>
        <div style="max-height:150px; overflow-y:auto; border:1px solid var(--line); border-radius:6px; margin-top:4px; background:var(--surface);">
          <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead style="background:var(--surface-2); border-bottom:1px solid var(--line);">
              <tr>
                <th style="padding:6px 8px; text-align:left;">Item</th>
                <th style="padding:6px 8px; text-align:center;">Size</th>
                <th style="padding:6px 8px; text-align:center;">Qty</th>
                <th style="padding:6px 8px; text-align:right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsListHtml}
            </tbody>
          </table>
        </div>
        ${hasCustomMix ? `
          <div style="margin-top:6px; font-size:11px; color:var(--ink-soft); background:var(--surface-2); padding:6px 10px; border-radius:4px; border:1px dashed var(--line);">
            ℹ️ <b>Custom Color Mix Notice</b>: Blended paint cannot be returned to regular sealed inventory upon approval and will be quarantined as miscast stock per store policy.
          </div>
        ` : ''}
      </div>

      <div>
        <label for="void-sale-reason-select" style="font-weight:700; font-size:12.5px; display:block; margin-bottom:4px;">
          Void Reason <span style="color:var(--danger);">*</span>
        </label>
        <select id="void-sale-reason-select" class="input" style="width:100%; margin-bottom:6px;" onchange="onVoidReasonSelectChange(this.value)">
          <option value="Cashier input error / wrong product selected">Cashier input error / wrong product selected</option>
          <option value="Customer cancelled before counter departure">Customer cancelled before counter departure</option>
          <option value="Duplicate transaction ring-up">Duplicate transaction ring-up</option>
          <option value="Wrong payment amount or tender calculation error">Wrong payment amount or tender calculation error</option>
          <option value="Customer changed mind before leaving counter">Customer changed mind before leaving counter</option>
          <option value="Other">Other (specify explanation below)…</option>
        </select>
        <label for="void-sale-reason" style="font-size:11.5px; font-weight:600; color:var(--ink-soft); display:block; margin-bottom:2px;">
          Explanation / Remarks <span id="void-expl-required-tag" style="color:var(--danger); display:none;">* Required for "Other"</span>
        </label>
        <textarea id="void-sale-reason" rows="2" placeholder="Specify void explanation and details for Admin review…"
          style="width:100%; box-sizing:border-box; padding:8px 10px; font-size:12.5px; border:1px solid var(--line); border-radius:6px; font-family:inherit; resize:vertical;"></textarea>
      </div>

      <div style="background:var(--teal-tint); border:1px solid var(--teal-tint-border); border-radius:6px; padding:8px 12px; font-size:12px; color:var(--teal-dark);">
        <span>👤 Requesting Cashier: <b>${escapeHtml((currentUser && currentUser.name) || sale.cashierName || 'Cashier')}</b></span>
      </div>
    </div>
  `;

  const footHtml = `
    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
    <button type="button" class="btn" id="btn-submit-void-request" onclick="submitVoidSale('${sale.id}')"
      style="background:var(--mustard-dark, #B45309); color:#fff; font-weight:700;">
      📨 Submit Void Request
    </button>
  `;

  openModal('🚫 Void Sale Transaction', bodyHtml, footHtml, 'void-sale-modal');
  setTimeout(() => {
    const sel = document.getElementById('void-sale-reason-select');
    const ta = document.getElementById('void-sale-reason');
    if (sel && ta && sel.value !== 'Other') {
      ta.placeholder = `Explanation for: ${sel.value} (optional or enter additional details)…`;
    }
  }, 50);
}

function onVoidReasonSelectChange(val) {
  const ta = document.getElementById('void-sale-reason');
  const reqTag = document.getElementById('void-expl-required-tag');
  if (!ta) return;
  if (val === 'Other') {
    ta.value = '';
    ta.placeholder = 'Please specify the exact void explanation (required)…';
    if (reqTag) reqTag.style.display = 'inline';
    ta.focus();
  } else {
    if (reqTag) reqTag.style.display = 'none';
    ta.placeholder = `Explanation for: ${val} (optional or enter additional details)…`;
  }
}

async function submitVoidSale(saleId) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale) return;

  const selEl = document.getElementById('void-sale-reason-select');
  const reason = selEl ? selEl.value.trim() : '';
  const reasonEl = document.getElementById('void-sale-reason');
  const explanation = reasonEl ? reasonEl.value.trim() : '';

  if (!reason) {
    showToast('Please select a reason for voiding this sale.', 'error');
    if (selEl) selEl.focus();
    return;
  }

  if (reason === 'Other' && !explanation) {
    showToast('Please enter an explanation for void reason "Other".', 'error');
    if (reasonEl) reasonEl.focus();
    return;
  }

  // Prevent multiple pending requests for the same receipt
  const norm = normalizeSaleStatus(sale.status);
  if (norm === 'pending_void' || (Array.isArray(db.voidRequests) && db.voidRequests.some(vr => (vr.saleId === sale.id || vr.receiptNo === getReceiptNo(sale)) && vr.status === 'pending'))) {
    showToast('A void request for this receipt is already pending Admin approval.', 'warning');
    closeModal();
    return;
  }

  if (norm === 'voided') {
    showToast('This transaction has already been voided.', 'error');
    closeModal();
    return;
  }

  const btn = document.getElementById('btn-submit-void-request');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Submitting Request…';
  }

  const receiptNo = getReceiptNo(sale);
  const now = nowISO();
  const cashierId = (currentUser && currentUser.id) || sale.cashierId || 'cashier';
  const cashierName = (currentUser && currentUser.name) || sale.cashierName || 'Cashier';
  let voidReqId = uid('vr');

  // Submit via backend API (authoritatively updates sales, void_requests, and audit_logs)
  try {
    const vrResp = await fetch('api/void.php?action=submit_request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saleId: sale.id,
        reason: reason,
        explanation: explanation
      })
    });
    const vrData = await vrResp.json().catch(() => ({}));
    if (!vrResp.ok || !vrData.success) {
      showToast(vrData.error || ('Failed to submit void request (HTTP ' + vrResp.status + ').'), 'error');
      return;
    }
    if (vrData.voidRequestId) {
      voidReqId = vrData.voidRequestId;
    }
  } catch (err) {
    showToast('Could not connect to server to submit void request.', 'error');
    return;
  }

  // Reload authoritative state from database so no duplicate audit/records are written
  await loadDB();
  closeModal();
  renderSalesHistoryTable(true);
  if (typeof updateNavBadges === 'function') updateNavBadges();
  showToast(`Void request for Receipt ${receiptNo} submitted for Admin approval. Transaction set to Pending Void Approval.`, 'info');
}

function openVoidDetailsModal(saleId) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale) {
    showToast('Transaction record not found.', 'error');
    return;
  }

  const receiptNo = getReceiptNo(sale);
  const norm = normalizeSaleStatus(sale.status);
  const vr = (Array.isArray(db.voidRequests) ? db.voidRequests : []).find(v => v.saleId === sale.id || v.receiptNo === receiptNo) || {};
  const reason = sale.voidReason || vr.reason || 'N/A';
  const explanation = sale.voidExplanation || vr.explanation || 'None provided';
  const requestedBy = sale.voidRequestedBy || vr.cashierName || sale.cashierName || 'Cashier';
  const requestedAt = sale.voidRequestedAt || vr.date || vr.requestDate || sale.date;

  const isAdmin = currentUser && currentUser.role === 'admin';

  let decisionBoxHtml = '';
  if (norm === 'pending_void') {
    decisionBoxHtml = `
      <div style="background:var(--warning-bg); border:1.5px solid var(--warning-border); border-radius:8px; padding:12px 14px;">
        <div style="display:flex; align-items:center; gap:8px; font-weight:700; color:var(--warning-text); font-size:13px;">
          <span>⏳ Awaiting Administrator Review</span>
        </div>
        <p style="margin:4px 0 0; font-size:12px; color:var(--warning-text);">
          This void request is currently queued in the <b>Pending Approvals Hub</b>. No inventory has been restored yet.
        </p>
        ${isAdmin ? `
          <div style="margin-top:10px;">
            <button class="btn small" onclick="closeModal(); goToApprovalsTab('voidRequests');" style="background:var(--teal); color:#fff; font-size:12px;">
              ⚖️ Open in Pending Approvals Hub &rarr;
            </button>
          </div>
        ` : ''}
      </div>
    `;
  } else if (norm === 'voided') {
    const adminName = sale.voidedBy || vr.reviewedBy || 'Administrator';
    const decisionDate = sale.voidedAt || vr.reviewedAt;
    const remarks = sale.voidAdminRemarks || vr.adminRemarks;
    decisionBoxHtml = `
      <div style="background:var(--success-bg); border:1.5px solid var(--success-border); border-radius:8px; padding:12px 14px;">
        <div style="display:flex; align-items:center; gap:8px; font-weight:700; color:var(--success-text); font-size:13px;">
          <span>✅ Void Request Approved</span>
        </div>
        <div style="margin-top:6px; font-size:12px; color:var(--success-text); line-height:1.5;">
          <div><b>Authorized by Administrator:</b> ${escapeHtml(adminName)}</div>
          <div><b>Approval Date &amp; Time:</b> ${decisionDate ? formatDateTime(decisionDate) : 'Recorded'}</div>
          <div><b>Inventory Restoration:</b> Eligible sealed merchandise restored to active stock exactly once. Custom-mix items quarantined per store policy.</div>
          ${remarks ? `<div style="margin-top:4px;"><b>Admin Remarks:</b> <span style="font-style:italic;">"${escapeHtml(remarks)}"</span></div>` : ''}
        </div>
      </div>
    `;
  } else if (norm === 'void_rejected') {
    const adminName = sale.voidRejectedBy || vr.reviewedBy || 'Administrator';
    const decisionDate = sale.voidRejectedAt || vr.reviewedAt;
    const remarks = sale.voidAdminRemarks || sale.voidRejectReason || vr.adminRemarks || 'Void request was not approved by administration';
    decisionBoxHtml = `
      <div style="background:var(--danger-bg); border:1.5px solid var(--danger-border); border-radius:8px; padding:12px 14px;">
        <div style="display:flex; align-items:center; gap:8px; font-weight:700; color:var(--danger-text); font-size:13px;">
          <span>✕ Void Request Rejected</span>
        </div>
        <div style="margin-top:6px; font-size:12px; color:var(--danger-text); line-height:1.5;">
          <div><b>Reviewed by Administrator:</b> ${escapeHtml(adminName)}</div>
          <div><b>Decision Date &amp; Time:</b> ${decisionDate ? formatDateTime(decisionDate) : 'Recorded'}</div>
          <div><b>Original Sale Status:</b> Maintained as Completed. Store merchandise remains sold; no inventory was restored.</div>
          <div style="margin-top:4px; background:var(--surface); border:1px solid var(--danger-border); border-radius:4px; padding:6px 10px;">
            <b>Admin Rejection Reason:</b> <span style="color:var(--danger-text); font-weight:600;">"${escapeHtml(remarks)}"</span>
          </div>
        </div>
      </div>
    `;
  }

  const items = Array.isArray(sale.items) ? sale.items : [];
  const itemsListHtml = items.map(it => {
    const size = Number(it.size) || 1;
    const qty = Number(it.qty) || 1;
    const isMix = it.type === 'colormix';
    const sizeStr = !isMix ? `${size}L` : `${formatStock(it.liters || qty)}L`;
    return `
      <tr style="border-bottom:1px solid var(--line-light);">
        <td style="padding:5px 8px; font-weight:600;">${escapeHtml(it.name)}${isMix ? ' (Custom Mix)' : ''}</td>
        <td style="padding:5px 8px; text-align:center;">${sizeStr}</td>
        <td style="padding:5px 8px; text-align:center; font-weight:700;">${qty}</td>
        <td style="padding:5px 8px; text-align:right; font-family:'Space Grotesk',monospace;">${peso(it.lineTotal)}</td>
      </tr>
    `;
  }).join('');

  const bodyHtml = `
    <div style="display:flex; flex-direction:column; gap:14px; max-width:560px;">
      ${decisionBoxHtml}

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; background:var(--surface-2); border:1px solid var(--line); border-radius:6px; padding:10px 14px; font-size:12px;">
        <div>
          <div class="muted small" style="text-transform:uppercase; font-size:10px; font-weight:700;">Receipt Number</div>
          <div style="font-weight:700; color:var(--teal-text); font-size:13px;"><code style="font-size:12.5px;">${escapeHtml(receiptNo)}</code></div>
        </div>
        <div>
          <div class="muted small" style="text-transform:uppercase; font-size:10px; font-weight:700;">Transaction Total</div>
          <div style="font-family:'Space Grotesk',monospace; font-weight:700; font-size:13px;">${peso(sale.total)}</div>
        </div>
        <div>
          <div class="muted small" style="text-transform:uppercase; font-size:10px; font-weight:700;">Requesting Cashier</div>
          <div style="font-weight:600;">${escapeHtml(requestedBy)}</div>
        </div>
        <div>
          <div class="muted small" style="text-transform:uppercase; font-size:10px; font-weight:700;">Submitted At</div>
          <div>${requestedAt ? formatDateTime(requestedAt) : 'N/A'}</div>
        </div>
      </div>

      <div style="border:1px solid var(--line); border-radius:6px; padding:10px 14px; background:var(--surface);">
        <div style="font-weight:700; font-size:12px; color:var(--ink-soft); text-transform:uppercase; margin-bottom:4px;">Void Reason &amp; Cashier Explanation</div>
        <div style="font-size:13px; font-weight:700; color:var(--danger);">${escapeHtml(reason)}</div>
        ${explanation ? `<div style="font-size:12px; color:var(--ink-soft); margin-top:4px; font-style:italic;">"${escapeHtml(explanation)}"</div>` : ''}
      </div>

      <div>
        <label style="font-size:11px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em;">Purchased Products (${items.length})</label>
        <div style="max-height:130px; overflow-y:auto; border:1px solid var(--line); border-radius:6px; margin-top:4px; background:var(--surface);">
          <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead style="background:var(--surface-2); border-bottom:1px solid var(--line);">
              <tr>
                <th style="padding:5px 8px; text-align:left;">Item</th>
                <th style="padding:5px 8px; text-align:center;">Size</th>
                <th style="padding:5px 8px; text-align:center;">Qty</th>
                <th style="padding:5px 8px; text-align:right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsListHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const footHtml = `
    <button type="button" class="btn secondary" onclick="closeModal()">Close</button>
  `;

  openModal(`📋 Void Details — ${escapeHtml(receiptNo)}`, bodyHtml, footHtml, 'void-details-modal');
}

// Global execution functions for Admin Approvals Hub & Void Requests
async function executeApproveVoid(vrId, remarks = '') {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Access denied: Only Administrators can approve void requests.', 'error');
    return false;
  }

  const vr = (Array.isArray(db.voidRequests) ? db.voidRequests : []).find(v => v.id === vrId);
  const sale = (db.sales || []).find(s => (vr && s.id === vr.saleId) || s.id === vrId || getReceiptNo(s) === vrId);

  if (!sale) {
    showToast('Sale transaction record not found.', 'error');
    return false;
  }

  // Idempotency: Restores eligible quantities exactly once!
  if (sale.voidInventoryRestored || normalizeSaleStatus(sale.status) === 'voided') {
    showToast('This transaction has already been voided and inventory restored.', 'warning');
    return false;
  }

  const receiptNo = getReceiptNo(sale);
  const items = Array.isArray(sale.items) ? sale.items : [];
  const adminName = currentUser.name;
  const now = nowISO();
  const revertSummary = [];

  // Attempt backend API approval first
  try {
    const res = await fetch('api/void.php?action=approve_request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voidRequestId: vr ? vr.id : sale.voidRequestId,
        adminRemarks: remarks
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      showToast(data.error || ('Void approval failed (HTTP ' + res.status + ').'), 'error');
      return;
    }
  } catch (err) {
    showToast('Could not connect to server to approve void request.', 'error');
    return;
  }

  // Reload authoritative state from MySQL (api/void.php already restored inventory, batches, movements, and audit logs atomically)
  await loadDB();
  if (typeof EXP !== 'undefined') { EXP.loaded = false; EXP.summaryTs = 0; }
  if (typeof posBatchStatusLoadedAt !== 'undefined') posBatchStatusLoadedAt = 0;
  if (typeof broadcastDbUpdate === 'function') broadcastDbUpdate();
  if (typeof updateNavBadges === 'function') updateNavBadges();
  if (typeof renderSalesHistoryTable === 'function') renderSalesHistoryTable(true);
  if (typeof refreshApprovalsTabContent === 'function') refreshApprovalsTabContent();
  showToast(`Receipt ${receiptNo} has been successfully voided and inventory restored.`, 'success');
  return true;
}

async function executeRejectVoid(vrId, rejectNote = '') {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Access denied: Only Administrators can reject void requests.', 'error');
    return false;
  }

  const note = String(rejectNote || '').trim();
  if (!note) {
    showToast('Administrator rejection reason or note is required.', 'error');
    return false;
  }

  const vr = (Array.isArray(db.voidRequests) ? db.voidRequests : []).find(v => v.id === vrId);
  const sale = (db.sales || []).find(s => (vr && s.id === vr.saleId) || s.id === vrId || getReceiptNo(s) === vrId);

  if (!sale) {
    showToast('Sale transaction record not found.', 'error');
    return false;
  }

  const receiptNo = getReceiptNo(sale);
  const adminName = currentUser.name;
  const now = nowISO();

  // Attempt backend API rejection first
  try {
    const res = await fetch('api/void.php?action=reject_request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voidRequestId: vr ? vr.id : sale.voidRequestId,
        rejectionReason: note
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      showToast(data.error || ('Void rejection failed (HTTP ' + res.status + ').'), 'error');
      return;
    }
  } catch (err) {
    showToast('Could not connect to server to reject void request.', 'error');
    return;
  }

  // Reload authoritative state from MySQL (api/void.php already updated sales, void_requests, and audit_logs)
  await loadDB();
  if (typeof broadcastDbUpdate === 'function') broadcastDbUpdate();
  if (typeof updateNavBadges === 'function') updateNavBadges();
  if (typeof renderSalesHistoryTable === 'function') renderSalesHistoryTable(true);
  if (typeof refreshApprovalsTabContent === 'function') refreshApprovalsTabContent();
  showToast(`Void request for Receipt ${receiptNo} rejected. Original transaction kept completed.`, 'info');
  return true;
}

/* ============================================================
   RETURN & EXCHANGE MODAL WORKFLOW
   ============================================================ */

function getItemReturnPolicy(item, isSameDay, isAdminApproved = false) {
  const isBlend = item.type === 'colormix';
  const paintClass = isBlend ? 'Custom Mixed-Color Paint' : 'Single-Color Paint';

  // 1. Custom Mixed-Color Paint Policy:
  // Strictly Final Sale (non-returnable & non-exchangeable) because the paint formula has already been mixed / tinted.
  // Exception only allowed under Administrator Review (e.g. store mixing error or statutory consumer remedy).
  if (isBlend) {
    if (isAdminApproved) {
      return {
        isSameDay,
        paintClass,
        isBlend: true,
        eligible: true,
        allowedResolutions: ['replacement', 'refund'],
        badgeClass: 'badge ok',
        badgeText: '🛡️ Admin Approved Exception (Mixing Error Remedy)',
        policyText: 'Authorized Exception: Return / exchange approved under Administrator Review for verified store mixing error, off-shade formula, or statutory consumer remedy.',
        restricted: false,
        requiresAdminReview: false,
        restockableIfSealed: false // NEVER restocked into regular sealed base inventory
      };
    }

    return {
      isSameDay,
      paintClass,
      isBlend: true,
      eligible: false,
      allowedResolutions: [],
      badgeClass: 'badge low',
      badgeText: '🔒 Final Sale — Non-Returnable / Non-Exchangeable (Custom Mixed)',
      policyText: 'Strict Policy: Custom Color Mixed paints are strictly non-returnable and non-exchangeable once mixed because the paint formula has already been tinted.',
      restrictedReason: 'Custom Color Mix items cannot be returned or exchanged because the paint has already been tinted and cannot be restocked into base inventory or resold.',
      restricted: true,
      requiresAdminReview: true,
      restockableIfSealed: false
    };
  }

  // 2. Single-Color Paint Policy:
  // Same-Day Return
  if (isSameDay) {
    return {
      isSameDay: true,
      paintClass,
      isBlend: false,
      eligible: true,
      allowedResolutions: ['replacement', 'refund'],
      badgeClass: 'badge ok',
      badgeText: '✓ Same-Day Return Eligible',
      policyText: 'Same-Day Policy: Single-color paint is eligible for refund or replacement if returned within the same calendar day of purchase, subject to product inspection and authorized approval.',
      restricted: false,
      requiresAdminReview: false,
      restockableIfSealed: true
    };
  }

  // Single-Color Paint – After Purchase Day
  return {
    isSameDay: false,
    paintClass,
    isBlend: false,
    eligible: true,
    allowedResolutions: isAdminApproved ? ['replacement', 'refund'] : ['replacement'],
    badgeClass: 'badge mid',
    badgeText: '🔄 Replacement Only (After Purchase Day)',
    policyText: 'After Purchase Day Policy: Single-color paint is eligible for replacement only (same product or eligible alternative). Ordinary cash refunds are not offered under standard store policy.',
    restrictedReason: 'Ordinary cash refunds are restricted after purchase day under standard policy. Replacement is available, or Admin Review for exceptional refund requests.',
    restricted: false,
    requiresAdminReview: false,
    restockableIfSealed: true
  };
}

function openReturnRefundModal(saleId, keepState = false) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale) return;
  if (currentUser && currentUser.role === 'cashier' && !isCurrentUserSale(sale)) {
    showToast('Access denied: You can only process returns or exchanges on your own transactions.', 'error');
    return;
  }

  const onlyMix = saleHasOnlyCustomMixItems(sale);
  const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager');

  if (onlyMix && !isAdmin && !adminReviewApproved) {
    showToast('Custom Color Mix items cannot be returned or exchanged once mixed (Final Sale).', 'error');
    return;
  }

  if (!hasSaleReturnableItems(sale, true)) {
    showToast('All items from this transaction have already been returned or exchanged.', 'error');
    return;
  }

  const isSameDay = isSaleReturnWithinDay(sale);

  // Preserve previous input quantities if keepState is true
  const prevInputs = {};
  if (keepState) {
    (sale.items || []).forEach((_, idx) => {
      const el = document.getElementById(`ret-qty-input-${idx}`);
      if (el) prevInputs[idx] = parseFloat(el.value) || 0;
    });
  } else {
    returnExchangeCart = [];
    openExchangePickerRow = null;
    exchangePickerTab = 'recommended';
    exchangePickerQuery = '';
    returnItemConditions = {};
    adminReviewApproved = false;
    adminReviewReason = '';
    adminReviewAdminName = '';
    currentReturnResolution = 'exchange';
  }

  const canRefund = isSameDay || adminReviewApproved;
  if (currentReturnResolution === 'refund' && !canRefund) {
    currentReturnResolution = 'exchange';
  }

  const receiptNo = getReceiptNo(sale);
  const saleItems = Array.isArray(sale.items) ? sale.items : [];
  const hasColorMixItems = saleItems.some(it => it.type === 'colormix');
  const anyRestrictedMixItems = hasColorMixItems;

  const saleSubtotal = Number(sale.subtotal || 0);
  const saleTotal = Number(sale.total || 0);
  const saleDiscountPct = Number(sale.discountPct || sale.discountPercentage || 0);
  const saleDiscountAmount = Number(sale.discountAmount ?? sale.discount ?? 0);
  const salePricingType = sale.pricingType || sale.pricing_type || 'inclusive';
  const saleTaxStatus = sale.taxStatus || sale.tax_status || 'vat_registered';
  const saleVatRate = Number(sale.vatRate ?? sale.vat_rate ?? 12);
  const isExclusiveVat = salePricingType === 'exclusive' && saleTaxStatus === 'vat_registered' && saleVatRate > 0;

  // Bulk promo discounts never stack on Near-Expiry discounted items (see pos.js cartTotals).
  // Compute promo discount ratio strictly against promo-eligible (non-near-expiry) items.
  const promoEligibleSubtotal = Number(
    saleItems.reduce((sum, it) => {
      if (Number(it.nearExpiryDiscountPct || 0) > 0) return sum;
      const lineAmt = it.lineTotal !== undefined
        ? Number(it.lineTotal || 0)
        : (Number(it.qty || 0) * Number(it.unitPrice ?? it.price ?? 0));
      return sum + (Number.isFinite(lineAmt) ? lineAmt : 0);
    }, 0).toFixed(2)
  );
  let promoItemDiscountRatio = 1;
  if (promoEligibleSubtotal > 0 && saleDiscountAmount > 0) {
    promoItemDiscountRatio = Math.max(0, 1 - (saleDiscountAmount / promoEligibleSubtotal));
  } else if (saleDiscountPct > 0) {
    promoItemDiscountRatio = Math.max(0, 1 - saleDiscountPct / 100);
  } else if (!isExclusiveVat && saleSubtotal > 0 && saleTotal > 0 && saleTotal < saleSubtotal) {
    const inferredDiscount = saleSubtotal - saleTotal;
    promoItemDiscountRatio = promoEligibleSubtotal > 0
      ? Math.max(0, 1 - (inferredDiscount / promoEligibleSubtotal))
      : (saleTotal / saleSubtotal);
  }

  const rowsHtml = saleItems.map((item, idx) => {
    const qtyPurchased = Number(item.qty || 0);
    const qtyReturned = Number(item.returnedQty || 0);
    const returnable = Math.max(0, Number((qtyPurchased - qtyReturned).toFixed(2)));

    const rawUnitPrice = Number(item.unitPrice !== undefined ? item.unitPrice : (item.price !== undefined ? item.price : (Number(item.lineTotal || 0) / Math.max(1, Number(item.qty || 1))))) || 0;
    const itemProd = item.type === 'product' ? productById(item.productId) : null;
    const itemTaxClass = item.taxClassification || item.tax_classification || (itemProd && (itemProd.taxClassification || itemProd.tax_classification)) || 'vatable';
    const vatMult = (isExclusiveVat && itemTaxClass === 'vatable') ? (1 + saleVatRate / 100) : 1;
    const isNearExpiryItem = Number(item.nearExpiryDiscountPct || 0) > 0;
    const itemDiscountRatio = isNearExpiryItem ? 1 : promoItemDiscountRatio;
    const effectiveUnitPrice = Number((rawUnitPrice * itemDiscountRatio * vatMult).toFixed(2));

    const isBlend = item.type === 'colormix';
    const policy = getItemReturnPolicy(item, isSameDay, adminReviewApproved);
    const hex = isBlend ? (item.hexColor || '#1F6F6B') : getProductHex(productById(item.productId));
    const sizeStr = item.size ? ` · Size: <b>${item.size}L</b>` : (item.liters ? ` · Volume: <b>${item.liters}L</b>` : '');
    const formulaStr = isBlend && Array.isArray(item.components) && item.components.length
      ? `<div class="muted small" style="font-size:11px; margin-top:2px;">Formula: ${item.components.map(cp => `${cp.percentage}% ${escapeHtml(cp.name)} (${formatStock(cp.liters)}L)`).join(' + ')}</div>`
      : '';

    if (!returnItemConditions[idx]) {
      returnItemConditions[idx] = 'sealed';
    }
    const cond = returnItemConditions[idx];

    const desc = isBlend
      ? `<div>
           <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
             <span class="cm-color-dot" style="background:${escapeHtml(hex)}; width:13px; height:13px; display:inline-block; border-radius:50%; border:1px solid rgba(0,0,0,0.18);"></span>
             <b>${escapeHtml(item.name)}</b> — <b>${escapeHtml(item.colorName || 'Custom Shade')}</b>
             <span class="badge mid" style="font-size:10px; padding:1px 6px;">🎨 ${escapeHtml(policy.paintClass)}</span>
           </div>
           <div class="muted small" style="margin-top:2px;">Custom Tint Mixture${sizeStr}</div>
           ${formulaStr}
           <div style="margin-top:4px;">
             <span class="${policy.badgeClass}" style="font-size:10px; padding:1px 6px;">${policy.badgeText}</span>
             <div class="muted small" style="font-size:11px; margin-top:2px;">${policy.policyText}</div>
             ${policy.restricted && !adminReviewApproved ? `<div style="color:var(--danger); font-size:11px; font-weight:600; margin-top:2px;">⚠️ ${policy.restrictedReason}</div>` : ''}
           </div>
         </div>`
      : `<div>
           <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
             <b>${escapeHtml(item.name)}</b>
             ${hex ? `<code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal-text);">(${hex})</code>` : ''}
             ${item.color && item.color !== '-' ? `(${escapeHtml(item.color)})` : ''}
             <span class="badge ghost" style="font-size:10px; padding:1px 6px;">🥫 ${escapeHtml(policy.paintClass)}</span>
           </div>
           <div class="muted small">${escapeHtml(item.brand || '')}${sizeStr}</div>
           <div style="margin-top:4px;">
             <span class="${policy.badgeClass}" style="font-size:10px; padding:1px 6px;">${policy.badgeText}</span>
             <div class="muted small" style="font-size:11px; margin-top:2px;">${policy.policyText}</div>
           </div>
         </div>`;

    const isInputDisabled = returnable <= 0 || (policy.restricted && !adminReviewApproved);
    const initVal = prevInputs[idx] !== undefined ? Math.min(prevInputs[idx], returnable) : 0;

    return `
    <tr data-ret-row="${idx}" style="${isBlend ? 'background:var(--surface-2);' : ''}">
      <td style="vertical-align:top; padding:10px 8px;">${desc}</td>
      <td class="right" style="vertical-align:top; padding:10px 8px;">${formatStock(qtyPurchased)}${isBlend ? 'L' : ''}</td>
      <td class="right" style="vertical-align:top; padding:10px 8px; color:var(--ink-soft);">${formatStock(qtyReturned)}${isBlend ? 'L' : ''}</td>
      <td class="right" style="vertical-align:top; padding:10px 8px; font-weight:700; color:${returnable > 0 ? 'var(--teal)' : 'var(--ink-soft)'};" id="ret-max-${idx}">
        ${formatStock(returnable)}${isBlend ? 'L' : ''}
      </td>
      <td class="right" style="vertical-align:top; padding:10px 8px; font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; font-size:12.5px;">
        ${peso(effectiveUnitPrice)}
      </td>
      <td style="vertical-align:top; padding:10px 8px; width:140px;">
        <select id="ret-condition-${idx}" class="input" style="width:100%; font-size:11.5px; padding:3px 5px;"
          ${returnable <= 0 ? 'disabled' : ''}
          onchange="onReturnConditionChange('${sale.id}', ${idx}, this.value)">
          <option value="sealed" ${cond === 'sealed' ? 'selected' : ''}>🟢 Sealed / Undamaged</option>
          <option value="opened" ${cond === 'opened' ? 'selected' : ''}>🟡 Opened / Unsealed</option>
          <option value="defective" ${cond === 'defective' ? 'selected' : ''}>🔴 Defective / Damaged</option>
        </select>
        <div class="muted small" style="font-size:10.5px; margin-top:2px;">Inspection condition</div>
      </td>
      <td style="vertical-align:top; padding:10px 8px; width:125px;">
        <div style="display:flex; gap:4px; align-items:center;">
          <input type="number" id="ret-qty-input-${idx}" min="0" max="${returnable}" step="any" value="${initVal}"
            style="width:70px; text-align:right; font-weight:700; font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;"
            ${isInputDisabled ? 'disabled' : ''}
            data-is-colormix="${isBlend ? '1' : '0'}"
            data-unit-price="${effectiveUnitPrice}"
            data-max="${returnable}"
            oninput="onReturnQtyInput('${sale.id}', ${idx})">
          ${returnable > 0 && !isInputDisabled ? `
            <button type="button" id="ret-max-btn-${idx}" class="btn ghost small" style="padding:2px 5px; font-size:11px;" onclick="fillMaxReturnLine('${sale.id}', ${idx})">Max</button>
          ` : ''}
        </div>
      </td>
      <td class="right" style="vertical-align:top; padding:10px 8px; font-weight:700; font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; color:var(--danger);" id="ret-line-total-${idx}">
        ${peso(initVal * effectiveUnitPrice)}
      </td>
    </tr>`;
  }).join('');

  openModal(`↩️ Return &amp; Exchange — ${escapeHtml(receiptNo)}`, `
    <!-- RECEIPT & POLICY HEADER -->
    <div style="background:var(--surface-2); border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:14px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;">
      <div>
        <div>
          <span class="muted">Receipt #:</span> <code style="font-weight:700; color:var(--teal-text);">${escapeHtml(receiptNo)}</code>
          ${isSameDay
      ? `<span class="badge ok" style="font-size:10.5px; margin-left:6px;">✓ Same-Day Return Eligible</span>`
      : `<span class="badge mid" style="font-size:10.5px; margin-left:6px;">🔄 Post-Purchase Return (Replacement Only)</span>`}
          ${adminReviewApproved ? `<span class="badge ok" style="font-size:10.5px; margin-left:4px;">🛡️ Exception Approved</span>` : ''}
        </div>
        ${sale.customerName ? `<div style="margin-top:2px;"><span class="muted">Customer:</span> <b>${escapeHtml(sale.customerName)}</b></div>` : ''}
      </div>
      <div>
        <div><span class="muted">Date of Sale:</span> <b>${formatDateTime(sale.date)}</b></div>
        <div><span class="muted">Current Return Date:</span> <b>${formatDateTime(nowISO())}</b></div>
        <div><span class="muted">Original Sale Total:</span> <b>${peso(sale.total)}</b></div>
      </div>
    </div>

    <!-- RESOLUTION SELECTOR (REPLACEMENT VS REFUND) -->
    <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <div>
        <span style="font-weight:700; font-size:13px; color:var(--ink);">Approved Resolution Option:</span>
        <div class="muted small" style="font-size:11.5px;">
          ${isSameDay
      ? 'Same-day purchases are eligible for Replacement (exchange) or Tender Refund.'
      : (adminReviewApproved
        ? 'Administrator exception active: Replacement or Refund authorized.'
        : 'Standard store policy: Single-color paint is eligible for Replacement only; ordinary cash refunds are restricted.')}
        </div>
      </div>
      <div style="display:flex; gap:16px; align-items:center;">
        <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-weight:700; font-size:13px; color:var(--ink); margin:0;">
          <input type="radio" name="ret-resolution-choice" value="exchange" ${currentReturnResolution === 'exchange' ? 'checked' : ''} onchange="onReturnResolutionChange('${sale.id}', 'exchange')">
          <span>🔄 Replacement (Exchange)</span>
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; cursor:${canRefund ? 'pointer' : 'not-allowed'}; font-weight:700; font-size:13px; color:${canRefund ? 'var(--ink)' : 'var(--ink-soft)'}; opacity:${canRefund ? '1' : '0.55'}; margin:0;">
          <input type="radio" name="ret-resolution-choice" value="refund" ${currentReturnResolution === 'refund' ? 'checked' : ''} ${canRefund ? '' : 'disabled'} onchange="onReturnResolutionChange('${sale.id}', 'refund')">
          <span>💵 Refund (Tender Credit)</span>
          ${!canRefund ? '<span class="badge low" style="font-size:10px; margin-left:4px;" title="Ordinary cash refund restricted after purchase day. Replacement only under standard store policy.">Restricted</span>' : ''}
        </label>
      </div>
    </div>

    <!-- STEP 1: ITEMS BEING RETURNED & PHYSICAL INSPECTION -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; flex-wrap:wrap;">
      <div>
        <strong style="font-size:13.5px; color:var(--ink);">1. Select Items Being Returned &amp; Inspect Condition</strong>
        <div class="muted small">Enter the return quantity and verify the physical condition of each paint container:</div>
      </div>
      <div class="row wrap" style="gap:6px;">
        <button type="button" class="btn secondary small" onclick="fillAllReturnLines('${sale.id}', true)">⚡ Return All Eligible</button>
        <button type="button" class="btn ghost small" onclick="fillAllReturnLines('${sale.id}', false)">Clear All</button>
      </div>
    </div>

    <div class="bulk-adj-wrap" style="max-height:240px; overflow-y:auto;">
      <table class="bulk-adj-table">
        <thead>
          <tr>
            <th>Item Purchased &amp; Classification</th>
            <th class="right">Sold</th>
            <th class="right">Returned</th>
            <th class="right">Returnable</th>
            <th class="right">Unit Credit</th>
            <th>Inspection Condition</th>
            <th class="right">Return Qty</th>
            <th class="right">Return Credit</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    <!-- PHYSICAL INSPECTION VERIFICATION (MANDATORY) -->
    <div id="ret-inspection-box" style="margin-top:12px; padding:10px 14px; background:var(--surface-2); border:1px solid var(--line); border-radius:var(--radius-sm); transition:all 0.15s ease;">
      <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; font-weight:700; font-size:12.5px; margin:0;">
        <input type="checkbox" id="ret-inspection-verified" style="margin-top:2px;" onchange="recalcReturnGrandTotal('${sale.id}')">
        <div>
          <span style="color:var(--ink);">🔍 Verified Physical Product Inspection Conducted <span style="color:var(--danger);">*</span></span>
          <div class="muted small" style="font-weight:400; margin-top:2px; font-size:11.5px;">
            Mandatory store policy check: Staff has physically examined the returned paint container(s), verified product condition, checked for opening/damage/defects, and validated the return reason.
          </div>
        </div>
      </label>
    </div>

    <!-- STEP 2: REPLACEMENT ITEMS FOR EXCHANGE (FLEXIBLE PRICE-DIFFERENCE SUPPORT) -->
    <div id="ret-exchange-step-container" style="margin-top:16px; padding:12px 14px; background:var(--teal-tint); border:1px solid var(--teal-tint-border); border-radius:var(--radius-sm);">
      <div class="ret-exchange-header" style="display:${currentReturnResolution === 'refund' ? 'none' : 'block'}; margin-bottom:10px;">
        <strong style="font-size:13.5px; color:var(--teal-text);">2. Replacement Item(s) for Exchange <span class="badge mid" style="font-size:10.5px; margin-left:6px;">🎨 Same Container Size · Price Difference Allowed</span></strong>
        <div class="muted small">Select any in-stock replacement product in the same container size. If the replacement costs more, the customer pays the balance; if it costs less, Administrator approval is required for the cash difference:</div>
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
          <option value="Statutory defect remedy (Consumer Protection Act)">Statutory defect remedy (Consumer Protection Act)</option>
          <option value="Other return / exchange reason">Other return / exchange reason</option>
        </select>
      </div>
      <div class="field">
        <label>Cashier / Manager Note (optional)</label>
        <input id="ret-note" type="text" placeholder="e.g. Unopened containers inspected, customer selected new shade">
      </div>
    </div>

    <!-- ADMIN AUTHORIZATION PANEL (Required for ALL Cash Refunds, Custom Mix, or Post-Purchase-Day Exceptions) -->
    ${(!(currentUser && currentUser.role === 'admin') || anyRestrictedMixItems || !isSameDay) ? `
      <div style="margin-top:10px; background:var(--warning-bg); border:1px solid var(--warning-border); border-radius:var(--radius-sm); padding:10px 14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="font-size:12px; color:var(--warning-text); font-weight:700;">
            🛡️ Administrator Authorization ${adminReviewApproved ? `<span class="badge ok" style="margin-left:6px;">✓ Authorized (${escapeHtml(adminReviewAdminName || 'Admin')})</span>` : '<span class="badge mid" style="margin-left:6px;">Required for Cash Refunds &amp; Exceptions</span>'}
          </div>
          ${adminReviewApproved ? `
            <button type="button" class="btn ghost small" onclick="cancelInlineAdminReview('${sale.id}')" style="font-size:11px;">Revoke Authorization</button>
          ` : `
            <button type="button" class="btn secondary small" onclick="toggleAdminReviewSection()" style="font-size:11px;">🔐 Admin Review / Authorize</button>
          `}
        </div>
        <div id="ret-admin-review-panel" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed var(--warning-border);">
          <div class="form-grid" style="gap:8px;">
            <div class="field">
              <label style="font-size:11px;">Exception Reason</label>
              <select id="ret-inline-admin-reason" style="font-size:12px;">
                <option value="Store mixing error / off-shade formula remedy">Store mixing error / off-shade formula remedy</option>
                <option value="Approved post-purchase-day defect remedy">Approved post-purchase-day defect remedy</option>
                <option value="Manager goodwill exception">Manager goodwill exception</option>
              </select>
            </div>
            <div class="field">
              <label style="font-size:11px;">Admin Remarks (optional)</label>
              <input id="ret-inline-admin-note" type="text" placeholder="e.g. Verified off-shade batch">
            </div>
            ${!(currentUser && currentUser.role === 'admin') ? `
              <div class="field">
                <label style="font-size:11px;">Admin Username</label>
                <input id="ret-inline-admin-user" type="text" placeholder="Admin username">
              </div>
              <div class="field">
                <label style="font-size:11px;">Admin Password</label>
                <input id="ret-inline-admin-pass" type="password" placeholder="Admin password">
              </div>
            ` : ''}
          </div>
          <div style="margin-top:8px; text-align:right;">
            <button type="button" class="btn small" id="btn-approve-inline-admin" onclick="submitInlineAdminReview('${sale.id}')">🔐 Authenticate &amp; Authorize</button>
          </div>
        </div>
      </div>
    ` : ''}

    <!-- INVENTORY RESTORATION DISPOSITION SECTION -->
    <div id="ret-restock-section" style="margin-top:10px; background:var(--surface-2); border:1px solid var(--teal-tint-border); border-radius:var(--radius-sm); padding:10px 14px;">
      <div style="font-weight:700; font-size:12px; color:var(--teal-text); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.03em;">
        📦 Inventory Restoration Handling
      </div>
      <div id="ret-restock-summary-text" class="small" style="font-size:11.5px; color:var(--ink);">
        <span class="muted">Enter return quantity above and select inspection condition to determine inventory restoration handling.</span>
      </div>
      <div style="margin-top:8px;">
        <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; font-weight:600; color:var(--ink); margin:0;">
          <input type="checkbox" id="ret-restock" disabled>
          <span>Restock verified sealed &amp; undamaged single-color paint into sellable inventory</span>
        </label>
      </div>
    </div>

    <!-- SETTLEMENT SUMMARY -->
    <div style="margin-top:14px; padding:12px 14px; background:var(--surface-2); border:1px dashed var(--line); border-radius:var(--radius-sm); display:flex; flex-direction:column; gap:6px;">
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
        <span class="muted">Return Credit (Returned Items):</span>
        <strong id="ret-grand-total" style="font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; color:var(--danger);">₱0.00</strong>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
        <span class="muted">Replacement Items Value (Exchange):</span>
        <strong id="ret-exchange-total" style="font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; color:var(--teal-text);">₱0.00</strong>
      </div>
      <div style="border-top:1px solid var(--line); padding-top:8px; margin-top:2px; display:flex; justify-content:space-between; align-items:center;">
        <span id="ret-settlement-label" style="font-size:14px; font-weight:700;">Exchange Balance / Settlement:</span>
        <span id="ret-settlement-value" style="font-size:18px; font-weight:700; color:var(--ink); font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;">₱0.00</span>
      </div>
    </div>
  `, `
    <button class="btn secondary" onclick="closeModal()">Cancel</button>
    <button class="btn" id="btn-submit-return" onclick="processSaleReturn('${sale.id}')" disabled style="background:var(--surface-3); color:var(--ink-soft); border-color:var(--line); cursor:not-allowed; opacity:0.65; box-shadow:none;">Confirm Return &amp; Exchange</button>
  `, 'wide');

  if (currentReturnResolution === 'exchange') {
    syncFixedExchangeLines(sale.id);
  } else {
    renderExchangeReplacementCart(sale.id);
  }
  recalcReturnGrandTotal(sale.id);
}

const openReturnExchangeModal = openReturnRefundModal;

function onReturnResolutionChange(saleId, resolution) {
  currentReturnResolution = resolution;
  const exWrap = document.getElementById('ret-exchange-step-container');
  if (exWrap) {
    const exHeader = exWrap.querySelector('.ret-exchange-header');
    if (exHeader) {
      exHeader.style.display = resolution === 'refund' ? 'none' : 'block';
    }
  }
  if (resolution === 'exchange') {
    syncFixedExchangeLines(saleId);
  } else {
    returnExchangeCart = [];
    renderExchangeReplacementCart(saleId);
  }
  recalcReturnGrandTotal(saleId);
}

function onReturnConditionChange(saleId, idx, condition) {
  returnItemConditions[idx] = condition;
  const reasonSel = document.getElementById('ret-reason');
  if (condition === 'defective' && reasonSel && (reasonSel.value.includes('different color') || reasonSel.value.includes('excess paint'))) {
    reasonSel.value = 'Defective / damaged product container (Replace)';
  }
  updateRestockSummary(saleId);
  recalcReturnGrandTotal(saleId);
}

function toggleAdminReviewSection() {
  const panel = document.getElementById('ret-admin-review-panel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

async function submitInlineAdminReview(saleId) {
  const reasonSel = document.getElementById('ret-inline-admin-reason');
  const noteEl = document.getElementById('ret-inline-admin-note');
  const userEl = document.getElementById('ret-inline-admin-user');
  const passEl = document.getElementById('ret-inline-admin-pass');
  const btn = document.getElementById('btn-approve-inline-admin');

  const reason = reasonSel ? reasonSel.value : 'Authorized exception';
  const note = noteEl ? noteEl.value.trim() : '';
  const fullReason = note ? `${reason} — ${note}` : reason;

  const isAdmin = currentUser && currentUser.role === 'admin';
  let adminName = isAdmin ? currentUser.name : '';

  if (!isAdmin) {
    const username = userEl ? userEl.value.trim() : '';
    const password = passEl ? passEl.value : '';
    if (!username || !password) {
      showToast('Please enter administrator username and password.', 'error');
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Verifying Admin…';
    }
    try {
      const res = await fetch('api/auth.php?action=verify_admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid administrator credentials.');
      }
      adminName = data.admin.name;
      window._adminVerifyToken = data.verifyToken || '';
    } catch (err) {
      showToast(err.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔐 Authenticate & Authorize';
      }
      return;
    }
  }

  adminReviewApproved = true;
  adminReviewReason = fullReason;
  adminReviewAdminName = adminName;
  showToast(`Admin Review Exception authorized by ${adminName}.`, 'ok');

  openReturnRefundModal(saleId, true);
}

function cancelInlineAdminReview(saleId) {
  adminReviewApproved = false;
  adminReviewReason = '';
  adminReviewAdminName = '';
  window._adminVerifyToken = '';
  showToast('Admin review exception revoked.', 'ok');
  openReturnRefundModal(saleId, true);
}

function getReplacementUnitPriceForSize(p, fixedSize, origProductId, origUnitPrice, sale) {
  if (!p) return 0;
  if (origProductId && p.id === origProductId && origUnitPrice !== undefined) {
    return Number(Number(origUnitPrice).toFixed(2));
  }
  const sz = Number(fixedSize) || 1;
  const variant = typeof productSizeVariantBySize === 'function' ? productSizeVariantBySize(p, sz) : null;
  let raw = (variant && variant.pricePerCan !== undefined && Number(variant.pricePerCan) > 0)
    ? Number(variant.pricePerCan)
    : Number(p.price || 0) * sz;
  // Align replacement pricing with the original sale's promo discount and VAT-exclusive multiplier
  if (sale) {
    const discPct = Number(sale.discountPct || sale.discountPercentage || 0);
    if (discPct > 0 && discPct <= 100) {
      raw = raw * (1 - discPct / 100);
    }
    const taxStatus = String(sale.taxStatus || sale.tax_status || 'vat_registered').toLowerCase();
    const pricingType = String(sale.pricingType || sale.pricing_type || 'inclusive').toLowerCase();
    const vatRate = Number(sale.vatRate ?? sale.vat_rate ?? 12);
    const prodTaxClass = String(p.taxClassification || p.tax_classification || 'vatable').toLowerCase();
    if (taxStatus === 'vat_registered' && pricingType === 'exclusive' && prodTaxClass === 'vatable' && vatRate > 0) {
      raw = raw * (1 + vatRate / 100);
    }
  }
  return Number(raw.toFixed(2));
}

function isSameReplacementPrice(p, fixedSize, origProductId, origUnitPrice) {
  if (!p) return false;
  const sz = Number(fixedSize) || 1;
  if (typeof productHasSize === 'function' && !productHasSize(p, sz)) return false;
  const unitP = getReplacementUnitPriceForSize(p, sz, origProductId, origUnitPrice);
  return unitP > 0;
}

function syncFixedExchangeLines(saleId) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale) return;

  if (currentReturnResolution === 'refund') {
    returnExchangeCart = [];
    renderExchangeReplacementCart(saleId);
    return;
  }

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

      if (p && !isSameReplacementPrice(p, fixedSize, item.productId, effectiveUnitPrice)) {
        p = productById(item.productId);
      }

      // If original product isn't found or has insufficient non-expired sellable stock, fallback to first active product with enough sellable stock of fixedSize
      const origHasSellable = p && productSellableStock(p) >= fixedQty * fixedSize
        && (!productHasCanBreakdown(p) || productSellableCanCount(p, fixedSize) >= fixedQty);
      if (!origHasSellable) {
        const fallback = activeProducts().find(cand => {
          if (!isSameReplacementPrice(cand, fixedSize, item.productId, effectiveUnitPrice)) return false;
          if (productSellableStock(cand) < fixedQty * fixedSize) return false;
          if (productHasCanBreakdown(cand) && productSellableCanCount(cand, fixedSize) < fixedQty) return false;
          return true;
        });
        if (fallback) {
          p = fallback;
        }
      }

      if (p) {
        const unitPrice = getReplacementUnitPriceForSize(p, fixedSize, item.productId, effectiveUnitPrice, sale);
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

  if (!isSameReplacementPrice(p, fixedSize, line.origProductId, line.origUnitPrice)) {
    showToast(`Replacement product must be available in ${fixedSize}L container size with a valid selling price.`, 'error');
    return;
  }

  if (productSellableStock(p) < fixedQty * fixedSize) {
    showToast(`Not enough sellable (non-expired) stock for ${p.name} (${formatLiters(productSellableStock(p))} available, need ${fixedQty * fixedSize}L).`, 'error');
    return;
  }
  if (productHasCanBreakdown(p) && productSellableCanCount(p, fixedSize) < fixedQty) {
    showToast(`Only ${productSellableCanCount(p, fixedSize)} sellable × ${fixedSize}L unit(s) in stock for ${p.name} (need ${fixedQty}).`, 'error');
    return;
  }

  const sale = (db.sales || []).find(s => s.id === saleId) || null;
  const variant = productSizeVariantBySize(p, fixedSize);
  line.productId = p.productId || p.id;
  line.product_id = p.productId || p.id;
  line.sizeId = variant ? variant.sizeId : null;
  line.size_id = variant ? variant.sizeId : null;
  line.name = p.name;
  line.brand = p.brand || '';
  line.color = p.color || '';
  line.unitPrice = getReplacementUnitPriceForSize(p, fixedSize, line.origProductId, line.origUnitPrice, sale);
  line.lineTotal = Number((fixedQty * line.unitPrice).toFixed(2));

  openExchangePickerRow = null;
  renderExchangeReplacementCart(saleId);
  recalcReturnGrandTotal(saleId);
}

function buildExchangePickerCardsHtml(saleId, ex) {
  const sale = (db.sales || []).find(s => s.id === saleId) || null;
  const fixedSize = Number(ex.size) || 1;
  const fixedQty = Number(ex.qty) || 1;
  const origProd = productById(ex.origProductId);
  const q = exchangePickerQuery.trim().toLowerCase();

  // Strictly restrict replacement options to products with the exact same unit price for fixedSize
  const samePriceProds = activeProducts().filter(p =>
    isSameReplacementPrice(p, fixedSize, ex.origProductId, ex.origUnitPrice)
  );

  let list = samePriceProds.slice();
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

    const aHasStock = (productHasCanBreakdown(a) ? (productSellableCanCount(a, fixedSize) >= fixedQty && productSellableStock(a) >= fixedQty * fixedSize) : (productSellableStock(a) >= fixedQty * fixedSize)) ? 0 : 1;
    const bHasStock = (productHasCanBreakdown(b) ? (productSellableCanCount(b, fixedSize) >= fixedQty && productSellableStock(b) >= fixedQty * fixedSize) : (productSellableStock(b) >= fixedQty * fixedSize)) ? 0 : 1;
    if (aHasStock !== bHasStock) return aHasStock - bHasStock;

    const aSameBrand = origProd && a.brand === origProd.brand ? 0 : 1;
    const bSameBrand = origProd && b.brand === origProd.brand ? 0 : 1;
    if (aSameBrand !== bSameBrand) return aSameBrand - bSameBrand;

    return a.name.localeCompare(b.name);
  });

  if (!list.length) {
    return `<div class="muted small center" style="padding:18px; grid-column:1 / -1;">No matching ${fixedSize}L paint products found.</div>`;
  }

  return list.map(p => {
    const hasBreakdown = productHasCanBreakdown(p);
    const canCount = productSellableCanCount(p, fixedSize);
    const expiredCans = typeof productExpiredCanCount === 'function' ? productExpiredCanCount(p, fixedSize) : 0;
    const sellableLiters = productSellableStock(p);
    const enoughStock = hasBreakdown
      ? (canCount >= fixedQty && sellableLiters >= fixedQty * fixedSize)
      : (sellableLiters >= fixedQty * fixedSize);

    const isSelected = p.id === ex.productId;
    const isOrig = p.id === ex.origProductId;
    const hex = getProductDefaultColor(p);
    const code = getProductHex(p);
    const rgb = hexToRgb(hex);
    const detected = detectMixedColorName(rgb.r, rgb.g, rgb.b);
    const colorLabel = p.color && p.color !== '-' ? p.color : detected.name;
    const unitP = getReplacementUnitPriceForSize(p, fixedSize, ex.origProductId, ex.origUnitPrice, sale);
    const priceDiff = Number((unitP - Number(ex.origUnitPrice || 0)).toFixed(2));
    const stockLabel = hasBreakdown
      ? `${canCount} × ${fixedSize}L sellable${expiredCans > 0 ? ` (${expiredCans} expired)` : ''}`
      : `${formatLiters(sellableLiters)} sellable`;

    const diffTag = isOrig
      ? `<span class="badge ok" style="font-size:10px; padding:1px 6px;">★ Same Item · Even Exchange</span>`
      : (Math.abs(priceDiff) < 0.01
        ? `<span class="badge ok" style="font-size:10px; padding:1px 6px;">Same Price · Even Exchange</span>`
        : (priceDiff > 0
          ? `<span class="badge mid" style="font-size:10px; padding:1px 6px;">Upgrade · +${peso(priceDiff)}/unit</span>`
          : `<span class="badge low" style="font-size:10px; padding:1px 6px;">Lower Price · -${peso(Math.abs(priceDiff))}/unit</span>`));

    return `
      <div onclick="${enoughStock ? `onChangeFixedReplacementProduct('${saleId}', ${ex.sourceRowIdx}, '${p.id}')` : ''}"
           style="display:flex; align-items:center; gap:10px; padding:9px 11px; border-radius:8px; border:${isSelected ? '2px solid var(--teal)' : '1px solid var(--line)'}; background:${isSelected ? 'var(--teal-tint)' : (enoughStock ? 'var(--surface)' : 'var(--surface-2)')}; opacity:${enoughStock ? '1' : '0.55'}; cursor:${enoughStock ? 'pointer' : 'not-allowed'}; transition:all 0.15s ease; box-shadow:${isSelected ? '0 2px 8px rgba(31,111,107,0.15)' : 'none'};"
           title="${enoughStock ? `Click to select ${escapeHtml(p.name)} (${colorLabel})` : `Insufficient stock for ${fixedQty} × ${fixedSize}L`}">
        <span style="width:28px; height:28px; border-radius:50%; background:${escapeHtml(hex)}; border:2px solid rgba(0,0,0,0.15); box-shadow:inset 0 1px 2px rgba(255,255,255,0.4); flex-shrink:0;"></span>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
            <strong style="font-size:12.5px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.name)}</strong>
            ${code ? `<code style="font-size:10.5px; color:var(--teal-text); font-weight:700;">(${code})</code>` : ''}
          </div>
          <div class="muted small" style="font-size:11px; display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin-top:2px;">
            <span style="font-weight:600; color:var(--ink);">${escapeHtml(colorLabel)}</span>
            <span>· ${escapeHtml(p.brand)}</span>
            <span>· <b style="color:${enoughStock ? 'var(--success)' : 'var(--danger)'};">${stockLabel}</b></span>
          </div>
          <div style="margin-top:4px; display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
            <span style="font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; font-weight:700; font-size:12.5px; color:var(--ink);">${peso(unitP)} <span class="muted small" style="font-weight:400;">/${fixedSize}L</span></span>
            ${diffTag}
          </div>
        </div>
        ${isSelected ? `<span style="color:var(--teal-text); font-weight:800; font-size:15px; flex-shrink:0;" title="Currently Selected">✓</span>` : ''}
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

  if (currentReturnResolution === 'refund') {
    wrap.innerHTML = `
      <div style="padding:14px 16px; background:var(--warning-bg); border:1px solid var(--warning-border); border-radius:6px; display:flex; align-items:center; gap:12px;">
        <span style="font-size:24px;">💵</span>
        <div>
          <div style="font-weight:700; color:var(--warning-text); font-size:13px;">Refund Resolution Selected</div>
          <div class="muted small" style="margin-top:2px; font-size:11.5px;">
            No replacement merchandise will be issued. Total approved return credit will be refunded to the customer upon transaction completion.
          </div>
        </div>
      </div>
    `;
    return;
  }

  if (!returnExchangeCart.length) {
    wrap.innerHTML = `<div class="muted small" style="padding:10px 12px; background:var(--surface); border:1px dashed var(--teal-tint-border); border-radius:4px; text-align:center;">Enter a <b>Return Qty</b> in Step 1 above — the replacement item card with matching <b>fixed Container Size</b> and <b>fixed Quantity</b> will appear here automatically.</div>`;
    return;
  }

  const allProds = activeProducts();

  wrap.innerHTML = `
    <div class="bulk-adj-wrap" style="max-height:360px; overflow-y:auto; background:var(--surface);">
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
              <tr style="background:var(--teal-tint);">
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
                <td class="right" style="font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;">${peso(ex.unitPrice)}</td>
                <td class="right" style="font-weight:700; font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; color:var(--teal-text);">${peso(ex.lineTotal)}</td>
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

    const samePriceProds = allProds.filter(p =>
      isSameReplacementPrice(p, fixedSize, ex.origProductId, ex.origUnitPrice)
    );
    const recCount = origProd
      ? samePriceProds.filter(p => p.id === ex.origProductId || p.type === origProd.type || p.brand === origProd.brand).length
      : samePriceProds.length;

    return `
            <tr>
              <td>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; background:var(--surface-2); border:1px solid var(--line); border-radius:8px; padding:8px 12px;">
                  <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                    <span style="width:28px; height:28px; border-radius:50%; background:${escapeHtml(selHex)}; border:2px solid rgba(0,0,0,0.18); flex-shrink:0;" title="${escapeHtml(selColorLabel)} (${selHex})"></span>
                    <div style="min-width:0;">
                      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <b style="font-size:13px; color:var(--ink);">${escapeHtml(selectedProd ? selectedProd.name : ex.name)}</b>
                        ${selCode ? `<code style="font-size:11px; color:var(--teal-text); font-weight:700;">(${selCode})</code>` : ''}
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
                  <div style="margin-top:8px; padding:12px; background:var(--teal-tint); border:1px solid var(--teal-tint-border); border-radius:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                      <div class="row wrap" style="gap:6px;">
                        <button type="button" class="pos-cat-pill ${exchangePickerTab === 'recommended' ? 'active' : ''}" onclick="setExchangePickerTab('${saleId}', 'recommended')">
                          🎨 Same Brand / Category (${recCount})
                        </button>
                        <button type="button" class="pos-cat-pill ${exchangePickerTab === 'all' ? 'active' : ''}" onclick="setExchangePickerTab('${saleId}', 'all')">
                          🌈 All ${fixedSize}L Products (${samePriceProds.length})
                        </button>
                        ${!isOrig && ex.origProductId ? `
                          <button type="button" class="btn ghost small" style="font-size:11px; padding:3px 8px;" onclick="onChangeFixedReplacementProduct('${saleId}', ${ex.sourceRowIdx}, '${ex.origProductId}')">
                            ★ Reset to Same Item
                          </button>
                        ` : ''}
                      </div>
                      <input type="text" placeholder="🔍 Search shade, product, or brand..." value="${escapeHtml(exchangePickerQuery)}"
                             oninput="onExchangePickerSearch('${saleId}', this.value)"
                             style="width:220px; padding:5px 10px; font-size:12px; border-radius:6px; background:var(--surface);">
                    </div>
                    <div id="ret-ex-card-grid-${ex.sourceRowIdx}" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(235px, 1fr)); gap:8px; max-height:230px; overflow-y:auto; padding-right:2px;">
                      ${buildExchangePickerCardsHtml(saleId, ex)}
                    </div>
                  </div>
                ` : ''}
              </td>
              <td class="center"><span class="badge mid">🔒 ${fixedSize}L</span></td>
              <td class="center"><span class="badge ok">🔒 ${formatStock(fixedQty)}</span></td>
              <td class="right" style="font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;">${peso(ex.unitPrice)}</td>
              <td class="right" style="font-weight:700; font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; color:var(--teal-text);">${peso(ex.lineTotal)}</td>
            </tr>`;
  }).join('')}
        </tbody>
      </table>
    </div>`;
}

function openStartReturnPickerModal() {
  const allSales = (db.sales || [])
    .filter(s => {
      const ns = normalizeSaleStatus(s.status);
      return ns !== 'voided' && ns !== 'cancelled' && ns !== 'pending_void' && isCurrentUserSale(s);
    })
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const renderPickerList = (filter = '') => {
    const q = filter.trim().toLowerCase();
    const container = document.getElementById('ret-picker-list');
    if (!container) return;

    let filtered = allSales;
    if (q) {
      filtered = allSales.filter(s => {
        const rc = (getReceiptNo(s) || '').toLowerCase();
        const cName = (s.cashierName || '').toLowerCase();
        const cust = (s.customerName || s.customer_name || '').toLowerCase();
        return rc.includes(q) || cName.includes(q) || cust.includes(q);
      });
    }

    if (q && !filtered.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding:24px 16px; text-align:center;">
          <div style="font-size:24px; margin-bottom:6px;">⚠️</div>
          <div style="font-weight:700; color:var(--danger); font-size:13.5px;">Invalid or Missing Receipt</div>
          <div class="muted small" style="margin-top:4px; max-width:440px; margin-left:auto; margin-right:auto;">
            No official sales record found matching "<b>${escapeHtml(filter.trim())}</b>". A valid official sales receipt is strictly required under store policy to verify the purchase date, pricing, and product eligibility before processing any return, refund, or replacement.
          </div>
        </div>
      `;
      return;
    }

    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager');
    const eligibleFiltered = filtered.filter(s => normalizeSaleStatus(s.status) !== 'refunded' && (hasSaleReturnableItems(s) || (isAdmin && saleHasOnlyCustomMixItems(s))));

    if (!eligibleFiltered.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding:20px; text-align:center;">
          <div class="muted">No sales transactions with eligible returnable items found matching your filter.</div>
        </div>
      `;
      return;
    }

    const displayList = q ? eligibleFiltered : eligibleFiltered.slice(0, 15);

    container.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--line); background:var(--surface-2);">
            <th style="padding:8px 10px; text-align:left;">Receipt #</th>
            <th style="padding:8px 10px; text-align:left;">Date of Sale</th>
            <th style="padding:8px 10px; text-align:left;">Policy Status</th>
            <th style="padding:8px 10px; text-align:right;">Total Paid</th>
            <th style="padding:8px 10px; text-align:right;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${displayList.map(s => {
      const isSameDay = isSaleReturnWithinDay(s);
      const onlyMix = saleHasOnlyCustomMixItems(s);
      const statusTag = onlyMix
        ? '<span class="badge low" style="font-size:10px;">🔒 Custom Mix (Final Sale)</span>'
        : (isSameDay
          ? '<span class="badge ok" style="font-size:10px;">✓ Same-Day Return Eligible</span>'
          : '<span class="badge mid" style="font-size:10px;">🔄 Replacement (Single-Color)</span>');
      const isActionAllowed = hasSaleReturnableItems(s) || (isAdmin && onlyMix);
      return `
            <tr style="border-bottom:1px solid var(--line);">
              <td style="padding:8px 10px;">
                <code style="color:var(--teal-text); font-weight:700;">${escapeHtml(getReceiptNo(s))}</code>
                ${s.customerName ? `<div class="muted small" style="font-size:11px;">${escapeHtml(s.customerName)}</div>` : ''}
              </td>
              <td style="padding:8px 10px;">
                <div>${formatDateTime(s.date)}</div>
                <div class="muted small" style="font-size:11px;">Cashier: ${escapeHtml(s.cashierName || 'Staff')}</div>
              </td>
              <td style="padding:8px 10px;">${statusTag}</td>
              <td style="padding:8px 10px; text-align:right; font-weight:700; font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;">${peso(s.total)}</td>
              <td style="padding:8px 10px; text-align:right;">
                ${isActionAllowed
          ? `<button type="button" class="btn secondary small" onclick='closeModal(); openReturnRefundModal("${s.id}")'>↩️ Return / Exchange</button>`
          : `<button type="button" class="btn ghost small" disabled style="opacity:0.6; cursor:not-allowed;" title="Custom Color Mix cannot be returned or exchanged once mixed">🔒 Final Sale</button>`}
              </td>
            </tr>`;
    }).join('')}
        </tbody>
      </table>
    `;
  };

  window.onReturnPickerSearch = renderPickerList;

  openModal('↩️ Select Sale to Process Return &amp; Exchange', `
    <div style="margin-bottom:10px; padding:8px 12px; background:var(--teal-tint); border:1px solid var(--teal-tint-border); border-radius:var(--radius-sm); font-size:12px; color:var(--ink);">
      <b>Official Return &amp; Exchange Policy:</b> All returns require a valid receipt, physical product inspection, and authorized approval. Single-color paint is eligible for same-day refund/replacement, or replacement only after purchase day. Custom Color Mix paint is strictly Final Sale (non-returnable and non-exchangeable once mixed) unless approved by Administrator Review for store mixing defects.
    </div>
    <div style="margin-bottom:12px;">
      <input type="text" id="ret-picker-search" placeholder="Search official receipt # (e.g. OR-2026...), customer, or cashier..." style="width:100%; padding:9px 12px; font-size:13.5px;" oninput="onReturnPickerSearch(this.value)">
    </div>
    <div id="ret-picker-list" style="max-height:360px; overflow-y:auto; border:1px solid var(--line); border-radius:var(--radius-sm); background:var(--surface);"></div>
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
  if (currentReturnResolution === 'exchange') {
    syncFixedExchangeLines(saleId);
  }
  updateRestockSummary(saleId);
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

function updateRestockSummary(saleId) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  const textEl = document.getElementById('ret-restock-summary-text');
  const restockCheckbox = document.getElementById('ret-restock');
  if (!sale || !textEl) return;

  const summaryLines = [];
  let hasSealedSingleColor = false;

  sale.items.forEach((item, idx) => {
    const input = document.getElementById(`ret-qty-input-${idx}`);
    const qty = input ? (parseFloat(input.value) || 0) : 0;
    if (qty <= 0) return;

    const isBlend = item.type === 'colormix';
    const cond = returnItemConditions[idx] || 'sealed';
    const size = Number(item.size) || 1;

    if (isBlend) {
      summaryLines.push(`• <b>${escapeHtml(item.name)}</b> (${formatStock(qty)}L Mix): Quarantined as miscast/returned mix. <span class="badge low" style="font-size:10px;">Not Restocked to Base Stock</span>`);
    } else if (cond === 'sealed') {
      hasSealedSingleColor = true;
      summaryLines.push(`• <b>${escapeHtml(item.name)}</b> (${formatStock(qty)} × ${size}L): Verified sealed &amp; undamaged. <span class="badge ok" style="font-size:10px;">Eligible for Sellable Restock (+${formatStock(qty * size)}L)</span>`);
    } else if (cond === 'opened') {
      summaryLines.push(`• <b>${escapeHtml(item.name)}</b> (${formatStock(qty)} × ${size}L): Opened/unsealed container. <span class="badge low" style="font-size:10px;">Quarantined / Used Stock (Not Restocked)</span>`);
    } else {
      summaryLines.push(`• <b>${escapeHtml(item.name)}</b> (${formatStock(qty)} × ${size}L): Defective/damaged unit. <span class="badge low" style="font-size:10px;">Quarantined / Damaged Stock (Not Restocked)</span>`);
    }
  });

  if (!summaryLines.length) {
    textEl.innerHTML = '<span class="muted">Enter return quantity above and select container condition to determine inventory restoration handling.</span>';
    if (restockCheckbox) {
      restockCheckbox.checked = false;
      restockCheckbox.disabled = true;
    }
  } else {
    textEl.innerHTML = summaryLines.join('<br>');
    if (restockCheckbox) {
      if (hasSealedSingleColor) {
        restockCheckbox.disabled = false;
        restockCheckbox.checked = true;
      } else {
        restockCheckbox.checked = false;
        restockCheckbox.disabled = true;
      }
    }
  }
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
  const isRefund = currentReturnResolution === 'refund';
  const exchangeTotal = isRefund ? 0 : Number(returnExchangeCart.reduce((sum, c) => sum + Number(c.lineTotal || 0), 0).toFixed(2));
  const diff = Number((exchangeTotal - grandTotal).toFixed(2));

  const grandTotalEl = document.getElementById('ret-grand-total');
  const exchangeTotalEl = document.getElementById('ret-exchange-total');
  const settlementLabelEl = document.getElementById('ret-settlement-label');
  const settlementValueEl = document.getElementById('ret-settlement-value');
  const submitBtn = document.getElementById('btn-submit-return');
  const inspectionVerified = document.getElementById('ret-inspection-verified') ? document.getElementById('ret-inspection-verified').checked : false;

  if (grandTotalEl) grandTotalEl.textContent = peso(grandTotal);
  if (exchangeTotalEl) exchangeTotalEl.textContent = isRefund ? '₱0.00 (Refund Only)' : peso(exchangeTotal);

  if (settlementLabelEl && settlementValueEl) {
    if (isRefund) {
      settlementLabelEl.textContent = 'Total Approved Refund Due:';
      settlementValueEl.textContent = peso(grandTotal);
      settlementValueEl.style.color = 'var(--danger)';
    } else if (exchangeTotal > 0 && Math.abs(diff) < 0.005) {
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

  updateRestockSummary(saleId);

  const inspectionBox = document.getElementById('ret-inspection-box');
  if (inspectionBox) {
    inspectionBox.style.background = inspectionVerified ? 'var(--teal-tint)' : 'var(--surface-2)';
    inspectionBox.style.borderColor = inspectionVerified ? 'var(--teal)' : 'var(--line)';
  }

  if (submitBtn) {
    const canSubmit = Boolean(inspectionVerified);
    submitBtn.disabled = !canSubmit;
    submitBtn.style.background = canSubmit ? 'var(--teal)' : 'var(--surface-3)';
    submitBtn.style.color = canSubmit ? '#FFFFFF' : 'var(--ink-soft)';
    submitBtn.style.borderColor = canSubmit ? 'transparent' : 'var(--line)';
    submitBtn.style.cursor = canSubmit ? 'pointer' : 'not-allowed';
    submitBtn.style.opacity = canSubmit ? '1' : '0.65';
    submitBtn.style.boxShadow = canSubmit ? '' : 'none';
    submitBtn.title = !inspectionVerified
      ? 'Check "Verified Physical Product Inspection Conducted" first to enable confirmation'
      : '';
    if (isRefund) {
      submitBtn.textContent = `Confirm Refund (${peso(grandTotal)})`;
    } else {
      submitBtn.textContent = exchangeTotal > 0
        ? `Confirm Return & Exchange (${peso(exchangeTotal)} Replacement)`
        : `Confirm Return / Exchange (${peso(grandTotal)})`;
    }
  }
}

async function processSaleReturn(saleId) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale) return;

  const isSameDay = isSaleReturnWithinDay(sale);

  // 1. Mandatory Physical Inspection Check
  const inspectionCheckbox = document.getElementById('ret-inspection-verified');
  if (!inspectionCheckbox || !inspectionCheckbox.checked) {
    showToast('Physical product inspection must be conducted and verified before completing transaction.', 'error');
    return;
  }

  // 2. Processed By / Authorization Resolution (never stamp a Cashier's name as Administrator)
  const isAdminActor = Boolean(currentUser && currentUser.role === 'admin');
  const hasAdminAuth = Boolean(isAdminActor || (adminReviewApproved && adminReviewAdminName));
  const authorizedAdminName = isAdminActor
    ? currentUser.name
    : (adminReviewApproved && adminReviewAdminName ? adminReviewAdminName : '');

  const reason = document.getElementById('ret-reason') ? document.getElementById('ret-reason').value : 'Return / exchange';
  const note = document.getElementById('ret-note') ? document.getElementById('ret-note').value.trim() : '';
  const restock = document.getElementById('ret-restock') ? document.getElementById('ret-restock').checked : false;
  const date = nowISO();
  const receiptNo = getReceiptNo(sale);
  const isRefund = currentReturnResolution === 'refund';

  // 3. Require Administrator Authorization for ALL Cash Refunds (same-day or later) and cash-payout exchanges
  let previewReturnVal = 0;
  sale.items.forEach((item, idx) => {
    const inp = document.getElementById(`ret-qty-input-${idx}`);
    const q = inp ? Math.max(0, parseFloat(inp.value) || 0) : 0;
    if (q > 0) {
      const up = parseFloat(inp.dataset.unitPrice) || Number(item.unitPrice || 0);
      previewReturnVal += Number((q * up).toFixed(2));
    }
  });
  const previewExchangeVal = isRefund ? 0 : returnExchangeCart.reduce((s, ex) => s + Number(ex.lineTotal || 0), 0);
  const requiresCashPayout = isRefund || (previewReturnVal > previewExchangeVal + 0.005);

  if (requiresCashPayout && !hasAdminAuth) {
    const panel = document.getElementById('ret-admin-review-panel');
    if (panel) panel.style.display = 'block';
    showToast('Administrator authorization is required before processing any Cash Refund or cash-difference payout. Enter Admin credentials in the Authorization panel above.', 'error');
    return;
  }

  // 4. Validate stock for replacement items if Exchange resolution
  if (!isRefund) {
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
        if (!p || productSellableStock(p) < exItem.qty * exItem.size) {
          showToast(`Insufficient sellable (non-expired) stock for replacement item: ${exItem.name}.`, 'error');
          return;
        }
        if (productHasCanBreakdown(p) && productSellableCanCount(p, exItem.size || 1) < exItem.qty) {
          showToast(`Insufficient sellable ${exItem.size || 1}L units in stock for replacement item: ${exItem.name}.`, 'error');
          return;
        }
        if (!isSameReplacementPrice(p, exItem.size || 1, exItem.origProductId, exItem.origUnitPrice !== undefined ? exItem.origUnitPrice : exItem.unitPrice)) {
          showToast(`Replacement item "${exItem.name}" must be available in ${exItem.size || 1}L container size with a valid selling price.`, 'error');
          return;
        }
      }
    }
    // Aggregate replacement stock across all rows in case multiple rows pick the same product/size
    const exLitersByProd = {};
    const exCansBySize = {};
    for (const exItem of returnExchangeCart) {
      if (exItem.isMix || exItem.type === 'colormix') continue;
      const p = productById(exItem.productId);
      if (!p) continue;
      const sz = Number(exItem.size) || 1;
      const q = Number(exItem.qty) || 0;
      exLitersByProd[p.id] = (exLitersByProd[p.id] || 0) + (q * sz);
      if (exLitersByProd[p.id] > productSellableStock(p) + 1e-6) {
        showToast(`Combined replacement quantity exceeds available sellable stock for ${p.name}.`, 'error');
        return;
      }
      if (productHasCanBreakdown(p)) {
        const sk = `${p.id}_${sz}`;
        exCansBySize[sk] = (exCansBySize[sk] || 0) + q;
        if (exCansBySize[sk] > productSellableCanCount(p, sz)) {
          showToast(`Combined replacement ${sz}L units exceed available sellable stock for ${p.name}.`, 'error');
          return;
        }
      }
    }
  }

  const returnedItems = [];
  let thisRefundAmount = 0;
  let anySealedRestocked = false;

  // 4b. Pre-validate all returned items before mutating any inventory or sale state
  for (let idx = 0; idx < sale.items.length; idx++) {
    const item = sale.items[idx];
    const input = document.getElementById(`ret-qty-input-${idx}`);
    const qtyToReturn = input ? Math.max(0, parseFloat(input.value) || 0) : 0;
    if (qtyToReturn > 0) {
      const isBlend = item.type === 'colormix';
      const policy = getItemReturnPolicy(item, isSameDay, adminReviewApproved);
      if (policy.restricted && !adminReviewApproved) {
        showToast(isBlend
          ? `"${item.name}" cannot be returned or exchanged because it is a Custom Color Mix (already tinted). Administrator Review authorization is required for formula mixing errors.`
          : `Return of "${item.name}" is restricted after purchase day. Admin Review approval is required.`, 'error');
        return;
      }
      const returnable = Math.max(0, Number(((item.qty || 0) - (item.returnedQty || 0)).toFixed(2)));
      if (qtyToReturn > returnable + 0.0001) {
        showToast(`Return quantity for "${item.name}" (${qtyToReturn}) exceeds remaining returnable quantity (${returnable}).`, 'error');
        return;
      }
    }
  }

  // 5. Process Each Returned Item
  for (let idx = 0; idx < sale.items.length; idx++) {
    const item = sale.items[idx];
    const input = document.getElementById(`ret-qty-input-${idx}`);
    const qtyToReturn = input ? Math.max(0, parseFloat(input.value) || 0) : 0;

    if (qtyToReturn > 0) {
      const isBlend = item.type === 'colormix';
      const policy = getItemReturnPolicy(item, isSameDay, adminReviewApproved);

      if (policy.restricted && !adminReviewApproved) {
        showToast(isBlend
          ? `"${item.name}" cannot be returned or exchanged because it is a Custom Color Mix (already tinted). Administrator Review authorization is required for formula mixing errors.`
          : `Return of "${item.name}" is restricted after purchase day. Admin Review approval is required.`, 'error');
        return;
      }

      const returnable = Math.max(0, Number(((item.qty || 0) - (item.returnedQty || 0)).toFixed(2)));
      if (qtyToReturn > returnable + 0.0001) {
        showToast(`Return quantity for "${item.name}" (${qtyToReturn}) exceeds remaining returnable quantity (${returnable}).`, 'error');
        return;
      }

      const unitPrice = parseFloat(input.dataset.unitPrice) || Number(item.unitPrice || 0);
      const lineRefund = Number((qtyToReturn * unitPrice).toFixed(2));
      thisRefundAmount += lineRefund;

      item.returnedQty = Number(((item.returnedQty || 0) + qtyToReturn).toFixed(2));

      const prodObj = item.productId ? productById(item.productId) : null;
      const sizeNum = Number(item.size) || 1;
      const itemVariant = prodObj ? productSizeVariantBySize(prodObj, sizeNum) : null;
      const resolvedSizeId = item.sizeId || (itemVariant ? itemVariant.sizeId : null);
      const condition = returnItemConditions[idx] || 'sealed';
      const conditionLabel = condition === 'sealed'
        ? 'Verified Sealed & Undamaged'
        : (condition === 'opened' ? 'Opened / Unsealed' : 'Defective / Damaged');

      const isRestocked = Boolean(restock && condition === 'sealed' && !isBlend);

      returnedItems.push({
        type: item.type || 'product',
        paintClassification: isBlend ? 'Custom Mixed-Color Paint' : 'Single-Color Paint',
        productId: prodObj ? (prodObj.productId || prodObj.id) : (item.productId || null),
        product_id: prodObj ? (prodObj.productId || prodObj.id) : (item.productId || null),
        sizeId: resolvedSizeId,
        size_id: resolvedSizeId,
        name: item.name,
        color: item.color || item.colorName || '',
        brand: item.brand || (isBlend ? 'Custom Color Mix' : ''),
        size: item.size || null,
        origQty: Number(item.qty || 0),
        qty: qtyToReturn,
        unitPrice,
        lineRefund,
        condition,
        inspectionResult: conditionLabel,
        restocked: isRestocked
      });

      if (isBlend) {
        // Custom-mixed paint cannot be un-mixed back into sealed base cans: log as Quarantined/Defective Mix
        db.movements.push({
          id: uid('mv'),
          date,
          type: 'adjustment',
          productId: null,
          product_id: null,
          sizeId: null,
          size_id: null,
          productName: `Quarantined Custom Mix — ${item.name} (${item.colorName || 'Custom'})`,
          qtyChange: 0,
          note: `Custom Mix Return / Exchange: ${receiptNo} (${reason}) [${qtyToReturn}L Custom Mix — Condition: ${condition.toUpperCase()} — Quarantined / Not Restocked to Base Units]${note ? ' — ' + note : ''}`,
          staffName: (currentUser && currentUser.name) || 'Cashier'
        });
      } else if (isRestocked) {
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
              note: `Product Return / Exchange: ${receiptNo} (${reason}) [Return ${qtyToReturn} × ${size}L Verified Sealed Restocked · ${size}L Units: ${beforeCans}→${afterCans}, Stock: ${formatStock(beforeStock)}L→${formatStock(product.stock)}L]${note ? ' — ' + note : ''}`,
              staffName: (currentUser && currentUser.name) || 'Cashier'
            });
          }
        }
      } else {
        // Opened, defective, or unrestocked single-color unit: recorded as Quarantined/Damaged stock
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
          note: `Product Return / Exchange: ${receiptNo} (${reason}) [Quarantined / Damaged Stock — Condition: ${condition.toUpperCase()} — NOT Added to Sellable Stock · Stock: ${formatStock(curStock)}L]${note ? ' — ' + note : ''}`,
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

  // 6. Deduct replacement items if Exchange resolution
  const exchangeItems = isRefund ? [] : returnExchangeCart.map(ex => ({ ...ex }));
  const thisExchangeAmount = isRefund ? 0 : Number(exchangeItems.reduce((sum, ex) => sum + Number(ex.lineTotal || 0), 0).toFixed(2));

  if (!isRefund) {
    for (const exItem of exchangeItems) {
      if (exItem.type === 'colormix') {
        if (Array.isArray(exItem.components)) {
          exItem.components.forEach(comp => {
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
          hexColor: exItem.hexColor || null,
          colorHex: exItem.hexColor || null,
          detectedColorName: exItem.detectedColorName || null,
          receiptNo: receiptNo,
          components: exItem.components || [],
          formulaJson: JSON.stringify(exItem.components || []),
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
  }

  // 7. Update Sale Financials & Status (signed refundTotal: positive = cash refunded to customer, negative = extra top-up cash collected on upgrade exchange)
  const netReduction = Number((thisRefundAmount - thisExchangeAmount).toFixed(2));
  const maxRefundable = Number(sale.total || 0);
  const prevRefundTotal = Number(sale.refundTotal || 0);
  sale.refundTotal = Math.min(maxRefundable, Number((prevRefundTotal + netReduction).toFixed(2)));
  const allFullyReturned = sale.items.every(it => Number(it.returnedQty || 0) >= Number(it.qty || 0));
  sale.status = allFullyReturned ? 'refunded' : 'partially_refunded';

  const returnRecord = {
    id: uid('ret'),
    voucherNo: `RE-${Date.now().toString(36).toUpperCase()}`,
    date,
    receiptNo,
    origPurchaseDate: sale.date,
    resolution: currentReturnResolution,
    reason,
    note,
    inspectionConducted: true,
    cashierId: (currentUser && currentUser.id) || null,
    cashierName: (currentUser && currentUser.name) || 'Cashier',
    authorizedBy: authorizedAdminName || 'Not Required (Even / Top-Up Exchange)',
    adminApproved: Boolean(hasAdminAuth),
    adminException: Boolean(adminReviewApproved),
    adminExceptionReason: adminReviewReason || '',
    restocked: Boolean(anySealedRestocked),
    refundAmount: thisRefundAmount,
    exchangeAmount: thisExchangeAmount,
    netDiff: Number((thisExchangeAmount - thisRefundAmount).toFixed(2)),
    items: returnedItems,
    exchangeItems
  };

  if (!Array.isArray(sale.returns)) sale.returns = [];
  sale.returns.push(returnRecord);
  returnExchangeCart = [];

  const auditAction = allFullyReturned ? 'SALE_REFUND' : (isRefund ? 'PARTIAL_REFUND' : 'SALE_EXCHANGE');
  const retItemSummary = returnedItems.map(it => `${it.qty}${it.size ? '×' + it.size + 'L' : 'L'} ${it.name} [${it.paintClassification}] (${peso(it.lineRefund)})`).join(', ');
  const exItemSummary = exchangeItems.length > 0
    ? exchangeItems.map(ex => `${ex.qty}${ex.size ? '×' + ex.size + 'L' : 'L'} ${ex.name} (${peso(ex.lineTotal)})`).join(', ')
    : '';
  const prevNetTotal = Number((sale.total - (sale.refundTotal - netReduction)).toFixed(2));
  const newNetTotal = Number((sale.total - sale.refundTotal).toFixed(2));

  try {
    const retResp = await fetch('api/transactions.php?action=process_return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saleId: sale.id,
        returnRecord,
        updatedItems: sale.items,
        refundTotal: sale.refundTotal,
        status: sale.status,
        requiresAdminAuth: Boolean(requiresCashPayout || !isSameDay || adminReviewApproved),
        adminVerifyToken: window._adminVerifyToken || ''
      })
    });
    const retJson = await retResp.json().catch(() => ({}));
    if (!retResp.ok || !retJson.success) {
      throw new Error(retJson.error || 'Failed to process return/exchange on server.');
    }
  } catch (retErr) {
    showToast(retErr.message || 'Return/exchange failed.', 'error');
    if (typeof loadDB === 'function') await loadDB();
    return;
  }

  window._adminVerifyToken = '';
  if (typeof loadDB === 'function') await loadDB();

  logAudit(
    auditAction,
    `Receipt ${receiptNo}`,
    `${allFullyReturned ? 'Full Sale Refund' : (isRefund ? 'Partial Sale Refund' : 'Return & Exchange')} processed for ${receiptNo} (Voucher ${returnRecord.voucherNo}) — Returned: ${retItemSummary} (${peso(thisRefundAmount)})${exItemSummary ? ' · Exchanged for: ' + exItemSummary + ' (' + peso(thisExchangeAmount) + ')' : ''} · Resolution: ${currentReturnResolution.toUpperCase()} · Reason: ${reason}${adminReviewApproved ? ' (Admin Exception: ' + adminReviewReason + ')' : ''}${note ? ' (' + note + ')' : ''} · Authorized by: ${authorizedAdminName}`,
    {
      entityName: `Receipt ${receiptNo}`,
      fieldChanged: isRefund ? (allFullyReturned ? 'Full Sale Refund' : 'Partial Sale Refund') : 'Return & Exchange',
      oldValue: `Net Sale: ${peso(prevNetTotal)} (Orig: ${peso(sale.total)})`,
      newValue: `Net Sale: ${peso(newNetTotal)} (Returned: ${peso(thisRefundAmount)}${thisExchangeAmount > 0 ? ', Replacement: ' + peso(thisExchangeAmount) : ''})`,
      referenceNo: receiptNo,
      reason: `${reason}${adminReviewApproved ? ' [Admin Exception: ' + adminReviewReason + ']' : ''}${note ? ' — ' + note : ''}`,
      meta: {
        voucherNo: returnRecord.voucherNo,
        receiptNo,
        resolution: currentReturnResolution,
        refundAmount: thisRefundAmount,
        exchangeAmount: thisExchangeAmount,
        restocked: returnRecord.restocked,
        authorizedBy: authorizedAdminName,
        adminException: returnRecord.adminException,
        adminExceptionReason: returnRecord.adminExceptionReason,
        returnedItems: returnedItems.map(i => ({ name: i.name, paintClassification: i.paintClassification, qty: i.qty, size: i.size, unitPrice: i.unitPrice, lineRefund: i.lineRefund, condition: i.condition, inspectionResult: i.inspectionResult, restocked: i.restocked })),
        exchangeItems: exchangeItems.map(i => ({ name: i.name, qty: i.qty, size: i.size, unitPrice: i.unitPrice, lineTotal: i.lineTotal }))
      }
    }
  );
  closeModal();

  showToast(
    isRefund
      ? `Refund of ${peso(thisRefundAmount)} processed successfully.`
      : (exchangeItems.length > 0
        ? `Return & Exchange processed (${peso(thisRefundAmount)} returned, ${peso(thisExchangeAmount)} replacement issued).`
        : `Return / Exchange credit of ${peso(thisRefundAmount)} processed successfully.`),
    'ok'
  );

  renderSalesHistoryTable();
  if (typeof renderReportBody === 'function' && document.getElementById('report-body')) {
    renderReportBody();
  }

  showReturnVoucherModal(sale.id, returnRecord.id);
}

/* ============================================================
   RETURN & EXCHANGE VOUCHER SLIP (PRINTABLE)
   ============================================================ */

function viewReturnVouchers(saleId) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale || !sale.returns || !sale.returns.length) return;
  if (currentUser && currentUser.role === 'cashier' && !isCurrentUserSale(sale)) {
    showToast('Access denied: You can only view return vouchers for your own sales.', 'error');
    return;
  }
  const latestVoucher = sale.returns[sale.returns.length - 1];
  showReturnVoucherModal(sale.id, latestVoucher.id);
}

function showReturnVoucherModal(saleId, voucherId) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale) return;
  if (currentUser && currentUser.role === 'cashier' && !isCurrentUserSale(sale)) {
    showToast('Access denied: You can only view return vouchers for your own sales.', 'error');
    return;
  }
  const voucher = (sale.returns || []).find(v => v.id === voucherId) || sale.returns[sale.returns.length - 1];
  if (!voucher) return;

  const receiptNo = getReceiptNo(sale);
  const itemsHtml = (voucher.items || []).map(it => {
    const prod = it.productId ? productById(it.productId) : null;
    const itHex = prod ? getProductHex(prod) : '';
    const isBlend = it.type === 'colormix' || it.paintClassification === 'Custom Mixed-Color Paint';
    const classification = it.paintClassification || (isBlend ? 'Custom Mixed-Color Paint' : 'Single-Color Paint');
    const condBadge = it.condition === 'sealed'
      ? '<span class="badge ok" style="font-size:10px;">🟢 Verified Sealed</span>'
      : (it.condition === 'opened'
        ? '<span class="badge mid" style="font-size:10px;">🟡 Opened / Unsealed</span>'
        : '<span class="badge low" style="font-size:10px;">🔴 Defective / Damaged</span>');

    return `
    <tr>
      <td style="padding:6px 4px;">
        <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
          <b>${escapeHtml(it.name)}</b>
          ${itHex ? `<span class="muted small" style="font-family:monospace; font-weight:600; color:var(--teal-text);">(${itHex})</span>` : ''}
          ${it.color ? `<span class="muted small"> (${escapeHtml(it.color)})</span>` : ''}
        </div>
        <div class="muted small" style="font-size:11px; margin-top:2px;">
          ${escapeHtml(it.brand || '')}${it.size ? ` · Size: <b>${it.size}L</b>` : ''}
          <span class="badge ${isBlend ? 'mid' : 'ghost'}" style="font-size:9.5px; margin-left:4px;">${escapeHtml(classification)}</span>
        </div>
      </td>
      <td class="center" style="padding:6px 4px; font-size:11px;">${condBadge}</td>
      <td class="right" style="padding:6px 4px;">${formatStock(it.origQty || it.qty)}</td>
      <td class="right" style="padding:6px 4px; font-weight:700;">${formatStock(it.qty)}</td>
      <td class="right" style="padding:6px 4px;">${peso(it.unitPrice)}</td>
      <td class="right" style="padding:6px 4px; font-weight:700;">${peso(it.lineRefund)}</td>
    </tr>`;
  }).join('');

  const onlyColorMixReturned = (voucher.items || []).length > 0 && (voucher.items || []).every(it => it.type === 'colormix' || it.paintClassification === 'Custom Mixed-Color Paint');
  const restockBadgeHtml = voucher.restocked
    ? '<span class="badge ok">✓ Sealed units restored to sellable inventory</span>'
    : (onlyColorMixReturned
      ? '<span class="badge low">🎨 Quarantined Custom Mix (Not Restocked to Base Stock)</span>'
      : '<span class="badge low">⚠️ Quarantined / Damaged Stock (Not Restocked)</span>');

  const exItems = Array.isArray(voucher.exchangeItems) ? voucher.exchangeItems : [];
  const isRefund = voucher.resolution === 'refund';

  const exchangeHtml = (!isRefund && exItems.length) ? `
    <div style="margin-top:14px; font-weight:700; font-size:11.5px; text-transform:uppercase; color:var(--teal-text); letter-spacing:0.03em;">Replacement Items Issued (Exchange)</div>
    <table style="width:100%; border-collapse:collapse; margin-top:4px;">
      <thead>
        <tr style="border-bottom:1px solid var(--line); font-size:11px; text-transform:uppercase; color:var(--ink-soft);">
          <th style="text-align:left; padding:6px 0;">Replacement Item</th>
          <th class="center" style="padding:6px 8px;">Fixed Size</th>
          <th class="right" style="padding:6px 8px;">Qty Issued</th>
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
              <td style="padding:6px 0;">
                <b>${escapeHtml(ex.name)}</b> <span class="muted small">(${escapeHtml(ex.colorName || ex.color || 'Custom Shade')})</span>
                <div class="muted small">Fresh Custom Re-Mix${formulaStr}</div>
              </td>
              <td class="center" style="padding:6px 8px;"><span class="badge mid">${formatStock(ex.liters || ex.qty)}L Mix</span></td>
              <td class="right" style="padding:6px 8px;">${formatStock(ex.qty)}L</td>
              <td class="right" style="padding:6px 8px;">${peso(ex.unitPrice)}</td>
              <td class="right" style="padding:6px 0; font-weight:700; color:var(--teal-text);">${peso(ex.lineTotal)}</td>
            </tr>`;
    }
    const prod = ex.productId ? productById(ex.productId) : null;
    const exHex = prod ? getProductHex(prod) : '';
    return `
          <tr>
            <td style="padding:6px 0;">
              <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                <b>${escapeHtml(ex.name)}</b> ${exHex ? `<span class="muted small" style="font-family:monospace; font-weight:600; color:var(--teal-text);">(${exHex})</span>` : ''}
                ${ex.color && ex.color !== '-' ? `<span class="muted small"> (${escapeHtml(ex.color)})</span>` : ''}
              </div>
              <div class="muted small">${escapeHtml(ex.brand || '')}</div>
            </td>
            <td class="center" style="padding:6px 8px;"><span class="badge mid">${ex.size || 1}L</span></td>
            <td class="right" style="padding:6px 8px;">${formatStock(ex.qty)}</td>
            <td class="right" style="padding:6px 8px;">${peso(ex.unitPrice)}</td>
            <td class="right" style="padding:6px 0; font-weight:700; color:var(--teal-text);">${peso(ex.lineTotal)}</td>
          </tr>`;
  }).join('')}
      </tbody>
    </table>
  ` : '';

  const retVal = Number(voucher.refundAmount || 0);
  const exVal = Number(voucher.exchangeAmount || 0);
  const diff = Number((exVal - retVal).toFixed(2));

  openModal('📋 Return &amp; Exchange Voucher', `
    <div id="printable-return-slip" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-sm); padding:18px 20px; font-family:'Inter',system-ui,sans-serif; color:var(--ink); font-size:12.5px;">
      <div style="text-align:center; padding-bottom:12px; border-bottom:1px dashed var(--line); margin-bottom:12px;">
        <img src="assets/images/logo.png" alt="MRGR Logo" style="width:44px; height:44px; border-radius:50%; margin:0 auto 8px auto; display:block; object-fit:cover;">
        <div style="font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; font-weight:700; font-size:16px; letter-spacing:-0.01em;">MRGR COLOR CENTER</div>
        <div class="muted small" style="font-size:11px; line-height:1.35; margin-top:3px;">${businessAddressHtml()}</div>
        <div class="muted small" style="font-size:11px; margin-top:2px;">Contact Number: ${escapeHtml(BUSINESS_CONTACT_NUMBER)}</div>
        <div class="muted small" style="margin-top:3px; font-weight:600;">Official Return, Refund &amp; Exchange Slip</div>
        <div style="display:inline-block; margin-top:8px; padding:4px 12px; background:var(--danger-bg); border:1px solid var(--danger-border); border-radius:4px; font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; font-weight:700; font-size:13px; color:var(--danger);">
          Voucher #: <span>${escapeHtml(voucher.voucherNo || voucher.id)}</span>
        </div>
      </div>

      <div class="row wrap" style="justify-content:space-between; margin-bottom:12px; gap:8px;">
        <div>
          <div><span class="muted">Original Receipt:</span> <b>${escapeHtml(receiptNo)}</b></div>
          <div><span class="muted">Date of Purchase:</span> <b>${formatDateTime(voucher.origPurchaseDate || sale.date)}</b></div>
          <div><span class="muted">Processed By:</span> <b>${escapeHtml(voucher.cashierName)}</b></div>
          ${((sale.customerName || sale.customer_name || '').trim()) ? `<div><span class="muted">Customer:</span> <b>${escapeHtml((sale.customerName || sale.customer_name).trim())}</b></div>` : ''}
        </div>
        <div class="right">
          <div><span class="muted">Processing Date:</span> <b>${formatDateTime(voucher.date)}</b></div>
          <div><span class="muted">Authorized By:</span> <b>${escapeHtml(voucher.authorizedBy || 'Administrator')}</b></div>
          <div><span class="muted">Approved Resolution:</span> <b>${isRefund ? '💵 Refund' : '🔄 Replacement (Exchange)'}</b></div>
          <div style="margin-top:2px;">${restockBadgeHtml}</div>
        </div>
      </div>

      ${voucher.adminException ? `
        <div style="margin-bottom:8px; font-size:11.5px; background:var(--warning-bg); border:1px solid var(--warning-border); padding:6px 10px; border-radius:4px; color:var(--warning-text);">
          <b>🛡️ Authorized Administrator Exception:</b> ${escapeHtml(voucher.adminExceptionReason || 'Approved under Administrator Review')}
        </div>
      ` : ''}

      <div style="margin-bottom:10px; font-size:12px; background:var(--surface-2); padding:6px 10px; border-radius:4px;">
        <span class="muted">Reason:</span> <b>${escapeHtml(voucher.reason)}</b>
        ${voucher.note ? `<br><span class="muted">Notes:</span> <i>${escapeHtml(voucher.note)}</i>` : ''}
      </div>

      <div style="font-weight:700; font-size:11.5px; text-transform:uppercase; color:var(--ink-soft); letter-spacing:0.03em; margin-top:8px;">Items Returned &amp; Physical Inspection Results</div>
      <table style="width:100%; border-collapse:collapse; margin-top:4px;">
        <thead>
          <tr style="border-bottom:1px solid var(--line); font-size:11px; text-transform:uppercase; color:var(--ink-soft);">
            <th style="text-align:left; padding:6px 4px;">Item Returned</th>
            <th class="center" style="padding:6px 4px;">Inspection</th>
            <th class="right" style="padding:6px 4px;">Sold</th>
            <th class="right" style="padding:6px 4px;">Returned</th>
            <th class="right" style="padding:6px 4px;">Unit Credit</th>
            <th class="right" style="padding:6px 4px;">Return Credit</th>
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
          <strong style="font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; color:var(--danger);">${peso(retVal)}</strong>
        </div>
        ${(!isRefund && exItems.length) ? `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="muted">Total Replacement Issued:</span>
            <strong style="font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif; color:var(--teal-text);">${peso(exVal)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:6px; border-top:1px solid var(--line);">
            <span style="font-weight:700; font-size:14px;">${Math.abs(diff) < 0.005 ? 'Exchange Settlement:' : (diff > 0 ? 'Additional Amount Paid:' : 'Remaining Return Credit:')}</span>
            <span style="font-size:17px; font-weight:700; color:${diff >= 0 ? 'var(--teal)' : 'var(--danger)'}; font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;">
              ${Math.abs(diff) < 0.005 ? '₱0.00 (Even Exchange)' : (diff > 0 ? `+${peso(diff)}` : peso(Math.abs(diff)))}
            </span>
          </div>
        ` : `
          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:6px; border-top:1px solid var(--line);">
            <span style="font-weight:700; font-size:14px;">Total Approved Refund Paid:</span>
            <span style="font-size:18px; font-weight:700; color:var(--danger); font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;">${peso(retVal)}</span>
          </div>
        `}
      </div>

      <div class="row wrap" style="justify-content:space-between; margin-top:30px; padding-top:20px; border-top:1px solid var(--line); gap:20px;">
        <div style="text-align:center; min-width:140px;">
          <div style="border-bottom:1px solid var(--line); width:100%; height:20px; margin-bottom:4px; font-weight:700; font-size:11px;">${escapeHtml(voucher.authorizedBy || 'Administrator')}</div>
          <span class="muted small" style="font-size:11px;">Authorized Administrator Approval</span>
        </div>
        <div style="text-align:center; min-width:140px;">
          <div style="border-bottom:1px solid var(--line); width:100%; height:20px; margin-bottom:4px; font-weight:700; font-size:11px;">${escapeHtml(voucher.cashierName)}</div>
          <span class="muted small" style="font-size:11px;">Processing Staff Member</span>
        </div>
      </div>

      <div class="muted center small" style="margin-top:16px; font-size:11px;">
        Official Return, Refund &amp; Exchange acknowledgement under store policy. Retain copy for accounting and inventory audits.
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
    <base href="${escapeAttr(window.location.href)}">
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
      .badge.mid { background: #fff3cd; color: #856404; }
      .badge.ghost { background: #f0f0f0; color: #555; }
    </style>
  </head>
  <body>
    ${slipEl.outerHTML}
    <script>window.onafterprint = function(){ window.close(); }; window.onload = function(){ setTimeout(function(){ window.print(); }, 150); }<\/script>
  </body>
</html>
  `);
  printWin.document.close();
}
