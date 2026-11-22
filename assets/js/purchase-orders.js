/* ============================================================
   18b. PURCHASE ORDERS — order stock from suppliers
   ============================================================ */
let poViewMode = 'list';  // 'list' | 'create' | 'detail'
let poDetailId = null;
let poItemRows = [];
let poSupplierId = '';
let poFilterStatus = '';
let poCreateStockFilter = 'low_out'; // 'low_out' | 'all' | 'low_only' | 'out_only' | 'good_only'
let poWizardStep = 1; // 1: Select Products, 2: Select Supplier, 3: Review Order
let poSelectedKeys = new Set(); // Set of "productId__containerSize" strings
let poCatalogSearch = '';
let poCatalogCategory = 'all';
let poCatalogStockFilter = 'all';
let poReviewRows = [];
let poNotes = '';

function generatePONumber(offset = 0) {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  let seqNum = (db.purchaseOrders ? db.purchaseOrders.length : 0) + 1 + offset;
  let poNum = `PO-${dateStr}-${String(seqNum).padStart(4, '0')}`;
  while ((db.purchaseOrders || []).some(o => o.poNumber === poNum)) {
    seqNum++;
    poNum = `PO-${dateStr}-${String(seqNum).padStart(4, '0')}`;
  }
  return poNum;
}

function poStatusBadge(status, po = null) {
  const isReplPending = status === 'partial' && po && (
    po.receivingStage === 'awaiting_replacement' ||
    (typeof getPOReplacementSummary === 'function' && getPOReplacementSummary(po.id).activeCount > 0)
  );
  if (isReplPending) {
    return `<span class="badge po-partial">Partially Received – Replacement Pending</span>`;
  }
  const map = {
    pending: ['po-pending', 'Pending Approval'],
    ordered: ['po-ordered', 'Approved / Ordered'],
    partial: ['po-partial', 'Partially Received'],
    received: ['po-received', 'Fully Received'],
    cancelled: ['po-cancelled', 'Cancelled']
  };
  const [cls, label] = map[status] || ['inactive', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function poStatusBadgeText(status) {
  const map = {
    pending: 'Pending Approval',
    ordered: 'Approved / Ordered',
    partial: 'Partially Received',
    received: 'Received',
    cancelled: 'Cancelled'
  };
  return map[status] || status;
}

function initPOPage() {
  if (typeof loadSupplierReturns === 'function' && typeof srState !== 'undefined' && !srState.loaded) {
    loadSupplierReturns(false).then(() => {
      if (typeof currentPage !== 'undefined' && currentPage === 'purchaseOrders') renderPage();
    });
  }
  if (poViewMode === 'create') {
    setTimeout(() => renderPOItemRows(), 0);
  }
}

function purchaseOrdersPage() {
  if (poViewMode === 'create') return poCreatePage();
  if (poViewMode === 'detail' && poDetailId) return poDetailPage();
  return poListPage();
}

/* ----- PO LIST ----- */
const PO_SYSTEM_START_DATE = '2026-01-01';
const PO_SYSTEM_START_YEAR = 2026;

function getPOMinSelectableDate() {
  let minDate = PO_SYSTEM_START_DATE;
  if (typeof db !== 'undefined' && db && Array.isArray(db.purchaseOrders)) {
    db.purchaseOrders.forEach(o => {
      const d = String(o.orderDate || o.date || '').slice(0, 10);
      if (d && d < minDate && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        minDate = d;
      }
    });
  }
  return minDate;
}

function getPOMaxSelectableDate() {
  return todayISO();
}

function getAvailablePOYears() {
  const curY = getCurrentYear();
  const startY = PO_SYSTEM_START_YEAR;
  const years = new Set();
  // 2026 is starting available year up to current year
  for (let y = curY; y >= startY; y--) {
    years.add(y);
  }
  // Include previous years only when historical PO records actually exist in database
  if (typeof db !== 'undefined' && db && Array.isArray(db.purchaseOrders)) {
    db.purchaseOrders.forEach(o => {
      const d = o.orderDate || o.date;
      if (d) {
        const y = parseInt(String(d).slice(0, 4), 10);
        if (!isNaN(y) && y >= 2000 && y <= curY) {
          years.add(y);
        }
      }
    });
  }
  return Array.from(years).sort((a, b) => b - a);
}

let poSearch = '';
let poDateFrom = currentYearStartISO();
let poDateTo = todayISO();
let poYearFilter = 'current';

function getDateFilteredPOs() {
  const all = [...(db.purchaseOrders || [])].sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
  if (!poDateFrom && !poDateTo) return all;
  return all.filter(o => {
    const d = String(o.orderDate || '').slice(0, 10);
    if (poDateFrom && d < poDateFrom) return false;
    if (poDateTo && d > poDateTo) return false;
    return true;
  });
}

function getFilteredPOs(dateFilteredOrders) {
  const orders = dateFilteredOrders || getDateFilteredPOs();
  let filtered = poFilterStatus ? orders.filter(o => {
    if (poFilterStatus === 'open') return o.status === 'pending' || o.status === 'ordered' || o.status === 'partial';
    return o.status === poFilterStatus;
  }) : orders;
  if (poSearch) {
    const q = poSearch.toLowerCase();
    filtered = filtered.filter(o =>
      o.poNumber.toLowerCase().includes(q) ||
      o.supplierName.toLowerCase().includes(q) ||
      (o.notes || '').toLowerCase().includes(q)
    );
  }
  return filtered;
}

function getPODatePreset() {
  return getDateRangePreset(poDateFrom, poDateTo);
}

function getPOSelectedYear() {
  const curY = getCurrentYear();
  if (poYearFilter === 'current') return curY;
  const y = parseInt(poYearFilter, 10);
  if (!isNaN(y)) return y;
  if (poDateFrom && poDateFrom.length >= 4) {
    const yf = parseInt(poDateFrom.slice(0, 4), 10);
    if (!isNaN(yf)) return yf;
  }
  if (poDateTo && poDateTo.length >= 4) {
    const yt = parseInt(poDateTo.slice(0, 4), 10);
    if (!isNaN(yt)) return yt;
  }
  return curY;
}

function formatPOInputDate(iso) {
  if (!iso) return '';
  const str = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return '';
  const [y, m, d] = str.split('-');
  return `${m}/${d}/${y}`;
}

/* PO Month & Day Calendar State */
let poCalTarget = null; // 'from' | 'to'
let poCalViewingMonth = new Date().getMonth(); // 0..11
let poCalAnchorEl = null;
const PO_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function closePOCalendar() {
  const el = document.getElementById('po-calendar-popover');
  if (el) el.remove();
  poCalTarget = null;
  poCalAnchorEl = null;
}

function openPOCalendar(target, anchorEl, event) {
  if (event) {
    event.stopPropagation();
  }
  const existingPopover = document.getElementById('po-calendar-popover');
  if (existingPopover && poCalTarget === target) {
    closePOCalendar();
    return;
  }
  closePOCalendar();
  closeAllPOActionsMenus();
  closePOProductPicker();

  poCalTarget = target;
  poCalAnchorEl = anchorEl || document.getElementById(target === 'from' ? 'po-date-from-wrapper' : 'po-date-to-wrapper');

  const selectedYear = getPOSelectedYear();
  const activeDate = (target === 'from' ? poDateFrom : poDateTo);

  if (activeDate && /^\d{4}-\d{2}-\d{2}$/.test(activeDate.slice(0, 10))) {
    poCalViewingMonth = parseInt(activeDate.slice(5, 7), 10) - 1;
  } else {
    const curY = getCurrentYear();
    if (selectedYear === curY) {
      poCalViewingMonth = new Date().getMonth();
    } else {
      poCalViewingMonth = 0;
    }
  }

  renderPOCalendarPopover();
}

function renderPOCalendarPopover() {
  let popover = document.getElementById('po-calendar-popover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'po-calendar-popover';
    popover.className = 'po-calendar-popover';
    popover.onclick = e => e.stopPropagation();
    document.body.appendChild(popover);
  }

  const curY = getCurrentYear();
  const selectedYear = getPOSelectedYear();
  const today = todayISO();
  const curMonthIdx = new Date().getMonth();
  const m = poCalViewingMonth;

  // Navigation constraints
  const canPrev = !(selectedYear === PO_SYSTEM_START_YEAR && m === 0);
  const canNext = !(selectedYear === curY && m >= curMonthIdx);

  // Month & Day calculations
  const firstDayOfWeek = new Date(selectedYear, m, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(selectedYear, m + 1, 0).getDate();

  const minSelectableDate = getPOMinSelectableDate();
  const maxSelectableDate = getPOMaxSelectableDate();

  let daysHtml = '';
  // Empty padding cells
  for (let i = 0; i < firstDayOfWeek; i++) {
    daysHtml += `<div class="po-cal-cell-empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${selectedYear}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    let isDisabled = false;

    // Disallow future dates for current year
    if (selectedYear === curY && dateStr > maxSelectableDate) isDisabled = true;
    // Disallow dates before system start date (unless historical year)
    const effectiveMin = (selectedYear >= PO_SYSTEM_START_YEAR ? minSelectableDate : `${selectedYear}-01-01`);
    if (dateStr < effectiveMin) isDisabled = true;

    // Validate From <= To
    if (poCalTarget === 'from' && poDateTo && dateStr > poDateTo) {
      isDisabled = true;
    }
    if (poCalTarget === 'to' && poDateFrom && dateStr < poDateFrom) {
      isDisabled = true;
    }

    const isSelected = (poCalTarget === 'from' && poDateFrom === dateStr) ||
      (poCalTarget === 'to' && poDateTo === dateStr);
    const isToday = (dateStr === today);

    if (isDisabled) {
      daysHtml += `<button type="button" class="po-cal-day-btn po-cal-day-disabled" disabled>${d}</button>`;
    } else {
      daysHtml += `<button type="button" class="po-cal-day-btn ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}" onclick="poCalSelectDay(${d}, event)" title="${formatDateReadable(dateStr)}">${d}</button>`;
    }
  }

  const targetLabel = (poCalTarget === 'from' ? 'From (Start Date)' : 'To (End Date)');

  popover.innerHTML = `
    <div class="po-cal-header">
      <div class="po-cal-month-wrap">
        <button type="button" class="po-cal-nav-btn" onclick="poCalPrevMonth(event)" ${canPrev ? '' : 'disabled'} title="Previous month">‹</button>
        <select class="po-cal-month-dropdown" onchange="poCalChangeMonth(this.value, event)" title="Select month">
          ${PO_MONTH_NAMES.map((name, idx) => {
    const isMonthDisabled = (selectedYear === curY && idx > curMonthIdx);
    return `<option value="${idx}" ${idx === m ? 'selected' : ''} ${isMonthDisabled ? 'disabled' : ''}>${name}</option>`;
  }).join('')}
        </select>
        <button type="button" class="po-cal-nav-btn" onclick="poCalNextMonth(event)" ${canNext ? '' : 'disabled'} title="Next month">›</button>
      </div>

      <!-- Locked Year Display: Manual year selection is hidden/disabled; year is locked to Year dropdown -->
      <div class="po-cal-year-locked" title="Year is locked to ${selectedYear} from the Year dropdown">
        <span class="po-cal-lock-icon">🔒</span>
        <span class="po-cal-year-num">${selectedYear}</span>
      </div>
    </div>

    <div class="po-cal-weekdays">
      <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
    </div>

    <div class="po-cal-days-grid">
      ${daysHtml}
    </div>

    <div class="po-cal-footer">
      <div class="po-cal-footer-note">
        Setting <b>${targetLabel}</b> · Year locked to <b>${selectedYear}</b>
      </div>
      <button type="button" class="po-cal-close-btn" onclick="closePOCalendar()">Close</button>
    </div>
  `;

  positionPOCalendar(poCalAnchorEl);
}

function poCalPrevMonth(event) {
  if (event) event.stopPropagation();
  if (poCalViewingMonth > 0) {
    poCalViewingMonth--;
    renderPOCalendarPopover();
  }
}

function poCalNextMonth(event) {
  if (event) event.stopPropagation();
  const curY = getCurrentYear();
  const selectedYear = getPOSelectedYear();
  const curMonthIdx = new Date().getMonth();
  if (selectedYear === curY && poCalViewingMonth >= curMonthIdx) return;
  if (poCalViewingMonth < 11) {
    poCalViewingMonth++;
    renderPOCalendarPopover();
  }
}

function poCalChangeMonth(val, event) {
  if (event) event.stopPropagation();
  const idx = parseInt(val, 10);
  if (!isNaN(idx) && idx >= 0 && idx <= 11) {
    poCalViewingMonth = idx;
    renderPOCalendarPopover();
  }
}

function poCalSelectDay(d, event) {
  if (event) event.stopPropagation();
  const yr = getPOSelectedYear();
  const m = poCalViewingMonth + 1;
  const iso = `${yr}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  if (poCalTarget === 'from') {
    poDateFrom = iso;
    // Ensure From <= To
    if (poDateTo && poDateFrom > poDateTo) {
      poDateTo = poDateFrom;
    }
  } else if (poCalTarget === 'to') {
    poDateTo = iso;
    // Ensure To >= From
    if (poDateFrom && poDateTo < poDateFrom) {
      poDateFrom = poDateTo;
    }
  }

  closePOCalendar();
  resetPaginationPage('purchase_orders');
  renderPage();
}

function positionPOCalendar(anchorEl) {
  const popover = document.getElementById('po-calendar-popover');
  if (!popover || !anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const popWidth = 275;
  let left = rect.left;
  let top = rect.bottom + 5;

  if (left + popWidth > window.innerWidth - 12) {
    left = window.innerWidth - popWidth - 12;
  }
  if (left < 10) left = 10;

  const popHeight = popover.offsetHeight || 290;
  if (top + popHeight > window.innerHeight - 10 && rect.top > popHeight) {
    top = Math.max(10, rect.top - popHeight - 5);
  }

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
}

function onPOYearChange(val) {
  closePOCalendar();
  resetPaginationPage('purchase_orders');
  const curY = getCurrentYear();
  const today = todayISO();
  const minDate = getPOMinSelectableDate();

  if (val === 'all') {
    poDateFrom = '';
    poDateTo = '';
    poYearFilter = 'all';
    renderPage();
    return;
  }

  let targetYear = curY;
  if (val === 'current') {
    targetYear = curY;
    poYearFilter = 'current';
  } else {
    const y = parseInt(val, 10);
    if (!isNaN(y)) {
      targetYear = y;
      poYearFilter = String(y);
    }
  }

  const defaultFromMD = (poDateFrom && poDateFrom.length >= 10) ? poDateFrom.slice(5) : '01-01';
  const defaultToMD = (poDateTo && poDateTo.length >= 10) ? poDateTo.slice(5) : (targetYear === curY ? today.slice(5) : '12-31');

  poDateFrom = updateDateYearISO(poDateFrom, targetYear, defaultFromMD);
  poDateTo = updateDateYearISO(poDateTo, targetYear, defaultToMD);

  if (poDateFrom && poDateTo && poDateFrom > poDateTo) {
    poDateFrom = poDateTo;
  }

  renderPage();
}

function togglePOHistoricalRecords() {
  closePOCalendar();
  resetPaginationPage('purchase_orders');
  if (isHistoricalView(poDateFrom, poDateTo)) {
    // Return to current year
    setPODatePreset('year');
  } else {
    // Switch to all-time historical POs
    poDateFrom = '';
    poDateTo = '';
    poYearFilter = 'all';
    renderPage();
  }
}

function setPODatePreset(preset) {
  closePOCalendar();
  resetPaginationPage('purchase_orders');
  const today = todayISO();
  const curY = getCurrentYear();
  const minDate = getPOMinSelectableDate();

  if (preset === 'today') {
    poDateFrom = today;
    poDateTo = today;
    poYearFilter = 'current';
  } else if (preset === 'yesterday') {
    const yest = daysAgoISO(1);
    poDateFrom = yest < minDate ? minDate : yest;
    poDateTo = yest;
    poYearFilter = 'current';
  } else if (preset === '7d') {
    const d7 = daysAgoISO(6);
    poDateFrom = d7 < minDate ? minDate : d7;
    poDateTo = today;
    poYearFilter = 'current';
  } else if (preset === '30d') {
    const d30 = daysAgoISO(29);
    poDateFrom = d30 < minDate ? minDate : d30;
    poDateTo = today;
    poYearFilter = 'current';
  } else if (preset === 'month') {
    const mStart = thisMonthStartISO();
    poDateFrom = mStart < minDate ? minDate : mStart;
    poDateTo = today;
    poYearFilter = 'current';
  } else if (preset === 'year') {
    poDateFrom = currentYearStartISO(curY);
    poDateTo = today;
    poYearFilter = 'current';
  } else if (preset === 'all') {
    poDateFrom = '';
    poDateTo = '';
    poYearFilter = 'all';
  }
  renderPage();
}

function clearPODates() {
  closePOCalendar();
  setPODatePreset('all');
}

function formatPODateRangeLabel() {
  const curY = getCurrentYear();
  const today = todayISO();
  if (!poDateFrom && !poDateTo) return 'All-Time (Historical)';
  if (poDateFrom === currentYearStartISO(curY) && (poDateTo === currentYearEndISO(curY) || poDateTo === today)) {
    return `Current Year (${curY})`;
  }
  if (poDateFrom && poDateTo && poDateFrom.endsWith('-01-01') && poDateTo.endsWith('-12-31') && poDateFrom.slice(0, 4) === poDateTo.slice(0, 4)) {
    return `Year ${poDateFrom.slice(0, 4)} (Historical)`;
  }
  if (poDateFrom && poDateTo) {
    return poDateFrom === poDateTo ? formatDateReadable(poDateFrom) : `${formatDateReadable(poDateFrom)} – ${formatDateReadable(poDateTo)}`;
  }
  if (poDateFrom) return `From ${formatDateReadable(poDateFrom)}`;
  if (poDateTo) return `Until ${formatDateReadable(poDateTo)}`;
  return `Current Year (${curY})`;
}

function poListPage() {
  const curY = getCurrentYear();
  const availableYears = getAvailablePOYears();
  const orders = getDateFilteredPOs();
  const counts = { all: orders.length, pending: 0, ordered: 0, partial: 0, received: 0, cancelled: 0 };
  orders.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
  const totalSpend = orders.filter(o => o.status === 'received').reduce((s, o) => s + o.totalAmount, 0);
  const pending = orders.filter(o => o.status === 'pending' || o.status === 'ordered' || o.status === 'partial').reduce((s, o) => s + o.totalAmount, 0);
  const filtered = getFilteredPOs(orders);
  const activePreset = getPODatePreset();
  const hasDates = Boolean(poDateFrom || poDateTo);
  const isHistorical = isHistoricalView(poDateFrom, poDateTo);

  // Preserve selected year; never reset to custom
  if (!poDateFrom && !poDateTo) {
    poYearFilter = 'all';
  } else if (!poYearFilter || poYearFilter === 'custom') {
    poYearFilter = 'current';
  }

  const minSelectableDate = getPOMinSelectableDate();
  const maxSelectableDate = getPOMaxSelectableDate();
  const selectedYear = getPOSelectedYear();
  const effectiveMinFrom = (poDateFrom && poDateFrom < minSelectableDate) ? poDateFrom : minSelectableDate;
  const effectiveMaxFrom = (poDateTo && poDateTo <= maxSelectableDate) ? poDateTo : maxSelectableDate;
  const effectiveMinTo = (poDateFrom && poDateFrom >= effectiveMinFrom) ? poDateFrom : effectiveMinFrom;
  const effectiveMaxTo = maxSelectableDate;

  return `
  <div class="dashboard-actions-bar">
    <div class="bar-title">📋 Purchase Orders</div>
    <div class="bar-buttons">
      <button class="btn small" onclick="startCreatePO()">+ New Purchase Order</button>
    </div>
  </div>

  ${counts.pending > 0 ? `
  <div class="alert-banner ${currentUser && currentUser.role === 'admin' ? 'danger' : ''}" style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
    <span>⏳ <b>${counts.pending} Purchase Order${counts.pending === 1 ? ' is' : 's are'} Pending Admin Approval.</b> ${currentUser && currentUser.role === 'admin' ? 'Review and approve them so Inventory Staff can receive deliveries.' : 'Waiting for Administrator approval before delivery can be received.'}</span>
    <button class="btn ${currentUser && currentUser.role === 'admin' ? '' : 'secondary'} small" onclick="poFilterStatus='pending'; poSearch=''; resetPaginationPage('purchase_orders'); renderPage()">View Pending (${counts.pending}) &rarr;</button>
  </div>` : ''}

  <div class="po-stat-grid">
    <div class="po-stat-card ${!poFilterStatus ? 'active' : ''}" onclick="poFilterStatus=''; poSearch=''; resetPaginationPage('purchase_orders'); renderPage()">
      <div class="psc-label">Total Orders</div>
      <div class="psc-value">${counts.all}</div>
      <div class="psc-sub">${escapeHtml(formatPODateRangeLabel())}</div>
    </div>
    <div class="po-stat-card pending ${poFilterStatus === 'pending' || poFilterStatus === 'open' || poFilterStatus === 'ordered' || poFilterStatus === 'partial' ? 'active' : ''}" onclick="poFilterStatus='open'; poSearch=''; resetPaginationPage('purchase_orders'); renderPage()">
      <div class="psc-label">Open / Active</div>
      <div class="psc-value">${counts.pending + counts.ordered + counts.partial}</div>
      <div class="psc-sub">${counts.pending ? counts.pending + ' awaiting approval · ' : ''}${peso(pending)} open</div>
    </div>
    <div class="po-stat-card received ${poFilterStatus === 'received' ? 'active' : ''}" onclick="poFilterStatus='received'; poSearch=''; resetPaginationPage('purchase_orders'); renderPage()">
      <div class="psc-label">Received</div>
      <div class="psc-value">${counts.received}</div>
      <div class="psc-sub">${peso(totalSpend)} total spend</div>
    </div>
    <div class="po-stat-card cancelled ${poFilterStatus === 'cancelled' ? 'active' : ''}" onclick="poFilterStatus='cancelled'; poSearch=''; resetPaginationPage('purchase_orders'); renderPage()">
      <div class="psc-label">Cancelled</div>
      <div class="psc-value">${counts.cancelled}</div>
      <div class="psc-sub">&nbsp;</div>
    </div>
  </div>

  <div class="panel" id="po-list-panel" style="padding:0; overflow:hidden;">
    <div class="audit-date-bar po-date-bar" style="border-top:none; border-bottom:1px solid var(--line-light);">
      <div class="audit-date-group">
        <!-- Year Selector (Defaults to Current Year) -->
        <div class="audit-year-wrap">
          <label for="po-year-select" class="audit-date-label">📅 Year:</label>
          <select id="po-year-select" class="audit-year-select" onchange="onPOYearChange(this.value)" title="Filter purchase orders by calendar year">
            <option value="current" ${poYearFilter === 'current' ? 'selected' : ''}>${curY} (Current Year)</option>
            ${availableYears.filter(y => y !== curY).map(y => `<option value="${y}" ${poYearFilter === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
            <option value="all" ${poYearFilter === 'all' ? 'selected' : ''}>All Recorded Years</option>
          </select>
        </div>

        <span class="audit-date-sep">|</span>

        <label class="audit-date-label">Order Date:</label>
        <div class="audit-date-field po-monthday-picker-field" id="po-date-from-wrapper" title="Click to select Month and Day (Year: ${selectedYear})" onclick="openPOCalendar('from', this, event)">
          <span class="field-tag">From</span>
          <input id="po-date-from"
            type="text"
            class="po-monthday-input"
            placeholder="MM/DD/YYYY"
            value="${escapeHtml(formatPOInputDate(poDateFrom))}"
            readonly
            onclick="openPOCalendar('from', this, event)">
          <button type="button" class="po-cal-trigger-btn" onclick="openPOCalendar('from', document.getElementById('po-date-from-wrapper'), event)" title="Open calendar (Month and Day)">📅</button>
        </div>
        <span class="audit-date-sep">to</span>
        <div class="audit-date-field po-monthday-picker-field" id="po-date-to-wrapper" title="Click to select Month and Day (Year: ${selectedYear})" onclick="openPOCalendar('to', this, event)">
          <span class="field-tag">To</span>
          <input id="po-date-to"
            type="text"
            class="po-monthday-input"
            placeholder="MM/DD/YYYY"
            value="${escapeHtml(formatPOInputDate(poDateTo))}"
            readonly
            onclick="openPOCalendar('to', this, event)">
          <button type="button" class="po-cal-trigger-btn" onclick="openPOCalendar('to', document.getElementById('po-date-to-wrapper'), event)" title="Open calendar (Month and Day)">📅</button>
        </div>
        <button type="button" id="po-clear-date-btn" class="audit-clear-date-btn" onclick="clearPODates()" title="Show all time" style="display:${hasDates ? 'inline-flex' : 'none'};">✕</button>
      </div>

      <div class="audit-date-shortcuts">
        <button type="button" class="audit-date-btn ${activePreset === 'today' ? 'active' : ''}" data-preset="today" onclick="setPODatePreset('today')" title="Orders created today">Today</button>
        <button type="button" class="audit-date-btn ${activePreset === 'yesterday' ? 'active' : ''}" data-preset="yesterday" onclick="setPODatePreset('yesterday')" title="Orders created yesterday">Yesterday</button>
        <button type="button" class="audit-date-btn ${activePreset === '7d' ? 'active' : ''}" data-preset="7d" onclick="setPODatePreset('7d')" title="Last 7 days">7D</button>
        <button type="button" class="audit-date-btn ${activePreset === '30d' ? 'active' : ''}" data-preset="30d" onclick="setPODatePreset('30d')" title="Last 30 days">30D</button>
        <button type="button" class="audit-date-btn ${activePreset === 'month' ? 'active' : ''}" data-preset="month" onclick="setPODatePreset('month')" title="This month to date">This Month</button>
        <button type="button" class="audit-date-btn ${activePreset === 'year' ? 'active' : ''}" data-preset="year" onclick="setPODatePreset('year')" title="Current year orders">This Year (${curY})</button>
        <button type="button" class="audit-date-btn ${activePreset === 'custom' ? 'active' : ''}" data-preset="custom" onclick="openPOCalendar('from', document.getElementById('po-date-from-wrapper'), event)" title="Custom date range">Custom Range</button>

        <!-- Separate Historical Records viewing option for authorized users -->
        <button type="button" id="po-historical-btn" class="audit-historical-btn ${isHistorical ? 'active' : ''}" onclick="togglePOHistoricalRecords()" title="View complete historical purchase orders across all previous years">
          🏛️ Historical Records
        </button>
      </div>

      <div class="audit-date-info" id="po-date-summary">
        ${formatDateRangeSummary(poDateFrom, poDateTo, 'Order date:')}
      </div>
    </div>

    ${isHistorical ? `
      <div class="historical-records-banner">
        <div>
          🏛️ <b>Historical Purchase Orders:</b> Showing ${!poDateFrom && !poDateTo ? 'All-Time' : (poDateFrom.slice(0, 4) === poDateTo.slice(0, 4) ? `Year ${poDateFrom.slice(0, 4)}` : `${formatDateReadable(poDateFrom)} – ${formatDateReadable(poDateTo)}`)} orders (<b>${orders.length}</b> orders retained). Historical records are permanently retained in the database.
        </div>
        <button type="button" class="btn ghost small" onclick="setPODatePreset('year')" style="color:var(--warning-text); border-color:var(--warning-border); background:var(--surface);">Return to Current Year (${curY}) &rarr;</button>
      </div>
    ` : ''}

    <div class="po-list-search">
      <span style="font-size:15px; color:var(--ink-soft);">🔍</span>
      <input id="po-search-input" type="text" placeholder="Search by PO number, supplier, or notes…" value="${escapeHtml(poSearch)}" oninput="poSearch=this.value; renderPOListRows()" autocomplete="off">
      <button id="po-search-clear-btn" class="btn ghost small" onclick="poSearch=''; document.getElementById('po-search-input').value=''; renderPOListRows()" title="Clear search" style="display:${poSearch ? 'inline-flex' : 'none'};">✕</button>
      <div style="display:flex; gap:6px; margin-left:8px; flex-wrap:wrap;">
        ${['all', 'pending', 'ordered', 'partial', 'received', 'cancelled'].map(s => {
    const isActive = (s === 'all' && !poFilterStatus) || poFilterStatus === s;
    const label = s === 'partial' ? 'Partial' : s.charAt(0).toUpperCase() + s.slice(1);
    return `<button class="btn ${isActive ? '' : 'secondary'} small" onclick="poFilterStatus='${s === 'all' ? '' : s}'; resetPaginationPage('purchase_orders'); renderPage()">${label}${s !== 'all' ? ' (' + counts[s] + ')' : ''}</button>`;
  }).join('')}
      </div>
    </div>
    <div class="po-list-header">
      <span>PO Number</span><span>Supplier</span><span>Date</span><span>Status</span><span style="text-align:right">Total</span><span style="text-align:center">Action</span>
    </div>
    <div id="po-list-rows">
      ${renderPOListRowsHTML(filtered)}
    </div>
  </div>`;
}

function renderPOListRowsHTML(filtered) {
  if (!filtered) {
    filtered = getFilteredPOs();
  }
  const pag = paginateArray(filtered, 'purchase_orders', {
    onUpdate: () => renderPOListRows(true),
    scrollTarget: '#po-list-panel',
    recordLabel: 'orders'
  });
  const hasFilters = Boolean(poSearch || poDateFrom || poDateTo || poFilterStatus);
  if (!filtered.length) {
    return `<div style="padding:48px; text-align:center; color:var(--ink-soft);">
      <div style="font-size:32px; margin-bottom:10px;">📋</div>
      <div style="font-weight:600; margin-bottom:6px;">${hasFilters ? 'No purchase orders match your filters' : 'No purchase orders yet'}</div>
      <div style="font-size:12.5px;">${hasFilters ? 'Try adjusting the date range, status filter, or search term.' : 'Click <b>+ New Purchase Order</b> to create one.'}</div>
    </div>${pag.html}`;
  }
  const rowsHtml = pag.pagedItems.map((po, i) => {
    const repSum = typeof getPOReplacementSummary === 'function' ? getPOReplacementSummary(po.id) : { activeCount: 0, pendingQty: 0 };
    return `
    <div class="po-summary-row" style="animation-delay:${i * 30}ms" onclick="viewPODetail('${po.id}')">
      <div class="po-num">${escapeHtml(po.poNumber)}</div>
      <div class="po-supplier">${escapeHtml(po.supplierName)}</div>
      <div class="po-date">${formatDateOnly(po.orderDate)}</div>
      <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
        ${poStatusBadge(po.status, po)}
        ${repSum.activeCount > 0 ? `<span class="badge po-partial" title="${repSum.pendingQty} replacement unit(s) pending">🔄 ${repSum.pendingQty} Repl.</span>` : ''}
      </div>
      <div class="po-total">${peso(po.totalAmount)}</div>
      <div class="po-row-actions-cell" onclick="event.stopPropagation()">
        <button type="button" class="po-actions-menu-btn" onclick="togglePORowActionsMenu('${po.id}', this, event)" title="Actions for ${escapeHtml(po.poNumber)}">
          <span>•••</span>
        </button>
      </div>
    </div>`;
  }).join('');
  return rowsHtml + pag.html;
}

function renderPOListRows(keepPage = false) {
  if (!keepPage) {
    resetPaginationPage('purchase_orders');
  }
  const clrBtn = document.getElementById('po-search-clear-btn');
  if (clrBtn) clrBtn.style.display = poSearch ? 'inline-flex' : 'none';
  const el = document.getElementById('po-list-rows');
  if (el) el.innerHTML = renderPOListRowsHTML();
  if (typeof syncRouteState === 'function') syncRouteState({ push: false });
}

function viewPODetail(id) {
  closePOCalendar();
  closeAllPOActionsMenus();
  closePOProductPicker();
  poViewMode = 'detail';
  poDetailId = id;
  if (typeof syncRouteState === 'function') syncRouteState({ push: true });
  renderPage();
}

function backToPOList() {
  closePOCalendar();
  closeAllPOActionsMenus();
  closePOProductPicker();
  poViewMode = 'list';
  poDetailId = null;
  if (typeof syncRouteState === 'function') syncRouteState({ push: true });
  renderPage();
}

/* ----- PO DETAIL ----- */
function poDetailPage() {
  const po = (db.purchaseOrders || []).find(o => o.id === poDetailId);
  if (!po) { backToPOList(); return ''; }
  const items = getPOItems(po);
  const isAdmin = currentUser && currentUser.role === 'admin';
  const isStaff = currentUser && currentUser.role === 'staff';
  const canApprove = isAdmin && po.status === 'pending';
  const canReceive = isStaff && (po.status === 'ordered' || po.status === 'partial');
  const canCancel = (po.status === 'pending' && (isAdmin || isStaff)) || (po.status === 'ordered' && isAdmin);

  // Timeline
  const cancelled = po.status === 'cancelled';
  let steps = [];
  let currentStepIdx = 0;

  if (cancelled) {
    steps = [{ label: 'Requested', icon: '📋', done: true }, { label: 'Approved / Ordered', icon: '📤', done: false }, { label: 'Cancelled', icon: '✕', done: true, cancel: true }];
    currentStepIdx = 2;
  } else if (po.status === 'partial') {
    steps = [{ label: 'Requested', icon: '📋', done: true }, { label: 'Approved / Ordered', icon: '📤', done: true }, { label: 'Partial Delivery', icon: '🚚', done: true, current: true }, { label: 'Fully Received', icon: '📥', done: false }];
    currentStepIdx = 2;
  } else {
    steps = [
      { label: 'Requested', icon: '📋', done: true },
      { label: 'Approved / Ordered', icon: '📤', done: po.status === 'ordered' || po.status === 'received', current: po.status === 'pending' },
      { label: 'Received', icon: '📥', done: po.status === 'received', current: po.status === 'ordered' }
    ];
    currentStepIdx = po.status === 'received' ? 2 : (po.status === 'ordered' ? 1 : 0);
  }

  const timelineHtml = steps.map((s, i) => {
    const cls = s.cancel ? 'cancelled' : (s.current ? 'current' : (s.done && i < currentStepIdx ? 'done' : (i === currentStepIdx ? (s.done ? 'done' : 'current') : '')));
    return `<div class="po-timeline-step ${cls}"><div class="po-timeline-dot">${s.icon}</div><div class="po-timeline-label">${s.label}</div></div>`;
  }).join('');

  return `
  <div style="display:flex; align-items:center; gap:10px; margin-bottom:18px; flex-wrap:wrap;">
    <button class="btn secondary small" onclick="backToPOList()">← Purchase Orders</button>
    <span style="color:var(--ink-soft); font-size:13px;">›</span>
    <span style="font-size:13px; font-weight:600;">${escapeHtml(po.poNumber)}</span>
    <div style="margin-left:auto; display:flex; gap:8px; flex-wrap:wrap;">
      ${canApprove ? `<button class="btn small" onclick="confirmApprovePO('${po.id}')">✓ Approve &amp; Mark Ordered</button>` : ''}
      ${canReceive ? `<button class="btn small" onclick="goToReceivingForPO('${po.id}')">📥 Receive Delivery</button>` : ''}
      ${canCancel ? `<button class="btn danger small" onclick="confirmCancelPO('${po.id}')">✕ ${po.status === 'pending' && isAdmin ? 'Reject / Cancel' : 'Cancel Order'}</button>` : ''}
      <button class="btn secondary small" onclick="printPO('${po.id}')">🖨️ Print PO</button>
    </div>
  </div>

  ${po.status === 'pending' ? `
  <div class="alert-banner ${isAdmin ? 'danger' : ''}" style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
    <div>
      <strong>⏳ Pending Admin Approval</strong> — Requested by <b>${escapeHtml(po.createdBy)}</b>.
      ${isAdmin
        ? 'Approve this order to authorize purchasing and allow Inventory Staff to receive the delivery.'
        : 'This order must be approved by an Administrator before it can be received in Stock Receiving.'}
    </div>
    ${canApprove ? `<button class="btn small" onclick="confirmApprovePO('${po.id}')">✓ Approve Order Now</button>` : ''}
  </div>` : ''}

  <div class="po-timeline">${timelineHtml}</div>

  <div class="panel">
    <div class="panel-head row">
      <h3>Order Details</h3>
      <div class="spacer"></div>
      ${poStatusBadge(po.status, po)}
    </div>
    <div class="panel-body">
      <div class="po-info-grid">
        <div class="po-info-cell"><div class="pic-label">PO Number</div><div class="pic-value">${escapeHtml(po.poNumber)}</div></div>
        <div class="po-info-cell"><div class="pic-label">Supplier</div><div class="pic-value">${escapeHtml(po.supplierName)}</div></div>
        <div class="po-info-cell"><div class="pic-label">Order Date</div><div class="pic-value">${formatDateTime(po.orderDate)}</div></div>
        <div class="po-info-cell"><div class="pic-label">Created By</div><div class="pic-value">${escapeHtml(po.createdBy)}</div></div>
        ${po.receivedAt ? `<div class="po-info-cell"><div class="pic-label">Last Received</div><div class="pic-value">${formatDateTime(po.receivedAt)}</div></div>` : ''}
        <div class="po-info-cell"${!po.receivedAt ? ' style="grid-column: 1 / -1;"' : ''}><div class="pic-label">Notes</div><div class="pic-value">${po.notes ? escapeHtml(po.notes) : '<span style="color:var(--ink-soft)">—</span>'}</div></div>
      </div>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>Brand &amp; Size</th>
              <th class="right">Purchase Cost Per Liter</th>
              <th class="right">Purchase Cost Per Unit</th>
              <th class="right">Ordered</th>
              <th class="right">Received</th>
              <th class="right">Remaining</th>
              <th class="center">Status</th>
              <th class="right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, i) => {
          const ordered = Number(item.qty || 0);
          const accepted = Number(item.acceptedQty !== undefined ? item.acceptedQty : (item.receivedQty !== undefined ? item.receivedQty : (po.status === 'received' ? ordered : 0)));
          const delivered = Number(item.deliveredQty !== undefined ? item.deliveredQty : accepted);
          const damaged = Number(item.damagedQty || 0);
          const returned = Number(item.returnedQty || 0);
          const repReq = Number(item.replacementRequestedQty || 0);
          const repRcvd = Number(item.replacementReceivedQty || 0);
          const received = Number(item.receivedQty !== undefined ? item.receivedQty : (po.status === 'received' ? ordered : 0));
          const remaining = Math.max(0, Number((ordered - received).toFixed(2)));
          const hasDamageOrRep = damaged > 0 || returned > 0 || repReq > 0 || repRcvd > 0;
          const statusBadge = (po.status === 'received' || remaining <= 0)
            ? `<span class="badge ok">✓ Complete</span>`
            : (received > 0 || damaged > 0
              ? `<span class="badge po-partial">${formatStock(received)} / ${formatStock(ordered)}</span>`
              : `<span class="badge inactive">0 / ${formatStock(ordered)}</span>`);
          const p = productById(item.productId);
          const size = Number(item.size) || 1;
          const costInfo = getPOItemCostDetails(item);

          return `
              <tr style="animation:poRowIn .2s ease-out ${i * 30}ms both">
                <td style="color:var(--ink-soft); font-size:12px;">${i + 1}</td>
                <td>
                  <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <strong>${escapeHtml(item.productName)}</strong>
                    <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal-text);">(${getProductHex(p)})</code>
                    ${item.color && item.color !== '-' ? `<span class="muted small"> (${escapeHtml(item.color)})</span>` : ''}
                  </div>
                  ${hasDamageOrRep ? `
                    <div class="muted small" style="margin-top:3px; display:flex; gap:8px; flex-wrap:wrap;">
                      <span>Delivered: <b>${formatStock(delivered)}</b></span>
                      <span style="color:var(--success);">Accepted: <b>${formatStock(accepted)}</b></span>
                      ${damaged > 0 ? `<span style="color:var(--danger-text);">Damaged: <b>${formatStock(damaged)}</b></span>` : ''}
                      ${returned > 0 ? `<span>Returned: <b>${formatStock(returned)}</b></span>` : ''}
                      ${repReq > 0 ? `<span style="color:var(--teal-text);">Repl. Req: <b>${formatStock(repReq)}</b></span>` : ''}
                      ${repRcvd > 0 ? `<span style="color:var(--success);">Repl. Rcvd: <b>${formatStock(repRcvd)}</b></span>` : ''}
                    </div>` : ''}
                </td>
                <td class="muted small">
                  <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                    <span>${escapeHtml(item.brand || '')} · <strong>${fmtSize(size)}</strong></span>
                  </div>
                </td>
                <td class="right" style="font-family:'Space Grotesk',sans-serif;">${peso(costInfo.purchaseCostPerLiter)}</td>
                <td class="right" style="font-family:'Space Grotesk',sans-serif; font-weight:600;">${peso(costInfo.purchaseCostPerUnit)}</td>
                <td class="right"><strong>${formatStock(ordered)}</strong></td>
                <td class="right" style="color:${received > 0 ? 'var(--teal)' : 'var(--ink-soft)'}; font-weight:600;">${formatStock(received)}</td>
                <td class="right" style="color:${remaining > 0 ? 'var(--danger-text)' : 'var(--success)'}; font-weight:700;">${formatStock(remaining)}</td>
                <td class="center">${statusBadge}</td>
                <td class="right" style="font-weight:700; color:var(--teal-dark); font-family:'Space Grotesk',sans-serif;">${peso(costInfo.lineTotal)}</td>
              </tr>`;
        }).join('')}
          </tbody>
        </table>
      </div>

      <div class="po-items-summary">
        <div><div class="po-grand-label">Grand Total · ${items.length} line item${items.length !== 1 ? 's' : ''}</div></div>
        <div class="po-grand-total">${peso(po.totalAmount)}</div>
      </div>
    </div>
  </div>
  ${typeof renderPOReplacementSectionHtml === 'function' ? renderPOReplacementSectionHtml(po) : ''}`;
}

function goToReceivingForPO(id) {
  receivingPOId = id;
  goTo('receiving');
}

function confirmApprovePO(id) {
  const po = (db.purchaseOrders || []).find(o => o.id === id);
  if (!po) return;
  showPOConfirm({
    icon: '✅',
    title: 'Approve Purchase Order?',
    message: `Approve <b>${escapeHtml(po.poNumber)}</b> for <b>${escapeHtml(po.supplierName)}</b> (${peso(po.totalAmount)})? Once approved, it will be marked as <b>Ordered</b> and unlocked for Inventory Staff to receive upon delivery.`,
    confirmLabel: '✓ Yes, Approve Order',
    confirmClass: 'btn',
    onConfirm: () => approvePO(id)
  });
}

async function approvePO(id) {
  if (typeof currentUser === 'undefined' || !currentUser || currentUser.role !== 'admin') {
    showToast('Access denied: Only Administrators can approve purchase orders.', 'error');
    return;
  }
  const po = (db.purchaseOrders || []).find(o => o.id === id);
  if (!po) return;
  if (po.status !== 'pending') {
    showToast(`Purchase Order ${po.poNumber} cannot be approved because its status is "${po.status}".`, 'error');
    return;
  }
  const prevStatus = 'Pending Approval';
  po.status = 'ordered';
  logAudit('PO_APPROVE', 'Purchase Order', `Approved Purchase Order ${po.poNumber} for ${po.supplierName} (${peso(po.totalAmount)})`, {
    entityName: po.poNumber,
    fieldChanged: 'Purchase Order Status',
    oldValue: prevStatus,
    newValue: 'Approved / Ordered',
    referenceNo: po.poNumber,
    reason: po.notes || `Authorized order for ${po.supplierName}`
  });
  await saveDB();
  showToast(`PO ${po.poNumber} approved and marked as Ordered.`, 'ok');
  renderPage();
}

function confirmCancelPO(id) {
  const po = (db.purchaseOrders || []).find(o => o.id === id);
  if (!po) return;
  showPOConfirm({
    icon: '⚠️',
    title: 'Cancel this Order?',
    message: `<b>${escapeHtml(po.poNumber)}</b> will be marked as cancelled. This cannot be undone.`,
    confirmLabel: 'Yes, Cancel Order',
    confirmClass: 'btn danger',
    onConfirm: () => cancelPO(id)
  });
}

function showPOConfirm({ icon, title, message, confirmLabel, confirmClass, onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'po-confirm-overlay';
  overlay.innerHTML = `
    <div class="po-confirm-box">
      <div class="pcb-icon">${icon}</div>
      <h3>${title}</h3>
      <p>${message}</p>
      <div class="pcb-btns">
        <button class="btn secondary" id="pcb-cancel">Cancel</button>
        <button class="${confirmClass}" id="pcb-confirm">${confirmLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#pcb-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#pcb-confirm').onclick = () => { overlay.remove(); onConfirm(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

/* Adds a PO's ordered/partial quantities to stock, logs movements and updates PO status (partial vs received).
   Optional damageMeta[idx] = { damagedQty, reason, inspectionNotes } ensures ONLY accepted (good) cans enter sellable stock. */
async function completePOReceiving(po, refNote = '', batchQtys = null, batchMeta = null, damageMeta = null, receivingTxKey = null) {
  const items = getPOItems(po);
  const date = nowISO();
  const prevPOStatus = po.status === 'partial' ? 'Partial Delivery' : 'Approved / Ordered';
  let receivedItemCount = 0;
  let totalAcceptedUnits = 0;
  let totalDamagedUnits = 0;
  const receivedDetailsList = [];
  const beforeSummaryList = [];
  const afterSummaryList = [];
  const damagedPayloadItems = [];
  let firstProductId = '';

  items.forEach((item, idx) => {
    const p = productById(item.productId);
    const ordered = Number(item.qty || 0);
    const alreadyReceived = Number(item.receivedQty !== undefined ? item.receivedQty : (po.status === 'received' ? ordered : 0));
    const prevAccepted = Number(item.acceptedQty !== undefined ? item.acceptedQty : alreadyReceived);
    const activeRepPending = (typeof getPOItemActiveReplacementPending === 'function')
      ? Number(getPOItemActiveReplacementPending(po.id, item) || 0)
      : Number(item.replacementPendingQty || 0);
    const remaining = Math.max(0, Number((ordered - alreadyReceived - activeRepPending).toFixed(2)));

    let qtyDelivered = remaining;
    if (batchQtys !== null) {
      qtyDelivered = Math.min(remaining, Math.max(0, Number(batchQtys[idx] ?? batchQtys[item.productId] ?? 0)));
    }

    const dm = (damageMeta && (damageMeta[idx] || damageMeta[item.productId])) || null;
    const qtyDamaged = dm ? Math.min(qtyDelivered, Math.max(0, Math.floor(Number(dm.damagedQty || 0)))) : 0;
    const qtyAccepted = Math.max(0, Number((qtyDelivered - qtyDamaged).toFixed(2)));

    if (qtyDelivered > 0) {
      receivedItemCount++;
      // Only ACCEPTED stock counts toward PO receivedQty; keep direct acceptedQty separate from replacementReceivedQty
      const newReceivedTotal = Number((alreadyReceived + qtyAccepted).toFixed(2));
      const newAcceptedTotal = Number((prevAccepted + qtyAccepted).toFixed(2));
      const prevDamaged = Number(item.damagedQty || 0);
      const prevDelivered = Number(item.deliveredQty !== undefined ? item.deliveredQty : alreadyReceived);
      item.receivedQty = newReceivedTotal;
      item.acceptedQty = newAcceptedTotal;
      item.damagedQty = Number((prevDamaged + qtyDamaged).toFixed(2));
      item.deliveredQty = Number((prevDelivered + qtyDelivered).toFixed(2));

      totalAcceptedUnits += qtyAccepted;
      totalDamagedUnits += qtyDamaged;

      const size = Number(item.size) || 1;
      const variant = p ? productSizeVariantBySize(p, size) : null;
      const sizeId = item.sizeId || (variant ? variant.sizeId : null);
      const bm = (batchMeta && (batchMeta[idx] || batchMeta[item.productId])) || {};
      const datePart = String(date || '').slice(0, 10).replace(/-/g, '') || new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randPart = (typeof uid === 'function' ? uid('') : Math.random().toString(36).slice(2, 8)).replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
      const batchNumber = (bm.batchNumber && String(bm.batchNumber).trim()) ? String(bm.batchNumber).trim() : `LOT-${datePart}-${randPart}${idx}`;

      if (p && qtyAccepted > 0) {
        if (!firstProductId) firstProductId = p.productId || p.id;
        const liters = Number((qtyAccepted * size).toFixed(2));
        const beforeStock = Number(p.stock) || 0;
        const beforeCans = productCanCount(p, size);
        const afterCans = beforeCans + qtyAccepted;
        if (!p.canStock || Array.isArray(p.canStock) || typeof p.canStock !== 'object') p.canStock = {};
        p.canStock[size] = afterCans;
        syncProductVariants(p);
        normalizeProductOpenedStock(p);
        const afterStock = productHasCanBreakdown(p) ? canBreakdownLiters(p) : Number((beforeStock + liters).toFixed(2));
        p.stock = afterStock;
        syncProductVariants(p);
        const dmgSuffix = qtyDamaged > 0 ? `, ${qtyDamaged} damaged/rejected excluded` : '';
        receivedDetailsList.push(`${p.name} (${qtyAccepted} × ${size}L = +${formatStock(liters)}L${dmgSuffix})`);
        beforeSummaryList.push(`${p.name} (${size}L): ${beforeCans} units (${formatStock(beforeStock)}L total)`);
        afterSummaryList.push(`${p.name} (${size}L): ${afterCans} units (${formatStock(p.stock)}L total)`);
        const unitCostVal = item.unitCost !== undefined ? Number(item.unitCost) : (item.purchaseCostPerUnit !== undefined ? Number(item.purchaseCostPerUnit) : null);
        const inspNote = (dm && dm.inspectionNotes) ? dm.inspectionNotes : '';
        const combinedNote = [bm.notes || refNote, inspNote].filter(Boolean).join(' · ');
        db.movements.push({
          id: uid('mv'),
          date,
          type: 'receiving',
          productId: p.productId || p.id,
          product_id: p.productId || p.id,
          sizeId: sizeId,
          size_id: sizeId,
          container_size: size,
          productName: p.name,
          qtyChange: liters,
          batch: {
            batchNumber: batchNumber,
            expirationDate: bm.expirationDate || null,
            notes: combinedNote || null,
            unitCost: unitCostVal,
            supplierId: po.supplierId || null,
            supplierName: po.supplierName || null,
            poId: po.id || null,
            poNumber: po.poNumber || null
          },
          note: `PO Delivery (Inspected): ${po.poNumber} (${po.supplierName}) [Delivered ${qtyDelivered}, Accepted ${qtyAccepted} × ${size}L (+${formatStock(liters)}L)${qtyDamaged > 0 ? `, Rejected ${qtyDamaged}` : ''} · ${size}L Units: ${beforeCans}→${afterCans}, Stock: ${formatStock(beforeStock)}L→${formatStock(p.stock)}L, PO: ${newAcceptedTotal}/${ordered}]${combinedNote ? ' — ' + combinedNote : ''}`,
          staffName: (currentUser && currentUser.name) || 'Staff'
        });
      }

      if (qtyDamaged > 0) {
        damagedPayloadItems.push({
          productId: p ? (p.productId || p.id) : (item.productId || ''),
          productName: p ? p.name : (item.productName || 'Product'),
          sizeId: sizeId,
          containerSize: size,
          deliveredQty: qtyDelivered,
          acceptedQty: qtyAccepted,
          damagedQty: qtyDamaged,
          reason: (dm && dm.reason) ? dm.reason : '',
          inspectionNotes: (dm && dm.inspectionNotes) ? dm.inspectionNotes : '',
          handling: (dm && dm.handling) ? dm.handling : 'returned_to_driver',
          batchNumber: qtyAccepted > 0 ? batchNumber : null
        });
      }
    } else {
      item.receivedQty = alreadyReceived;
    }
  });

  const repSumNow = typeof getPOReplacementSummary === 'function' ? getPOReplacementSummary(po.id) : { activeCount: 0 };
  const allCompleted = (repSumNow.activeCount === 0) && items.every(it => Number(it.receivedQty || 0) >= Number(it.qty || 0));
  po.status = allCompleted ? 'received' : 'partial';
  po.receivedAt = date;
  po.items = items;
  po.itemsJson = JSON.stringify(items);

  if (receivedItemCount > 0 && typeof logAudit === 'function') {
    if (receivedDetailsList.length > 0) {
      const rcvSummary = receivedDetailsList.join(', ');
      logAudit('STOCK_RECEIVE', 'Inventory', `Received stock delivery for ${po.poNumber} (${po.supplierName}): ${rcvSummary}`, {
        productId: firstProductId,
        entityName: receivedDetailsList.length === 1 ? receivedDetailsList[0].split(' (')[0] : `${po.poNumber} (${receivedItemCount} items)`,
        fieldChanged: 'Sealed Stock Quantity',
        oldValue: beforeSummaryList.join(' · '),
        newValue: afterSummaryList.join(' · '),
        referenceNo: po.poNumber,
        reason: refNote || `Supplier Delivery from ${po.supplierName}`
      });
    }

    const poSummaryText = receivedDetailsList.length > 0
      ? receivedDetailsList.join(', ')
      : `${totalDamagedUnits} damaged unit(s) quarantined (0 added to sellable stock)`;
    logAudit('PO_RECEIVE', 'Purchase Order', `${allCompleted ? 'Fully received' : 'Partially received'} Purchase Order ${po.poNumber} from ${po.supplierName} (${receivedItemCount} item${receivedItemCount === 1 ? '' : 's'}${totalDamagedUnits > 0 ? `, ${totalDamagedUnits} damaged` : ''})`, {
      entityName: po.poNumber,
      fieldChanged: 'Purchase Order Status',
      oldValue: prevPOStatus,
      newValue: allCompleted ? 'Fully Received' : 'Partial Delivery',
      referenceNo: po.poNumber,
      reason: poSummaryText
    });
  }

  await saveDB();

  let damagedRecorded = false;
  let autoReturnRef = null;
  let firstDamagedRecordId = null;
  let autoReplacementRefs = [];
  if (damagedPayloadItems.length > 0) {
    try {
      const resp = await fetch('api/supplier_returns.php?action=record_receiving_damage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poId: po.id,
          poNumber: po.poNumber,
          supplierId: po.supplierId || '',
          supplierName: po.supplierName || '',
          receivingTxKey: receivingTxKey || (`rcvtx_${po.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
          autoGenerateReplacement: true,
          items: damagedPayloadItems
        })
      });
      const json = await resp.json();
      if (json && json.success) {
        damagedRecorded = true;
        autoReturnRef = json.autoReturnRef || null;
        firstDamagedRecordId = (Array.isArray(json.createdIds) && json.createdIds[0]) ? json.createdIds[0] : null;
        autoReplacementRefs = Array.isArray(json.autoReplacementRefs) ? json.autoReplacementRefs : [];
        if (typeof applySupplierReturnsPayload === 'function') {
          applySupplierReturnsPayload(json);
        }
        if (typeof loadDB === 'function') {
          await loadDB();
        }
      } else {
        showToast((json && json.error) || 'Warning: Accepted stock was saved, but damaged/replacement tracking failed to record. Please log it in Replacement Tracking.', 'error');
      }
    } catch (err) {
      console.error('Failed to record receiving damaged stock:', err);
      showToast('Warning: Accepted stock was saved, but damaged/replacement tracking could not reach the server.', 'error');
    }
  }

  return { items, allCompleted, receivedItemCount, totalAcceptedUnits, totalDamagedUnits, damagedRecorded, autoReturnRef, firstDamagedRecordId, autoReplacementRefs };
}

async function cancelPO(id) {
  const po = (db.purchaseOrders || []).find(o => o.id === id);
  if (!po) return;
  const wasPending = po.status === 'pending';
  const isAdmin = currentUser && currentUser.role === 'admin';
  const prevStatus = wasPending ? 'Pending Approval' : (po.status === 'ordered' ? 'Approved / Ordered' : po.status);
  po.status = 'cancelled';
  const actionCode = (wasPending && isAdmin) ? 'PO_REJECT' : 'PO_CANCEL';
  const actionVerb = (wasPending && isAdmin) ? 'Rejected / Cancelled' : 'Cancelled';
  logAudit(actionCode, 'Purchase Order', `${actionVerb} Purchase Order ${po.poNumber} (${po.supplierName}, ${peso(po.totalAmount)})`, {
    entityName: po.poNumber,
    fieldChanged: 'Purchase Order Status',
    oldValue: prevStatus,
    newValue: (wasPending && isAdmin) ? 'Rejected / Cancelled' : 'Cancelled',
    referenceNo: po.poNumber,
    reason: po.notes || `${actionVerb} by ${(currentUser && currentUser.name) || 'User'}`
  });
  await saveDB();
  showToast(`PO ${po.poNumber} cancelled.`, 'ok');
  renderPage();
}

function printPO(id) {
  const po = (db.purchaseOrders || []).find(o => o.id === id);
  if (!po) return;
  const items = getPOItems(po);
  const win = window.open('', '_blank', 'width=794,height=1123');
  if (!win) {
    showToast('Popup blocker prevented PO print window from opening. Please allow popups.', 'error');
    return;
  }
  win.document.write(`<html><head><title>Purchase Order — ${escapeHtml(po.poNumber)}</title>
    <style>body{font-family:'Inter',Arial,sans-serif;padding:40px;color:#26211C;font-size:13px}
    h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;margin:0 0 16px;color:#6B6259;font-weight:500}
    table{width:100%;border-collapse:collapse;margin:18px 0}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #E2DACD}
    th{font-size:11px;text-transform:uppercase;color:#6B6259;background:#FBF8F2}td.right,th.right{text-align:right}
    .total-row{font-weight:700;font-size:15px;text-align:right;padding-top:14px}
    .meta{font-size:12.5px;line-height:1.8;margin-bottom:10px;color:#6B6259}
    .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600}
    .footer{margin-top:36px;border-top:1px solid #E2DACD;padding-top:14px;font-size:11px;color:#8A8070}
    @page{size:A4 portrait;margin:12mm}
    @media print{body{padding:0}}
    </style></head><body>
    <div style="display:flex; align-items:center; gap:14px; margin-bottom:16px;">
      <img src="assets/images/logo.png" alt="MRGR Logo" style="width:50px; height:50px; border-radius:50%; object-fit:cover;">
      <div>
        <h1 style="margin:0 0 4px;">Purchase Order: ${escapeHtml(po.poNumber)}</h1>
        <h2 style="margin:0; font-size:14px; color:var(--ink-soft); font-weight:500;">MRGR Color Center</h2>
      </div>
    </div>
    <div class="meta">
      <strong>Supplier:</strong> ${escapeHtml(po.supplierName)}<br>
      <strong>Date:</strong> ${formatDateTime(po.orderDate)}<br>
      <strong>Status:</strong> ${po.status.charAt(0).toUpperCase() + po.status.slice(1)}<br>
      <strong>Created By:</strong> ${escapeHtml(po.createdBy)}
      ${po.notes ? `<br><strong>Notes:</strong> ${escapeHtml(po.notes)}` : ''}
    </div>
    <table>
      <thead><tr><th>#</th><th>Product</th><th>Brand &amp; Size</th><th class="right">Purchase Cost Per Liter</th><th class="right">Purchase Cost Per Unit</th><th class="right">Ordered</th><th class="right">Received</th><th class="right">Remaining</th><th class="right">Line Total</th></tr></thead>
      <tbody>${items.map((item, i) => {
    const ordered = Number(item.qty || 0);
    const received = Number(item.receivedQty !== undefined ? item.receivedQty : (po.status === 'received' ? ordered : 0));
    const remaining = Math.max(0, Number((ordered - received).toFixed(2)));
    const hex = getProductHex(productById(item.productId));
    const costInfo = getPOItemCostDetails(item);
    return `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(item.productName)}${hex ? ` (${hex})` : ''}${item.color && item.color !== '-' ? ` (${escapeHtml(item.color)})` : ''}</td>
          <td>${escapeHtml(item.brand || '')} · ${fmtSize(costInfo.size)}</td>
          <td class="right">₱${Number(costInfo.purchaseCostPerLiter).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="right">₱${Number(costInfo.purchaseCostPerUnit).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="right">${formatStock(ordered)}</td>
          <td class="right">${formatStock(received)}</td>
          <td class="right">${formatStock(remaining)}</td>
          <td class="right">₱${Number(costInfo.lineTotal).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>`;
  }).join('')}</tbody>
    </table>
    <div class="total-row">Grand Total: ₱${Number(po.totalAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
    <div class="footer">Generated by MRGR Color Center — Sales & Inventory System · ${new Date().toLocaleString('en-PH')}</div>
    </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

/* ----- PO CREATE ----- */
// ============================================================
// REDESIGNED PURCHASE ORDER WORKFLOW: 4-STEP WIZARD
// 1. SELECT MULTIPLE PRODUCTS -> 2. SELECT ONE COMMON SUPPLIER
// -> 3. REVIEW ORDER -> 4. SUBMIT PURCHASE ORDER
// ============================================================

poWizardStep = 1;
poSelectedKeys = new Set();
poCatalogSearch = '';
poCatalogCategory = 'all';
poCatalogStockFilter = 'all';
poSupplierId = '';
poReviewRows = [];
poNotes = '';

function startCreatePO() {
  closePOCalendar();
  closeAllPOActionsMenus();
  closePOProductPicker();
  currentPage = 'purchaseOrders';
  poViewMode = 'create';
  poWizardStep = 1;
  poSelectedKeys = new Set();
  poSupplierId = '';
  poReviewRows = [];
  poCatalogSearch = '';
  poCatalogCategory = 'all';
  poCatalogStockFilter = 'all';
  poNotes = window._poInitialNotes || '';
  window._poInitialNotes = '';
  if (typeof syncRouteState === 'function') syncRouteState({ push: true });
  renderPage();
}

function poCreatePage() {
  const step = poWizardStep || 1;

  let stepBodyHtml = '';
  if (step === 1) {
    stepBodyHtml = renderPOWizardStep1Html();
  } else if (step === 2) {
    stepBodyHtml = renderPOWizardStep2Html();
  } else if (step === 3) {
    stepBodyHtml = renderPOWizardStep3Html();
  }

  const selectedCount = poSelectedKeys.size;
  const uniqueSelectedProducts = new Set();
  poSelectedKeys.forEach(k => uniqueSelectedProducts.add(k.split('__')[0]));
  const activeSupplier = poSupplierId ? supplierById(poSupplierId) : null;

  return `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
      <button class="btn secondary small" onclick="backToPOList()">← Purchase Orders</button>
      <span style="color:var(--ink-soft); font-size:13px;">›</span>
      <span style="font-size:13px; font-weight:600; color:var(--ink);">Create Purchase Order</span>
    </div>

    <div class="panel" style="border:1px solid var(--line); border-radius:var(--radius); box-shadow:var(--shadow-sm); background:var(--surface);">
      <div class="panel-head row" style="border-bottom:1px solid var(--line-light); padding:16px 20px;">
        <div>
          <h3 style="margin:0; font-size:18px; color:var(--ink); font-weight:700;">📋 Create Purchase Order</h3>
          <div class="muted small" style="margin-top:3px;">
            Product-First Procurement Workflow: Select Products → Select One Common Supplier → Review &amp; Submit Order
          </div>
        </div>
        <div class="spacer"></div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${currentUser && currentUser.role === 'admin' ? `
            <button type="button" class="btn secondary small" onclick="openManageProductSuppliersModal()" title="Configure accredited suppliers, costs, and MOQs">⚙️ Manage Product Suppliers</button>
          ` : ''}
          <button type="button" class="btn secondary small" onclick="backToPOList()">Cancel</button>
        </div>
      </div>

      <div class="panel-body" style="padding:18px 20px;">
        <!-- Clean Step-by-Step Progress Bar -->
        <div class="po-wizard-progress">
          
          <!-- Step 1 Indicator -->
          <div class="po-wizard-step ${step === 1 ? 'active' : 'completed'} clickable" onclick="poWizardGoToStep(1)" title="Click to view/edit product selection">
            <span class="po-wizard-step-circle">
              ${step > 1 ? '✓' : '1'}
            </span>
            <div class="po-wizard-step-info">
              <div class="po-wizard-step-title">1. Select Products</div>
              <div class="po-wizard-step-sub">
                ${selectedCount > 0 ? `<b>${selectedCount}</b> size${selectedCount === 1 ? '' : 's'} (${uniqueSelectedProducts.size} prod${uniqueSelectedProducts.size === 1 ? '' : 's'})` : 'Choose items &amp; sizes'}
              </div>
            </div>
          </div>

          <span class="po-wizard-arrow">›</span>

          <!-- Step 2 Indicator -->
          <div class="po-wizard-step ${step === 2 ? 'active' : (step > 2 ? 'completed' : '')} ${selectedCount > 0 ? 'clickable' : ''}" ${selectedCount > 0 ? 'onclick="poWizardGoToStep(2)"' : ''} title="${selectedCount > 0 ? 'Click to select supplier' : 'Select products first'}">
            <span class="po-wizard-step-circle">
              ${step > 2 ? '✓' : '2'}
            </span>
            <div class="po-wizard-step-info">
              <div class="po-wizard-step-title">2. Select Supplier</div>
              <div class="po-wizard-step-sub">
                ${activeSupplier ? escapeHtml(activeSupplier.name) : '1 common supplier'}
              </div>
            </div>
          </div>

          <span class="po-wizard-arrow">›</span>

          <!-- Step 3 Indicator -->
          <div class="po-wizard-step ${step === 3 ? 'active' : ''} ${activeSupplier && selectedCount > 0 ? 'clickable' : ''}" ${activeSupplier && selectedCount > 0 ? 'onclick="poWizardGoToStep(3)"' : ''} title="${activeSupplier && selectedCount > 0 ? 'Click to review order' : 'Select supplier first'}">
            <span class="po-wizard-step-circle">
              3
            </span>
            <div class="po-wizard-step-info">
              <div class="po-wizard-step-title">3. Review &amp; Submit</div>
              <div class="po-wizard-step-sub">Costs, MOQs &amp; approval</div>
            </div>
          </div>

        </div>

        <!-- Step Body Container -->
        <div id="po-wizard-step-container">
          ${stepBodyHtml}
        </div>
      </div>
    </div>
  `;
}

/** Render a prominent color pill with swatch dot and color name for the PO wizard. */
function poRenderColorPill(color, colorHex) {
  if (!color) return '';
  const swatch = colorHex
    ? `<span class="po-color-swatch" style="background:${escapeHtml(colorHex)};"></span>`
    : '';
  return `<span class="po-color-pill">${swatch}${escapeHtml(color)}</span>`;
}

// ------------------------------------------------------------
// STEP 1: SELECT MULTIPLE PRODUCTS (GROUPED BY PRODUCT)
// ------------------------------------------------------------

function renderPOWizardStep1Html() {
  const allProds = activeProducts();
  const search = (poCatalogSearch || '').trim().toLowerCase();
  const cat = poCatalogCategory || 'all';
  const stockFilter = poCatalogStockFilter || 'all';

  // Extract distinct categories
  const categories = Array.from(new Set(allProds.map(p => p.category || p.type).filter(Boolean))).sort();

  // Group container sizes under their respective products
  const groupedProducts = [];
  let totalAvailableMatchingSizes = 0;

  allProds.forEach(p => {
    // Check product-level category
    const catMatch = (cat === 'all') || (p.category === cat) || (p.type === cat);
    if (!catMatch) return;

    const sizes = poSizesFor(p);
    const matchingSizes = [];

    sizes.forEach(s => {
      const sizeVal = Number(s) || 1;
      const count = productCanCount(p, sizeVal);
      const thresh = productSizeThreshold(p, sizeVal);
      const isLowOrOut = count <= thresh;

      // Stock filter
      if (stockFilter === 'low_out' && !isLowOrOut) return;
      if (stockFilter === 'in_stock' && isLowOrOut) return;

      // Search match
      if (search) {
        const textToMatch = `${p.name} ${p.brand || ''} ${p.category || ''} ${p.type || ''} ${p.color || ''} ${p.id || ''} ${fmtSize(sizeVal)}`.toLowerCase();
        if (!textToMatch.includes(search)) return;
      }

      const key = `${p.id}__${sizeVal}`;
      const suppliers = getSuppliersForProductAndSize(p.id, sizeVal);

      matchingSizes.push({
        key,
        size: sizeVal,
        count,
        thresh,
        isLowOrOut,
        suppliers
      });
      totalAvailableMatchingSizes++;
    });

    if (matchingSizes.length > 0) {
      groupedProducts.push({
        product: p,
        sizes: matchingSizes
      });
    }
  });

  const selectedCount = poSelectedKeys.size;
  const uniqueSelectedProducts = new Set();
  poSelectedKeys.forEach(k => uniqueSelectedProducts.add(k.split('__')[0]));

  // Check if all visible matching sizes are selected
  const allVisibleKeys = [];
  groupedProducts.forEach(grp => grp.sizes.forEach(sz => allVisibleKeys.push(sz.key)));
  const allVisibleSelected = allVisibleKeys.length > 0 && allVisibleKeys.every(k => poSelectedKeys.has(k));

  return `
    <div class="po-catalog-panel">
      <!-- Toolbar: Search, Filters, Selection Count & Continue -->
      <div class="po-catalog-toolbar" style="background:var(--surface-2); border:1px solid var(--line); border-radius:var(--radius); padding:14px 16px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
          <div>
            <h4 style="margin:0; font-size:15px; color:var(--ink); font-weight:700;">📦 Step 1: Select Products &amp; Container Sizes</h4>
            <div class="muted small" style="margin-top:2px;">
              Container sizes are grouped under each product. Select the sizes you want to order using the checkboxes.
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span class="badge ${selectedCount > 0 ? 'ok' : 'ghost'}" style="font-size:12.5px; padding:6px 12px; border-radius:var(--radius-sm);">
              <b>${selectedCount}</b> size${selectedCount === 1 ? '' : 's'} selected across <b>${uniqueSelectedProducts.size}</b> product${uniqueSelectedProducts.size === 1 ? '' : 's'}
            </span>
            <button type="button" class="btn" id="btn-po-continue-step2" onclick="poWizardGoToStep(2)" ${selectedCount === 0 ? 'disabled' : ''} style="box-shadow:var(--shadow-sm); font-weight:700; padding:8px 18px;">
              Continue to Supplier Selection → (${selectedCount} selected)
            </button>
          </div>
        </div>

        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <!-- Search box -->
          <div style="flex:1; min-width:220px; position:relative;">
            <input type="text" id="po-catalog-search-input" placeholder="🔍 Search by product name, brand, color, SKU..." value="${escapeHtml(poCatalogSearch)}" oninput="onPOCatalogSearchChange(this.value)" style="width:100%; padding:7px 12px; border:1px solid var(--line); border-radius:var(--radius-sm); font-size:13px; background:var(--surface);">
            ${poCatalogSearch ? `<button type="button" onclick="onPOCatalogSearchChange('')" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--ink-soft); cursor:pointer; font-size:14px;">✕</button>` : ''}
          </div>

          <!-- Category filter -->
          <div style="min-width:160px;">
            <select id="po-catalog-cat-select" onchange="onPOCatalogCategoryChange(this.value)" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:var(--radius-sm); font-size:13px; background:var(--surface);">
              <option value="all" ${cat === 'all' ? 'selected' : ''}>All Categories</option>
              ${categories.map(c => `<option value="${escapeHtml(c)}" ${cat === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>

          <!-- Stock level filter -->
          <div style="min-width:160px;">
            <select id="po-catalog-stock-select" onchange="onPOCatalogStockChange(this.value)" style="width:100%; padding:7px 10px; border:1px solid var(--line); border-radius:var(--radius-sm); font-size:13px; background:var(--surface);">
              <option value="all" ${stockFilter === 'all' ? 'selected' : ''}>All Stock Levels</option>
              <option value="low_out" ${stockFilter === 'low_out' ? 'selected' : ''}>⚠️ Low / Out of Stock</option>
              <option value="in_stock" ${stockFilter === 'in_stock' ? 'selected' : ''}>🟢 In Stock Only</option>
            </select>
          </div>

          <!-- Bulk select actions -->
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn secondary small" onclick="poToggleSelectAllVisible(${!allVisibleSelected})">
              ${allVisibleSelected ? 'Deselect Visible' : 'Select All Visible'}
            </button>
            ${selectedCount > 0 ? `
              <button type="button" class="btn secondary small" onclick="poClearProductSelection()" style="color:var(--danger);">Clear Selection</button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Grouped Product Catalog Table -->
      ${groupedProducts.length === 0 ? `
        <div style="text-align:center; padding:40px 20px; background:var(--surface-2); border:1px dashed var(--line); border-radius:var(--radius);">
          <div style="font-size:32px; margin-bottom:8px;">🔍</div>
          <div style="font-weight:700; color:var(--ink); font-size:15px;">No products match your search or filter</div>
          <div class="muted small" style="margin-top:4px;">Try clearing search keywords or selecting "All Categories" and "All Stock Levels".</div>
          <div style="margin-top:14px;">
            <button type="button" class="btn secondary small" onclick="poResetCatalogFilters()">Reset Filters</button>
          </div>
        </div>
      ` : `
        <div style="border:1px solid var(--line); border-radius:var(--radius); overflow:hidden; background:var(--surface); margin-bottom:16px;">
          <table class="table" style="margin:0; width:100%; border-collapse:collapse;">
            <thead>
              <tr style="background:var(--surface-2); border-bottom:1px solid var(--line);">
                <th style="width:36%; padding:10px 14px; font-size:12px; font-weight:700; color:var(--ink-soft); text-transform:uppercase;">
                  Product Information
                </th>
                <th style="width:64%; padding:10px 14px; font-size:12px; font-weight:700; color:var(--ink-soft); text-transform:uppercase;">
                  Grouped Container Sizes &amp; Available Stock
                </th>
              </tr>
            </thead>
            <tbody>
              ${groupedProducts.map(grp => {
    const p = grp.product;
    const pSizes = grp.sizes;
    const allThisProdSelected = pSizes.every(sz => poSelectedKeys.has(sz.key));
    const someThisProdSelected = pSizes.some(sz => poSelectedKeys.has(sz.key));

    return `
                  <tr class="po-product-row" style="border-bottom:1px solid var(--line);">
                    <!-- Left Column: Product Info & Select All Sizes button -->
                    <td style="vertical-align:top; padding:14px; background:var(--surface-2); border-right:1px solid var(--line-light);">
                      <div style="font-weight:700; color:var(--ink); font-size:14px; line-height:1.3;">
                        ${escapeHtml(p.name)}
                      </div>
                      
                      <div style="display:flex; align-items:center; gap:8px; margin-top:4px; flex-wrap:wrap;">
                        <span class="badge ghost small" style="background:var(--surface); font-weight:600;">${escapeHtml(p.brand || '—')}</span>
                        <span class="badge ghost small" style="background:var(--surface);">${escapeHtml(p.category || p.type || 'General')}</span>
                        ${poRenderColorPill(p.color, p.colorHex)}
                      </div>

                      <div class="muted small" style="margin-top:6px; font-size:11px;">
                        ID: <b>${escapeHtml(p.id)}</b> · ${pSizes.length} size${pSizes.length === 1 ? '' : 's'} available
                      </div>

                      <div style="margin-top:10px;">
                        <button type="button" class="btn secondary micro" onclick="poToggleAllProductSizes('${p.id}')" style="font-size:11.5px; padding:3px 8px;">
                          ${allThisProdSelected ? '✕ Deselect All Sizes' : '✓ Select All Sizes'}
                        </button>
                      </div>
                    </td>

                    <!-- Right Column: Container sizes grouped under this product -->
                    <td style="vertical-align:top; padding:8px 10px;">
                      <div class="po-grouped-sizes-list" style="display:flex; flex-direction:column; gap:6px;">
                        ${pSizes.map(sz => {
      const isChecked = poSelectedKeys.has(sz.key);
      const suppCount = sz.suppliers.length;
      const supplierNames = sz.suppliers.map(s => s.supplier ? s.supplier.name : s.supplierId).join(', ');

      return `
                            <div class="po-size-item-row po-catalog-row ${isChecked ? 'selected' : ''}" style="display:flex; align-items:center; gap:12px; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid ${isChecked ? 'var(--teal)' : 'var(--line-light)'}; background:${isChecked ? 'var(--teal-tint)' : 'var(--surface-2)'}; cursor:pointer; transition:all 0.12s ease;" onclick="poToggleProductSize('${p.id}', ${sz.size})">
                              <!-- Checkbox -->
                              <div onclick="event.stopPropagation()" style="display:flex; align-items:center;">
                                <input type="checkbox" id="chk_${p.id}_${sz.size}" ${isChecked ? 'checked' : ''} onchange="poToggleProductSize('${p.id}', ${sz.size})" style="cursor:pointer; width:16px; height:16px;">
                              </div>

                              <!-- Size Badge -->
                              <div style="min-width:85px;">
                                <span class="badge ghost small" style="background:var(--surface); border:1px solid var(--line); font-weight:700; font-size:12px; color:var(--ink);">
                                  ${fmtSize(sz.size)}
                                </span>
                              </div>

                              <!-- Available Store Stock -->
                              <div style="min-width:160px; display:flex; align-items:center; gap:8px;">
                                <span style="font-weight:700; font-family:'Space Grotesk',sans-serif; font-size:13.5px; color:${sz.isLowOrOut ? 'var(--danger)' : 'var(--ink)'};">
                                  ${sz.count} unit${sz.count === 1 ? '' : 's'}
                                </span>
                                ${sz.count === 0 ? `
                                  <span class="badge danger small">Out of Stock</span>
                                ` : (sz.count <= sz.thresh ? `
                                  <span class="badge warning small" title="Threshold: ${sz.thresh}">Low Stock</span>
                                ` : `
                                  <span class="badge ok small">In Stock</span>
                                `)}
                              </div>

                              <!-- Linked Suppliers Details -->
                              <div style="flex:1; display:flex; align-items:center; justify-content:flex-end; gap:8px; flex-wrap:wrap;">
                                ${suppCount === 0 ? `
                                  <span class="badge small" style="background:var(--danger-bg); color:var(--danger-text); border:1px solid var(--danger-border);">
                                    ⚠️ No supplier linked
                                  </span>
                                ` : `
                                  <span class="badge small" style="background:var(--teal-tint); color:var(--teal-dark); border:1px solid var(--teal-tint-border);" title="${escapeHtml(supplierNames)}">
                                    ✓ ${suppCount} supplier${suppCount === 1 ? '' : 's'}
                                  </span>
                                  <span class="muted small" style="font-size:11px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(supplierNames)}">
                                    ${escapeHtml(supplierNames)}
                                  </span>
                                `}
                              </div>
                            </div>
                          `;
    }).join('')}
                      </div>
                    </td>
                  </tr>
                `;
  }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Sticky / Bottom Continue Action Bar -->
        <div style="padding:14px 18px; background:var(--surface-2); border:1px solid var(--line); border-radius:var(--radius); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <span style="font-size:13.5px; font-weight:700; color:var(--ink);">
              ${selectedCount > 0 ? `Selected <b>${selectedCount}</b> size${selectedCount === 1 ? '' : 's'} across <b>${uniqueSelectedProducts.size}</b> product${uniqueSelectedProducts.size === 1 ? '' : 's'}` : 'No products selected yet'}
            </span>
            <div class="muted small">All selected products will be verified for common supplier eligibility in Step 2.</div>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <button type="button" class="btn secondary" onclick="backToPOList()">Cancel</button>
            <button type="button" class="btn" onclick="poWizardGoToStep(2)" ${selectedCount === 0 ? 'disabled' : ''} style="box-shadow:var(--shadow-sm); font-weight:700; padding:8px 18px;">
              Continue to Supplier Selection → (${selectedCount} selected)
            </button>
          </div>
        </div>
      `}
    </div>
  `;
}

function poToggleAllProductSizes(productId) {
  const p = productById(productId);
  if (!p) return;
  const sizes = poSizesFor(p);
  const keys = sizes.map(s => `${p.id}__${Number(s) || 1}`);

  const allSelected = keys.every(k => poSelectedKeys.has(k));
  if (allSelected) {
    keys.forEach(k => {
      poSelectedKeys.delete(k);
      const [pid, sz] = k.split('__');
      poReviewRows = poReviewRows.filter(r => !(r.productId === pid && Number(r.containerSize) === Number(sz)));
    });
  } else {
    keys.forEach(k => poSelectedKeys.add(k));
  }

  // If supplier was previously locked, check if still valid
  if (poSupplierId) {
    const { commonSuppliers } = findCommonSuppliersForSelectedItems(poSelectedKeys);
    if (!commonSuppliers.some(s => s.id === poSupplierId)) {
      poSupplierId = '';
    }
  }

  renderPage();
}

function onPOCatalogSearchChange(val) {
  poCatalogSearch = val;
  const container = document.getElementById('po-wizard-step-container');
  if (container && poWizardStep === 1) {
    container.innerHTML = renderPOWizardStep1Html();
    const input = document.getElementById('po-catalog-search-input');
    if (input) {
      input.focus();
      input.selectionStart = input.selectionEnd = input.value.length;
    }
  }
}

function onPOCatalogCategoryChange(val) {
  poCatalogCategory = val;
  renderPage();
}

function onPOCatalogStockChange(val) {
  poCatalogStockFilter = val;
  renderPage();
}

function poResetCatalogFilters() {
  poCatalogSearch = '';
  poCatalogCategory = 'all';
  poCatalogStockFilter = 'all';
  renderPage();
}

function poToggleProductSize(productId, containerSize) {
  const sizeVal = Number(containerSize) || 1;
  const key = `${productId}__${sizeVal}`;

  if (poSelectedKeys.has(key)) {
    poSelectedKeys.delete(key);
    poReviewRows = poReviewRows.filter(r => !(r.productId === productId && Number(r.containerSize) === sizeVal));
  } else {
    poSelectedKeys.add(key);
  }

  // If supplier was previously locked, check if still valid
  if (poSupplierId) {
    const { commonSuppliers } = findCommonSuppliersForSelectedItems(poSelectedKeys);
    if (!commonSuppliers.some(s => s.id === poSupplierId)) {
      poSupplierId = '';
    }
  }

  renderPage();
}

function poToggleSelectAllVisible(checked) {
  const allProds = activeProducts();
  const search = (poCatalogSearch || '').trim().toLowerCase();
  const cat = poCatalogCategory || 'all';
  const stockFilter = poCatalogStockFilter || 'all';

  allProds.forEach(p => {
    const catMatch = (cat === 'all') || (p.category === cat) || (p.type === cat);
    if (!catMatch) return;

    const sizes = poSizesFor(p);
    sizes.forEach(s => {
      const sizeVal = Number(s) || 1;
      const count = productCanCount(p, sizeVal);
      const thresh = productSizeThreshold(p, sizeVal);
      const isLowOrOut = count <= thresh;

      if (stockFilter === 'low_out' && !isLowOrOut) return;
      if (stockFilter === 'in_stock' && isLowOrOut) return;

      if (search) {
        const textToMatch = `${p.name} ${p.brand || ''} ${p.category || ''} ${p.type || ''} ${p.color || ''} ${p.id || ''} ${fmtSize(sizeVal)}`.toLowerCase();
        if (!textToMatch.includes(search)) return;
      }

      const key = `${p.id}__${sizeVal}`;
      if (checked) {
        poSelectedKeys.add(key);
      } else {
        poSelectedKeys.delete(key);
        poReviewRows = poReviewRows.filter(r => !(r.productId === p.id && Number(r.containerSize) === sizeVal));
      }
    });
  });

  if (poSupplierId) {
    const { commonSuppliers } = findCommonSuppliersForSelectedItems(poSelectedKeys);
    if (!commonSuppliers.some(s => s.id === poSupplierId)) {
      poSupplierId = '';
    }
  }

  renderPage();
}

function poClearProductSelection() {
  poSelectedKeys.clear();
  poReviewRows = [];
  poSupplierId = '';
  renderPage();
}

// ------------------------------------------------------------
// STEP 2: SELECT ONE COMMON SUPPLIER
// ------------------------------------------------------------

function findCommonSuppliersForSelectedItems(selectedKeys) {
  if (!selectedKeys || selectedKeys.size === 0) {
    return { commonSuppliers: [], itemSupplierMap: new Map() };
  }

  const itemSupplierMap = new Map();
  const allActiveSuppliers = (db.suppliers || []).filter(s => s.status === 'active');

  selectedKeys.forEach(key => {
    const [productId, sizeStr] = key.split('__');
    const size = Number(sizeStr) || 1;
    const rels = getSuppliersForProductAndSize(productId, size).filter(r => r.availability !== 'unavailable');
    itemSupplierMap.set(key, rels);
  });

  // A supplier is eligible if and only if they supply EVERY item in selectedKeys
  const commonSuppliers = allActiveSuppliers.filter(supplier => {
    for (const [key, rels] of itemSupplierMap.entries()) {
      const suppliesThisItem = rels.some(r => r.supplierId === supplier.id);
      if (!suppliesThisItem) return false;
    }
    return true;
  });

  return { commonSuppliers, itemSupplierMap };
}

function renderPOWizardStep2Html() {
  const { commonSuppliers, itemSupplierMap } = findCommonSuppliersForSelectedItems(poSelectedKeys);
  const selectedCount = poSelectedKeys.size;

  // Build items preview list
  const selectedItemsList = Array.from(poSelectedKeys).map(k => {
    const [pid, sz] = k.split('__');
    const p = productById(pid);
    return {
      key: k,
      productId: pid,
      size: Number(sz),
      productName: p ? p.name : pid,
      brand: p ? p.brand : '',
      category: p ? (p.category || p.type) : '',
      color: p ? p.color : '',
      suppliers: itemSupplierMap.get(k) || []
    };
  });

  const uniqueProductsCount = new Set(selectedItemsList.map(it => it.productId)).size;

  return `
    <div class="po-supplier-selection-view">
      <!-- Top Selected Items Summary Bar -->
      <div style="background:var(--surface-2); border:1px solid var(--line); border-radius:var(--radius); padding:12px 16px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="flex:1;">
          <div style="font-size:13px; font-weight:700; color:var(--ink); margin-bottom:6px;">
            Selected Products &amp; Sizes (${selectedCount} item${selectedCount === 1 ? '' : 's'} across ${uniqueProductsCount} product${uniqueProductsCount === 1 ? '' : 's'}):
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${selectedItemsList.map(it => `
              <span class="badge small" style="background:var(--surface); border:1px solid var(--line); color:var(--ink); padding:4px 8px; font-size:11.5px;">
                ${escapeHtml(it.productName)} (<b>${fmtSize(it.size)}</b>)
              </span>
            `).join('')}
          </div>
        </div>
        <div>
          <button type="button" class="btn secondary small" onclick="poWizardGoToStep(1)">← Modify Products (Step 1)</button>
        </div>
      </div>

      <!-- Section A: Common Suppliers Exist -->
      ${commonSuppliers.length > 0 ? `
        <div style="margin-bottom:18px;">
          <div style="margin-bottom:14px;">
            <h4 style="margin:0; font-size:15px; color:var(--ink); font-weight:700;">🏢 Step 2: Choose One Supplier for this Purchase Order</h4>
            <div class="muted small" style="margin-top:2px;">
              The following <b>${commonSuppliers.length} supplier${commonSuppliers.length === 1 ? '' : 's'}</b> can supply <b>all ${selectedCount}</b> selected items. Each Purchase Order must be fulfilled by exactly one supplier. Compare costs and choose one:
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:16px;">
            ${commonSuppliers.map(s => {
    const isSelected = poSupplierId === s.id;

    // Calculate procurement breakdown for this supplier
    let totalMinCost = 0;
    const itemBreakdown = selectedItemsList.map(it => {
      const matched = it.suppliers.find(rel => rel.supplierId === s.id);
      const cost = matched ? matched.purchaseCost : 0;
      const moq = matched ? matched.minOrderQty : 10;
      const minLineTotal = cost * moq;
      totalMinCost += minLineTotal;
      return {
        ...it,
        cost,
        moq,
        availability: matched ? matched.availability : 'available'
      };
    });

    return `
                <div class="po-supplier-card ${isSelected ? 'selected' : ''}" style="border:2px solid ${isSelected ? 'var(--teal)' : 'var(--line)'}; border-radius:var(--radius); background:var(--surface); padding:18px 20px; transition:border-color 0.15s, box-shadow 0.15s; box-shadow:${isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)'};">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap; margin-bottom:14px; border-bottom:1px solid var(--line-light); padding-bottom:12px;">
                    <div>
                      <div style="display:flex; align-items:center; gap:10px;">
                        <h4 style="margin:0; font-size:16px; color:var(--ink); font-weight:700;">${escapeHtml(s.name)}</h4>
                        <span class="badge ghost small" style="background:var(--surface-2);">ID: ${escapeHtml(s.id)}</span>
                        ${isSelected ? `<span class="badge ok small">✓ Selected Supplier</span>` : ''}
                      </div>
                      <div class="muted small" style="margin-top:4px; display:flex; gap:16px; flex-wrap:wrap;">
                        <span>👤 Contact: <b>${escapeHtml(s.contact || '—')}</b></span>
                        <span>📞 Phone: <b>${escapeHtml(s.phone || '—')}</b></span>
                        <span>✉️ Email: <b>${escapeHtml(s.email || '—')}</b></span>
                        ${s.address ? `<span>📍 ${escapeHtml(s.address)}</span>` : ''}
                      </div>
                    </div>
                    <div>
                      <button type="button" class="btn ${isSelected ? 'ok' : ''}" onclick="poSelectSupplier('${s.id}')" style="font-weight:700; padding:8px 18px; box-shadow:var(--shadow-sm);">
                        ${isSelected ? '✓ Supplier Selected → Continue' : `Select ${escapeHtml(s.name)} →`}
                      </button>
                    </div>
                  </div>

                  <!-- Supplier Procurement Details Table -->
                  <div style="border:1px solid var(--line); border-radius:var(--radius-sm); overflow:hidden;">
                    <table class="table" style="margin:0; width:100%; border-collapse:collapse; font-size:12.5px;">
                      <thead>
                        <tr style="background:var(--surface-2); border-bottom:1px solid var(--line);">
                          <th style="padding:8px 12px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; font-size:11px;">Selected Product</th>
                          <th style="padding:8px 12px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; font-size:11px;">Size</th>
                          <th style="padding:8px 12px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; font-size:11px; text-align:right;">Supplier Purchase Cost</th>
                          <th style="padding:8px 12px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; font-size:11px; text-align:center;">Supplier MOQ</th>
                          <th style="padding:8px 12px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; font-size:11px; text-align:center;">Availability</th>
                          <th style="padding:8px 12px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; font-size:11px; text-align:right;">MOQ Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${itemBreakdown.map(it => `
                          <tr style="border-bottom:1px solid var(--line-light);">
                            <td style="padding:8px 12px; font-weight:600; color:var(--ink);">${escapeHtml(it.productName)}</td>
                            <td style="padding:8px 12px;"><span class="badge ghost small">${fmtSize(it.size)}</span></td>
                            <td style="padding:8px 12px; text-align:right; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--ink);">
                              ${peso(it.cost)}
                            </td>
                            <td style="padding:8px 12px; text-align:center;">
                              <span class="badge ghost small" style="background:var(--surface-2); font-weight:700;">${it.moq} units</span>
                            </td>
                            <td style="padding:8px 12px; text-align:center;">
                              <span class="badge ok small">🟢 Available</span>
                            </td>
                            <td style="padding:8px 12px; text-align:right; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--ink-soft);">
                              ${peso(it.cost * it.moq)}
                            </td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>

                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:12px; color:var(--ink-soft); flex-wrap:wrap; gap:8px;">
                    <span>Fulfills all ${selectedCount} selected items with supplier-specific purchase costs and MOQs.</span>
                    <span style="font-weight:600;">Est. Minimum Order Value: <b style="color:var(--teal-dark); font-family:'Space Grotesk',sans-serif; font-size:14px;">${peso(totalMinCost)}</b></span>
                  </div>
                </div>
              `;
  }).join('')}
          </div>
        </div>
      ` : `
        <!-- Section B: Conflict - No Single Common Supplier Available -->
        <div class="po-conflict-card" style="border:2px solid #F59E0B; border-radius:var(--radius); background:var(--surface-2); padding:22px; margin-bottom:20px;">
          <div style="display:flex; align-items:flex-start; gap:14px; margin-bottom:16px;">
            <span style="font-size:28px; line-height:1;">⚠️</span>
            <div>
              <h3 style="margin:0 0 4px 0; color:var(--warning-text); font-size:17px; font-weight:700;">
                No Single Supplier Can Supply All Selected Items
              </h3>
              <div style="font-size:13.5px; color:var(--warning-text); line-height:1.45;">
                MRGR Color Center purchase orders strictly require <b>all items in an order to come from a single supplier</b>. None of your accredited suppliers are linked to every product and container size you selected.
              </div>
            </div>
          </div>

          <!-- Conflict Breakdown Table -->
          <div style="border:1px solid var(--warning-border); border-radius:var(--radius-sm); overflow:hidden; background:var(--surface); margin-bottom:18px;">
            <table class="table" style="margin:0; width:100%; border-collapse:collapse; font-size:12.5px;">
              <thead>
                <tr style="background:var(--warning-bg); border-bottom:1px solid var(--warning-border);">
                  <th style="padding:10px 12px; font-weight:700; color:var(--warning-text); text-align:left;">Selected Item &amp; Size</th>
                  <th style="padding:10px 12px; font-weight:700; color:var(--warning-text); text-align:left;">Accredited Supplier(s) Who Can Fulfill This Item</th>
                  <th style="padding:10px 12px; font-weight:700; color:var(--warning-text); text-align:center;">Fulfillment Status</th>
                </tr>
              </thead>
              <tbody>
                ${selectedItemsList.map(it => {
    const suppNames = it.suppliers.map(s => s.supplier ? s.supplier.name : s.supplierId);
    const hasSuppliers = suppNames.length > 0;

    return `
                    <tr style="border-bottom:1px solid var(--line-light);">
                      <td style="padding:10px 12px;">
                        <div style="font-weight:700; color:var(--ink);">${escapeHtml(it.productName)}</div>
                        <div class="muted small">${escapeHtml(it.brand || '')} · Container Size: <b>${fmtSize(it.size)}</b></div>
                      </td>
                      <td style="padding:10px 12px;">
                        ${hasSuppliers ? `
                          <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            ${it.suppliers.map(s => `
                              <span class="badge small" style="background:var(--success-bg); border:1px solid var(--success-border); color:var(--success-text); font-weight:600;">
                                ${escapeHtml(s.supplier ? s.supplier.name : s.supplierId)} (${peso(s.purchaseCost)})
                              </span>
                            `).join('')}
                          </div>
                        ` : `
                          <span class="badge small" style="background:var(--danger-bg); border:1px solid var(--danger-border); color:var(--danger-text);">
                            ⚠️ No supplier linked to this product &amp; size
                          </span>
                        `}
                      </td>
                      <td style="padding:10px 12px; text-align:center;">
                        ${hasSuppliers ? `
                          <span class="badge ok small">Fulfillable</span>
                        ` : `
                          <span class="badge danger small">Missing Supplier</span>
                        `}
                      </td>
                    </tr>
                  `;
  }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Suggested Solutions / Split Options -->
          <div style="background:var(--surface); border:1px solid var(--warning-border); border-radius:var(--radius-sm); padding:14px 16px;">
            <div style="font-weight:700; color:var(--warning-text); font-size:13.5px; margin-bottom:8px;">
              💡 Recommended Solutions:
            </div>
            <div style="font-size:13px; color:var(--ink); line-height:1.5; margin-bottom:12px;">
              You can return to Step 1 to adjust your selected products, or choose one supplier below to immediately generate a Purchase Order for that supplier's available subset:
            </div>
            
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <button type="button" class="btn" onclick="poWizardGoToStep(1)">
                ← Return to Step 1 &amp; Modify Selection
              </button>

              ${(() => {
      const candidateMap = new Map();
      selectedItemsList.forEach(it => {
        it.suppliers.forEach(rel => {
          if (!candidateMap.has(rel.supplierId)) {
            candidateMap.set(rel.supplierId, {
              supplier: rel.supplier || supplierById(rel.supplierId),
              items: []
            });
          }
          candidateMap.get(rel.supplierId).items.push(it);
        });
      });

      return Array.from(candidateMap.values()).map(cand => {
        const s = cand.supplier;
        if (!s) return '';
        return `
                    <button type="button" class="btn secondary" onclick="poFilterSelectionBySupplier('${s.id}')" style="box-shadow:var(--shadow-sm);" title="Keep only ${cand.items.length} items from ${s.name}">
                      Create PO with ${escapeHtml(s.name)} (${cand.items.length} of ${selectedCount} items) →
                    </button>
                  `;
      }).join('');
    })()}
            </div>
          </div>
        </div>
      `}
    </div>
  `;
}

function poSelectSupplier(supplierId) {
  poSupplierId = supplierId;
  poSyncReviewRows();
  poWizardStep = 3;
  renderPage();
}

function poFilterSelectionBySupplier(supplierId) {
  const supplier = supplierById(supplierId);
  if (!supplier) return;

  const newSelectedKeys = new Set();
  poSelectedKeys.forEach(key => {
    const [pid, sz] = key.split('__');
    const sizeVal = Number(sz) || 1;
    const rels = getSuppliersForProductAndSize(pid, sizeVal);
    if (rels.some(r => r.supplierId === supplierId && r.availability !== 'unavailable')) {
      newSelectedKeys.add(key);
    }
  });

  poSelectedKeys = newSelectedKeys;
  poSupplierId = supplierId;
  poSyncReviewRows();
  poWizardStep = 3;
  renderPage();
  showToast(`Selection filtered to ${poSelectedKeys.size} item(s) fulfillable by ${supplier.name}.`, 'ok');
}

// ------------------------------------------------------------
// STEP 3: REVIEW PURCHASE ORDER (GROUPED SIZES PER PRODUCT)
// ------------------------------------------------------------

function poSyncReviewRows() {
  if (!poSupplierId) return;

  const existingMap = new Map();
  poReviewRows.forEach(r => {
    existingMap.set(`${r.productId}__${r.containerSize}`, r);
  });

  const updatedRows = [];
  poSelectedKeys.forEach(key => {
    const [productId, sizeStr] = key.split('__');
    const size = Number(sizeStr) || 1;
    const p = productById(productId);
    if (!p) return;

    const supplierRel = getSuppliersForProductAndSize(productId, size).find(s => s.supplierId === poSupplierId);
    const unitCost = (supplierRel && supplierRel.purchaseCost > 0) ? supplierRel.purchaseCost : poPurchaseCostPerUnit(p, size);
    const minOrderQty = (supplierRel && supplierRel.minOrderQty > 0) ? supplierRel.minOrderQty : 1;

    const existing = existingMap.get(key);
    let qty = existing ? Number(existing.qty) : null;
    if (qty == null || isNaN(qty) || qty <= 0) {
      qty = Math.max(minOrderQty, poSuggestedQty(p, size) || minOrderQty || 1);
    }

    const availableStock = productCanCount(p, size);
    const lineTotal = Number((qty * unitCost).toFixed(2));

    updatedRows.push({
      productId: p.id,
      containerSize: size,
      productName: p.name,
      brand: p.brand || '',
      category: p.category || p.type || '',
      color: p.color || '',
      colorHex: p.colorHex || '',
      availableStock,
      unitCost,
      minOrderQty,
      qty,
      lineTotal
    });
  });

  poReviewRows = updatedRows;
}

function renderPOWizardStep3Html() {
  const supplier = supplierById(poSupplierId);
  if (!supplier) {
    return `
      <div class="alert-banner warning" style="margin-bottom:16px;">
        ⚠️ No supplier selected. Please return to Step 2 to select a supplier.
      </div>
      <button type="button" class="btn" onclick="poWizardGoToStep(2)">← Go to Supplier Selection</button>
    `;
  }

  // Ensure review rows are up to date
  if (!poReviewRows.length && poSelectedKeys.size > 0) {
    poSyncReviewRows();
  }

  let grandTotal = 0;
  let totalContainers = 0;
  let hasMoqViolation = false;

  poReviewRows.forEach(r => {
    const q = Number(r.qty) || 0;
    const c = Number(r.unitCost) || 0;
    const lt = Number((q * c).toFixed(2));
    r.lineTotal = lt;
    grandTotal += lt;
    totalContainers += q;
    if (q < r.minOrderQty) hasMoqViolation = true;
  });

  // Group review rows by product
  const productGroups = new Map();
  poReviewRows.forEach((row, idx) => {
    if (!productGroups.has(row.productId)) {
      const p = productById(row.productId);
      productGroups.set(row.productId, {
        productId: row.productId,
        productName: row.productName,
        brand: row.brand,
        category: row.category,
        color: row.color,
        colorHex: row.colorHex,
        items: []
      });
    }
    productGroups.get(row.productId).items.push({ row, idx });
  });

  const isAdmin = currentUser && currentUser.role === 'admin';

  return `
    <div class="po-review-view">
      <!-- Active Supplier Information Banner -->
      <div class="alert-banner ok" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:18px; border-left:4px solid var(--teal,#0D9488); background:var(--success-bg);">
        <div style="display:flex; align-items:flex-start; gap:12px;">
          <span style="font-size:24px;">🏢</span>
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-weight:700; font-size:15px; color:var(--teal-dark);">Selected Supplier: ${escapeHtml(supplier.name)}</span>
              <span class="badge ok small">✓ Valid Common Supplier</span>
              <span class="badge ghost small" style="background:var(--surface);">1 Supplier per Order</span>
            </div>
            <div style="font-size:12px; margin-top:3px; color:var(--teal-dark); line-height:1.4;">
              All items below are priced with ${escapeHtml(supplier.name)}'s actual procurement costs. Contact: ${escapeHtml(supplier.contact || '—')} · Phone: ${escapeHtml(supplier.phone || '—')}
            </div>
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn secondary small" onclick="poWizardGoToStep(2)" title="Select a different common supplier">← Change Supplier</button>
          <button type="button" class="btn secondary small" onclick="poWizardGoToStep(1)" title="Add or remove products">← Add / Modify Products</button>
        </div>
      </div>

      <!-- Notes and Purpose Input -->
      <div style="margin-bottom:18px; background:var(--surface-2); border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px;">
        <label style="font-size:12.5px; font-weight:700; color:var(--ink); display:block; margin-bottom:4px;">
          Order Notes / Procurement Purpose (optional)
        </label>
        <input type="text" id="po-notes" placeholder="e.g. Urgent store replenishment, bulk seasonal order, warehouse stock" value="${escapeHtml(poNotes)}" oninput="poNotes = this.value" style="width:100%; padding:8px 12px; border:1px solid var(--line); border-radius:var(--radius-sm); font-size:13px; background:var(--surface);">
      </div>

      <!-- Structured Order Review Table (Grouped by Product) -->
      <div style="margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
          <h4 style="margin:0; font-size:15px; color:var(--ink); font-weight:700;">
            Order Line Items (${poReviewRows.length} size${poReviewRows.length === 1 ? '' : 's'} across ${productGroups.size} product${productGroups.size === 1 ? '' : 's'})
          </h4>
          <span class="badge ghost small" style="background:var(--surface-2); border:1px solid var(--line);">
            📦 Supplier MOQ &amp; Actual Unit Costs Applied
          </span>
        </div>

        ${poReviewRows.length === 0 ? `
          <div style="text-align:center; padding:30px; background:var(--surface-2); border:1px dashed var(--line); border-radius:var(--radius);">
            <div style="color:var(--ink-soft); font-size:14px;">No items in order.</div>
            <button type="button" class="btn small" onclick="poWizardGoToStep(1)" style="margin-top:10px;">+ Add Products</button>
          </div>
        ` : `
          <div style="border:1px solid var(--line); border-radius:var(--radius); overflow:hidden; background:var(--surface);">
            <table class="table" style="margin:0; width:100%; border-collapse:collapse; font-size:13px;">
              <thead>
                <tr style="background:var(--surface-2); border-bottom:1px solid var(--line);">
                  <th style="padding:10px 14px; font-size:11px; font-weight:700; color:var(--ink-soft); text-transform:uppercase;">Product / Container Size</th>
                  <th style="padding:10px 12px; font-size:11px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; text-align:center;">Store Stock</th>
                  <th style="padding:10px 12px; font-size:11px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; text-align:right;">Purchase Cost</th>
                  <th style="padding:10px 12px; font-size:11px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; text-align:center;">Supplier MOQ</th>
                  <th style="padding:10px 12px; font-size:11px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; text-align:center; min-width:140px;">Order Qty</th>
                  <th style="padding:10px 12px; font-size:11px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; text-align:right;">Line Total</th>
                  <th style="width:40px; padding:10px 10px; text-align:center;"></th>
                </tr>
              </thead>
              <tbody>
                ${Array.from(productGroups.values()).map(grp => {
    return `
                    <!-- Product Header Row -->
                    <tr class="po-review-group-header" style="background:var(--surface-2); border-top:2px solid var(--line); border-bottom:1px solid var(--line-light);">
                      <td colspan="7" style="padding:10px 14px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                          <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:15px;">📦</span>
                            <span style="font-weight:700; color:var(--ink); font-size:14px;">${escapeHtml(grp.productName)}</span>
                            <span class="muted small" style="font-size:11.5px;">(${escapeHtml(grp.brand || '—')} · ${escapeHtml(grp.category || 'General')})</span>
                            ${poRenderColorPill(grp.color, grp.colorHex)}
                          </div>
                          <span class="badge ghost small" style="background:var(--surface); border:1px solid var(--line-light); font-size:11px;">
                            ${grp.items.length} size${grp.items.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </td>
                    </tr>

                    <!-- Child Container Size Rows -->
                    ${grp.items.map(({ row, idx }) => {
      const isMoqViolated = (Number(row.qty) || 0) < row.minOrderQty;

      return `
                        <tr class="po-review-size-row" style="border-bottom:1px solid var(--line-light); background:${isMoqViolated ? 'var(--danger-bg)' : 'transparent'};">
                          <td style="padding:10px 14px 10px 32px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                              <span style="color:var(--teal-text); font-size:14px; font-weight:700;">↳</span>
                              <span class="badge ghost small" style="font-weight:700; font-size:12px; background:var(--surface); border:1px solid var(--line);">
                                ${fmtSize(row.containerSize)}
                              </span>
                            </div>
                          </td>
                          <td style="padding:10px 12px; text-align:center;">
                            <span style="font-weight:600; font-family:'Space Grotesk',sans-serif; color:var(--ink); font-size:13px;">
                              ${row.availableStock}
                            </span>
                          </td>
                          <td style="padding:10px 12px; text-align:right; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--ink);">
                            ${peso(row.unitCost)}
                          </td>
                          <td style="padding:10px 12px; text-align:center;">
                            <span class="badge ghost small" style="background:var(--surface-2); font-weight:700; color:var(--ink);">
                              ${row.minOrderQty} units
                            </span>
                          </td>
                          <td style="padding:10px 12px; text-align:center;">
                            <!-- Quantity Stepper -->
                            <div class="po-qty-stepper" style="display:inline-flex; align-items:center; border:1px solid ${isMoqViolated ? 'var(--danger)' : 'var(--line)'}; border-radius:var(--radius-sm); background:var(--surface); overflow:hidden;">
                              <button type="button" class="po-qty-btn" onclick="poStepReviewQty(${idx}, -1)" style="border:none; background:var(--surface-2); width:28px; height:28px; cursor:pointer; font-weight:700; color:var(--ink);">−</button>
                              <input type="number" id="po-review-qty-${idx}" min="1" max="${typeof PO_MAX_QTY !== 'undefined' ? PO_MAX_QTY : 999}" class="po-qty-input" value="${row.qty}" onchange="poUpdateReviewQty(${idx}, this.value)" oninput="poUpdateReviewQty(${idx}, this.value)" style="border:none; width:55px; text-align:center; font-weight:700; font-size:13px; padding:4px; outline:none;">
                              <button type="button" class="po-qty-btn" onclick="poStepReviewQty(${idx}, 1)" style="border:none; background:var(--surface-2); width:28px; height:28px; cursor:pointer; font-weight:700; color:var(--ink);">+</button>
                            </div>
                            <div id="po-review-moq-warn-${idx}" style="color:var(--danger); font-size:11px; font-weight:700; margin-top:3px; display:${isMoqViolated ? 'block' : 'none'};">
                              ⚠️ Min order: ${row.minOrderQty}
                            </div>
                          </td>
                          <td id="po-review-linetotal-${idx}" style="padding:10px 12px; text-align:right; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--teal-dark); font-size:14px;">
                            ${peso(row.lineTotal)}
                          </td>
                          <td style="padding:10px 10px; text-align:center;">
                            <button type="button" class="btn-icon danger" onclick="poRemoveReviewItem(${idx})" title="Remove size from order" style="background:none; border:none; cursor:pointer; font-size:15px; opacity:0.75;">
                              🗑️
                            </button>
                          </td>
                        </tr>
                      `;
    }).join('')}
                  `;
  }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <!-- Prominent Grand Total & Order Summary Box -->
      <div class="po-summary-box" style="background:var(--surface-2); border:1px solid var(--line); border-radius:var(--radius); padding:16px 20px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; box-shadow:var(--shadow-sm);">
        <div style="display:flex; gap:24px; flex-wrap:wrap;">
          <div>
            <div class="muted small" style="text-transform:uppercase; font-size:11px; font-weight:700; letter-spacing:0.03em;">Total Products</div>
            <div style="font-size:18px; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--ink);">${productGroups.size}</div>
          </div>
          <div>
            <div class="muted small" style="text-transform:uppercase; font-size:11px; font-weight:700; letter-spacing:0.03em;">Total Sizes / Lines</div>
            <div style="font-size:18px; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--ink);">${poReviewRows.length}</div>
          </div>
          <div>
            <div class="muted small" style="text-transform:uppercase; font-size:11px; font-weight:700; letter-spacing:0.03em;">Total Units</div>
            <div id="po-review-total-units" style="font-size:18px; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--ink);">${totalContainers}</div>
          </div>
          <div>
            <div class="muted small" style="text-transform:uppercase; font-size:11px; font-weight:700; letter-spacing:0.03em;">Selected Supplier</div>
            <div style="font-size:14px; font-weight:700; color:var(--teal-dark); margin-top:2px;">${escapeHtml(supplier.name)}</div>
          </div>
        </div>

        <div style="text-align:right;">
          <div class="muted small" style="text-transform:uppercase; font-size:11px; font-weight:700; letter-spacing:0.04em;">Grand Total</div>
          <div style="font-size:28px; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--teal-dark); line-height:1.1;" id="po-review-grand-total">
            ${peso(grandTotal)}
          </div>
          <div id="po-review-moq-status" style="font-size:11.5px; margin-top:4px;">
            ${hasMoqViolation ? `
              <span style="color:var(--danger); font-weight:700;">⚠️ Some items are below supplier MOQ</span>
            ` : `
              <span style="color:var(--success); font-weight:600;">✓ All MOQ requirements satisfied</span>
            `}
          </div>
        </div>
      </div>

      <!-- Action Buttons Bar -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-top:10px;">
        <div style="font-size:12.5px; color:var(--ink-soft);">
          ${isAdmin
      ? '✅ As Administrator, this order will be automatically approved and marked as <b>Ordered</b>.'
      : '⏳ As Inventory Staff, this order will be submitted as <b>Pending Approval</b> for the Administrator to review.'}
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <button type="button" class="btn secondary" onclick="poWizardGoToStep(2)">← Back to Supplier</button>
          <button type="button" class="btn secondary" onclick="backToPOList()">Cancel</button>
          <button type="submit" class="btn" id="btn-submit-po" onclick="submitPO(event)" ${poReviewRows.length === 0 || hasMoqViolation ? 'disabled' : ''} style="box-shadow:var(--shadow-sm); font-weight:700; padding:9px 22px;">
            ${isAdmin ? 'Create &amp; Approve Order →' : 'Submit for Approval →'}
          </button>
        </div>
      </div>
    </div>
  `;
}

function poUpdateReviewQty(index, rawVal) {
  if (!poReviewRows[index]) return;
  if (String(rawVal).trim() === '') return; // Allow user to clear input while typing
  const maxQty = typeof PO_MAX_QTY !== 'undefined' ? PO_MAX_QTY : 999;
  let val = parseInt(rawVal, 10);
  if (isNaN(val) || val < 1) val = 1;
  if (val > maxQty) {
    val = maxQty;
    const inp = document.getElementById(`po-review-qty-${index}`);
    if (inp) inp.value = val;
    showToast(`Maximum order quantity per line is ${maxQty} units.`, 'info');
  }
  poReviewRows[index].qty = val;
  poReviewRows[index].lineTotal = Number((val * poReviewRows[index].unitCost).toFixed(2));

  // Update DOM in-place so typing never loses focus
  const lineEl = document.getElementById(`po-review-linetotal-${index}`);
  if (lineEl) lineEl.textContent = peso(poReviewRows[index].lineTotal);

  const isMoqViolated = val < (poReviewRows[index].minOrderQty || 1);
  const warnEl = document.getElementById(`po-review-moq-warn-${index}`);
  if (warnEl) warnEl.style.display = isMoqViolated ? 'block' : 'none';

  const grandTotal = poReviewRows.reduce((sum, r) => sum + (Number(r.lineTotal) || 0), 0);
  const totalContainers = poReviewRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
  const anyMoqViolation = poReviewRows.some(r => (Number(r.qty) || 0) < (Number(r.minOrderQty) || 1));

  const grandEl = document.getElementById('po-review-grand-total');
  if (grandEl) grandEl.textContent = peso(grandTotal);
  const unitsEl = document.getElementById('po-review-total-units');
  if (unitsEl) unitsEl.textContent = totalContainers;
  const moqStatusEl = document.getElementById('po-review-moq-status');
  if (moqStatusEl) {
    moqStatusEl.innerHTML = anyMoqViolation
      ? '<span style="color:var(--danger); font-weight:700;">⚠️ Some items are below supplier MOQ</span>'
      : '<span style="color:var(--success); font-weight:600;">✓ All MOQ requirements satisfied</span>';
  }
  const submitBtn = document.getElementById('btn-submit-po');
  if (submitBtn) submitBtn.disabled = poReviewRows.length === 0 || anyMoqViolation;
}

function poStepReviewQty(index, delta) {
  if (!poReviewRows[index]) return;
  const maxQty = typeof PO_MAX_QTY !== 'undefined' ? PO_MAX_QTY : 999;
  const current = Number(poReviewRows[index].qty) || 1;
  const updated = Math.min(maxQty, Math.max(1, current + delta));
  const inp = document.getElementById(`po-review-qty-${index}`);
  if (inp) inp.value = updated;
  poUpdateReviewQty(index, updated);
}

function poRemoveReviewItem(index) {
  if (!poReviewRows[index]) return;
  const item = poReviewRows[index];
  const key = `${item.productId}__${item.containerSize}`;
  poSelectedKeys.delete(key);
  poReviewRows.splice(index, 1);

  if (poReviewRows.length === 0) {
    poWizardGoToStep(1);
    showToast('All items removed. Please select products to continue.', 'ok');
  } else {
    renderPage();
  }
}

// ------------------------------------------------------------
// WIZARD NAVIGATION & STEP CONTROLLER
// ------------------------------------------------------------

function poWizardGoToStep(targetStep) {
  if (targetStep === 2) {
    if (poSelectedKeys.size === 0) {
      showToast('Please select at least one product and container size before continuing.', 'error');
      return;
    }
  } else if (targetStep === 3) {
    if (poSelectedKeys.size === 0) {
      showToast('Please select at least one product first.', 'error');
      poWizardStep = 1;
      renderPage();
      return;
    }
    if (!poSupplierId) {
      showToast('Please select a common supplier for this purchase order.', 'error');
      poWizardStep = 2;
      renderPage();
      return;
    }
    poSyncReviewRows();
  }

  poWizardStep = targetStep;
  renderPage();
}

// ------------------------------------------------------------
// STEP 4: SUBMIT PURCHASE ORDER (DATABASE INTEGRATION)
// ------------------------------------------------------------

async function submitPO(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (window._isSubmittingPO) return false;
  window._isSubmittingPO = true;
  const submitBtn = document.getElementById('btn-submit-po');
  if (submitBtn) submitBtn.disabled = true;

  try {
    if (!poSupplierId) {
      showToast('Please select a supplier for this purchase order.', 'error');
      return false;
    }
    const supplier = (db.suppliers || []).find(s => s.id === poSupplierId);
    if (!supplier || supplier.status !== 'active') {
      showToast('The selected supplier is invalid or no longer active.', 'error');
      return false;
    }

    if (!poReviewRows || poReviewRows.length === 0) {
      showToast('Please add at least one product to the purchase order.', 'error');
      return false;
    }

    // 1. Strict validation: Every product must be supplied by the chosen supplier
    for (const row of poReviewRows) {
      const p = productById(row.productId);
      const matched = getSuppliersForProductAndSize(row.productId, row.containerSize);
      const isFromActiveSupplier = matched.some(m => m.supplierId === poSupplierId);
      if (!isFromActiveSupplier) {
        showToast(`Cannot submit order: "${p ? p.name : row.productId}" is not supplied by ${supplier.name}. Each Purchase Order must only contain products from one supplier.`, 'error');
        return false;
      }
    }

    // 2. Validate MOQ, Container Size, and Purchase Cost on every row
    let hasInvalidRow = false;
    let errorMsg = '';
    const items = [];

    for (let i = 0; i < poReviewRows.length; i++) {
      const row = poReviewRows[i];
      const p = productById(row.productId);
      const size = Number(row.containerSize) || 1;
      const qty = Number(row.qty) || 0;

      const supplierInfo = getSuppliersForProductAndSize(row.productId, size).find(m => m.supplierId === poSupplierId);
      const moq = supplierInfo ? supplierInfo.minOrderQty : (row.minOrderQty || 1);
      const unitCost = (supplierInfo && supplierInfo.purchaseCost > 0) ? supplierInfo.purchaseCost : (row.unitCost || 0);

      const maxQty = typeof PO_MAX_QTY !== 'undefined' ? PO_MAX_QTY : 999;
      if (qty <= 0 || qty > maxQty) {
        hasInvalidRow = true;
        errorMsg = qty > maxQty
          ? `Order quantity for "${p ? p.name : row.productId}" (${fmtSize(size)}) cannot exceed ${maxQty} units.`
          : `Please enter an order quantity for "${p ? p.name : row.productId}" (${fmtSize(size)}).`;
        break;
      }
      if (qty < moq) {
        hasInvalidRow = true;
        errorMsg = `Minimum order quantity for "${p ? p.name : row.productId}" (${fmtSize(size)}) from ${supplier.name} is ${moq} units.`;
        break;
      }
      if (unitCost <= 0) {
        hasInvalidRow = true;
        errorMsg = `Purchase cost for "${p ? p.name : row.productId}" (${fmtSize(size)}) must be greater than ₱0.00.`;
        break;
      }

      const variant = productSizeVariantBySize(p, size);
      const lineTotal = Number((qty * unitCost).toFixed(2));

      items.push({
        productId: p.productId || p.id,
        product_id: p.productId || p.id,
        sizeId: variant ? variant.sizeId : null,
        size_id: variant ? variant.sizeId : null,
        productName: p.name,
        brand: p.brand || '',
        color: p.color || '',
        size: size,
        containerSize: size,
        qty: qty,
        unitCost: unitCost,
        purchaseCostPerUnit: unitCost,
        purchaseCostPerLiter: Number((unitCost / size).toFixed(2)),
        lineTotal: lineTotal,
        supplierId: supplier.id
      });
    }

    if (hasInvalidRow) {
      showToast(errorMsg, 'error');
      return false;
    }

    if (items.length === 0) {
      showToast('Please add at least one line item with valid quantity.', 'error');
      return false;
    }

    const totalAmount = Number(items.reduce((sum, it) => sum + it.lineTotal, 0).toFixed(2));
    const notesInput = document.getElementById('po-notes');
    const finalNotes = (notesInput ? notesInput.value : poNotes || '').trim();
    const isAdmin = currentUser && currentUser.role === 'admin';
    const status = isAdmin ? 'ordered' : 'pending';

    const po = {
      id: uid('po'),
      poNumber: generatePONumber(),
      supplierId: supplier.id,
      supplierName: supplier.name,
      orderDate: nowISO(),
      expectedDate: null,
      status: status,
      totalAmount: totalAmount,
      items: items,
      itemsJson: JSON.stringify(items),
      notes: finalNotes,
      createdBy: (currentUser && currentUser.name) || 'Staff',
      receivedAt: null
    };

    if (!db.purchaseOrders) db.purchaseOrders = [];
    db.purchaseOrders.push(po);

    if (typeof logAudit === 'function') {
      const itemSummary = items.map(it => `${it.productName} (${it.qty} × ${fmtSize(it.size)})`).join(', ');
      logAudit(
        isAdmin ? 'PO_CREATE' : 'PO_SUBMIT',
        'Purchase Order',
        `${isAdmin ? 'Created & approved' : 'Submitted'} Purchase Order ${po.poNumber} for ${supplier.name} (${items.length} item${items.length === 1 ? '' : 's'}, Total: ${peso(po.totalAmount)})`,
        {
          entityName: po.poNumber,
          fieldChanged: 'Purchase Order Status',
          oldValue: 'None',
          newValue: isAdmin ? `Approved / Ordered (${peso(po.totalAmount)})` : `Submitted / Pending Approval (${peso(po.totalAmount)})`,
          referenceNo: po.poNumber,
          reason: finalNotes || `Procurement from ${supplier.name}: ${itemSummary}`
        }
      );
    }

    await saveDB();

    showToast(
      isAdmin
        ? `Purchase Order ${po.poNumber} created & approved for ${supplier.name}.`
        : `Purchase Order ${po.poNumber} submitted for Admin review.`,
      'ok'
    );

    // Reset wizard state
    poWizardStep = 1;
    poSelectedKeys = new Set();
    poSupplierId = '';
    poReviewRows = [];
    poNotes = '';

    poViewMode = 'detail';
    poDetailId = po.id;
    renderPage();
    return false;
  } catch (err) {
    console.error('Error submitting purchase order:', err);
    showToast('Failed to submit purchase order.', 'error');
    return false;
  } finally {
    window._isSubmittingPO = false;
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ------------------------------------------------------------
// PRODUCT SUPPLIERS CONFIGURATION & COST HELPERS
// ------------------------------------------------------------

function openManageProductSuppliersModal(productId = null, defaultSize = null) {
  const prods = activeProducts();
  if (prods.length === 0) {
    showToast('No active products found.', 'error');
    return;
  }
  const targetPid = productId || prods[0].id;
  const p = productById(targetPid);
  if (!p) return;

  const sizes = poSizesFor(p);
  const targetSize = (defaultSize !== undefined && defaultSize !== null && defaultSize !== '') ? Number(defaultSize) : null;
  const existingRels = getProductSuppliers(targetPid, targetSize);
  const allSuppliers = (db.suppliers || []).filter(s => s.status === 'active');

  const bodyHtml = `
    <div style="font-size:13px; color:var(--ink-soft); margin-bottom:14px;">
      Manage multiple accredited suppliers, specific purchase costs, and minimum order quantities (MOQ) for each product and container size.
    </div>

    <!-- Product Selection dropdown -->
    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:12px; margin-bottom:16px;">
      <div>
        <label style="font-size:11px; font-weight:700; color:var(--ink-soft); display:block; margin-bottom:4px;">Select Product</label>
        <select id="mps-product-select" onchange="openManageProductSuppliersModal(this.value)" style="width:100%; font-size:13px; padding:7px 10px; border-radius:var(--radius-sm); border:1px solid var(--line); background:var(--surface);">
          ${prods.map(pr => `<option value="${pr.id}" ${pr.id === targetPid ? 'selected' : ''}>${escapeHtml(pr.name)} (${escapeHtml(pr.brand || '')})</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:11px; font-weight:700; color:var(--ink-soft); display:block; margin-bottom:4px;">Filter Size</label>
        <select id="mps-filter-size" onchange="openManageProductSuppliersModal('${targetPid}', this.value)" style="width:100%; font-size:13px; padding:7px 10px; border-radius:var(--radius-sm); border:1px solid var(--line); background:var(--surface);">
          <option value="">All Sizes</option>
          ${sizes.map(sz => `<option value="${sz}" ${sz === targetSize ? 'selected' : ''}>${fmtSize(sz)}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Existing Relationships Table -->
    <div style="margin-bottom:20px;">
      <h4 style="margin:0 0 8px 0; font-size:14px;">Current Supplier Relationships (${existingRels.length})</h4>
      ${existingRels.length === 0 ? `
        <div style="padding:16px; background:var(--surface-2); border:1px dashed var(--line); border-radius:var(--radius-sm); text-align:center; color:var(--ink-soft); font-size:12.5px;">
          No suppliers linked yet for this product. Use the form below to add suppliers.
        </div>
      ` : `
        <div style="border:1px solid var(--line); border-radius:var(--radius-sm); overflow:hidden;">
          <table class="table" style="margin:0; width:100%; border-collapse:collapse; font-size:12.5px;">
            <thead>
              <tr style="background:var(--surface-2); border-bottom:1px solid var(--line);">
                <th style="padding:8px 10px; text-align:left;">Supplier</th>
                <th style="padding:8px 10px; text-align:left;">Size</th>
                <th style="padding:8px 10px; text-align:right;">Purchase Cost</th>
                <th style="padding:8px 10px; text-align:center;">MOQ</th>
                <th style="padding:8px 10px; text-align:center;">Availability</th>
                <th style="padding:8px 10px; text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${existingRels.map(rel => `
                <tr style="border-bottom:1px solid var(--line-light);">
                  <td style="padding:8px 10px; font-weight:600;">${escapeHtml(rel.supplier ? rel.supplier.name : rel.supplierId)}</td>
                  <td style="padding:8px 10px;"><span class="badge ghost small">${rel.containerSize ? fmtSize(rel.containerSize) : 'All Sizes'}</span></td>
                  <td style="padding:8px 10px; text-align:right; font-weight:700; font-family:'Space Grotesk',sans-serif;">${peso(rel.purchaseCost)}</td>
                  <td style="padding:8px 10px; text-align:center;"><span class="badge ghost small">${rel.minOrderQty} units</span></td>
                  <td style="padding:8px 10px; text-align:center;">
                    <span class="badge ${rel.availability === 'available' ? 'ok' : (rel.availability === 'out_of_stock' ? 'danger' : 'warning')} small">
                      ${rel.availability === 'available' ? '🟢 Available' : (rel.availability === 'out_of_stock' ? '🔴 Out of Stock' : '🟠 Lead Time')}
                    </span>
                  </td>
                  <td style="padding:8px 10px; text-align:center;">
                    <button type="button" class="btn-icon danger" onclick="removeProductSupplierInModal('${rel.id || rel.relId}', '${p.id}', ${targetSize})" title="Remove link">🗑️</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <!-- Add New Supplier Relationship Form -->
    <div style="background:var(--surface-2); border:1px solid var(--line); border-radius:var(--radius-sm); padding:16px;">
      <h4 style="margin:0 0 12px 0; font-size:13.5px; color:var(--ink);">+ Link New Supplier / Update Cost</h4>
      <div style="display:grid; grid-template-columns: 2fr 1fr 1fr; gap:10px; margin-bottom:10px;">
        <div>
          <label style="font-size:11px; font-weight:700; color:var(--ink-soft); display:block; margin-bottom:3px;">Supplier *</label>
          <select id="mps-supplier" style="width:100%; font-size:12.5px; padding:6px 8px; border-radius:4px; border:1px solid var(--line); background:var(--surface);">
            ${allSuppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11px; font-weight:700; color:var(--ink-soft); display:block; margin-bottom:3px;">Container Size</label>
          <select id="mps-size" style="width:100%; font-size:12.5px; padding:6px 8px; border-radius:4px; border:1px solid var(--line); background:var(--surface);">
            ${sizes.map(sz => `<option value="${sz}" ${sz === targetSize ? 'selected' : ''}>${fmtSize(sz)}</option>`).join('')}
            <option value="0">All Container Sizes</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px; font-weight:700; color:var(--ink-soft); display:block; margin-bottom:3px;">Purchase Cost (₱) *</label>
          <input type="number" id="mps-cost" step="0.01" min="0" placeholder="0.00" value="${(p.price * 0.85).toFixed(2)}" style="width:100%; font-size:12.5px; padding:6px 8px; border-radius:4px; border:1px solid var(--line); background:var(--surface);">
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; align-items:flex-end;">
        <div>
          <label style="font-size:11px; font-weight:700; color:var(--ink-soft); display:block; margin-bottom:3px;">Min. Order Qty (MOQ)</label>
          <input type="number" id="mps-moq" min="1" step="1" value="10" style="width:100%; font-size:12.5px; padding:6px 8px; border-radius:4px; border:1px solid var(--line); background:var(--surface);">
        </div>
        <div>
          <label style="font-size:11px; font-weight:700; color:var(--ink-soft); display:block; margin-bottom:3px;">Availability</label>
          <select id="mps-avail" style="width:100%; font-size:12.5px; padding:6px 8px; border-radius:4px; border:1px solid var(--line); background:var(--surface);">
            <option value="available">🟢 In Stock / Available</option>
            <option value="out_of_stock">🔴 Out of Stock</option>
            <option value="lead_time">🟠 Limited / Lead Time</option>
          </select>
        </div>
        <div>
          <button type="button" class="btn small" style="width:100%; font-weight:700;" onclick="submitProductSupplierInModal('${p.id}', ${targetSize})">+ Link Supplier</button>
        </div>
      </div>
    </div>
  `;

  openModal('Manage Product Suppliers & Procurement Costs', bodyHtml, '<button type="button" class="btn secondary" onclick="closeModal()">Close</button>', 'wide');
}

window.openManageProductSuppliersModal = openManageProductSuppliersModal;

window.removeProductSupplierInModal = async function (relId, productId, targetSize) {
  deleteProductSupplierRelationship(relId);
  await saveDB();
  openManageProductSuppliersModal(productId, targetSize);
  renderPage();
  showToast('Supplier link removed.', 'ok');
};

window.submitProductSupplierInModal = async function (productId, targetSize) {
  const supplierId = document.getElementById('mps-supplier').value;
  const containerSize = Number(document.getElementById('mps-size').value) || 0;
  const purchaseCost = Number(document.getElementById('mps-cost').value) || 0;
  const rawMoq = Number(document.getElementById('mps-moq').value);
  const minOrderQty = Number.isInteger(rawMoq) && rawMoq >= 1 ? rawMoq : Math.max(1, Math.round(rawMoq) || 10);
  const availability = document.getElementById('mps-avail').value;

  if (!supplierId) {
    showToast('Please select a supplier.', 'error');
    return;
  }
  if (purchaseCost <= 0) {
    showToast('Please enter a valid purchase cost greater than 0.', 'error');
    return;
  }
  if (!Number.isFinite(rawMoq) || rawMoq < 1) {
    showToast('Minimum order quantity (MOQ) must be at least 1 unit.', 'error');
    return;
  }

  updateProductSupplierRelationship({
    productId,
    supplierId,
    containerSize,
    purchaseCost,
    minOrderQty,
    availability,
    notes: 'Configured by Admin'
  });

  await saveDB();
  openManageProductSuppliersModal(productId, targetSize);
  renderPage();
  showToast('Supplier relationship saved.', 'ok');
};

function poSellingPricePerLiter(product) {
  return product && product.price ? Number(product.price) : 0;
}

function poPurchaseCostPerLiter(product) {
  const sellingPricePerLiter = poSellingPricePerLiter(product);
  return Number((sellingPricePerLiter * PO_PURCHASE_COST_MULTIPLIER).toFixed(2));
}

function poPurchaseCostPerUnit(product, size) {
  const costPerLiter = poPurchaseCostPerLiter(product);
  const volume = Number(size) || 1;
  return Number((costPerLiter * volume).toFixed(2));
}

function poSupplierPurchaseCost(productId, size, supplierId = null) {
  if (productId) {
    const matched = getSuppliersForProductAndSize(productId, size);
    if (supplierId) {
      const match = matched.find(m => m.supplierId === supplierId);
      if (match && match.purchaseCost > 0) return match.purchaseCost;
    } else if (matched.length === 1 && matched[0].purchaseCost > 0) {
      return matched[0].purchaseCost;
    }
  }
  const p = productById(productId);
  return poPurchaseCostPerUnit(p, size);
}

function poUnitCost(product, size) {
  return poPurchaseCostPerUnit(product, size);
}

function getPOItemCostDetails(item) {
  const size = Number(item && (item.size || item.containerSize || item.container_size)) || 1;
  const qty = Number(item && (item.qty !== undefined ? item.qty : (item.quantity || item.orderedQty))) || 0;
  let purchaseCostPerUnit = Number(item && (item.purchaseCostPerUnit !== undefined ? item.purchaseCostPerUnit : (item.unitCost !== undefined ? item.unitCost : 0)));
  let purchaseCostPerLiter = Number(item && item.purchaseCostPerLiter);

  if (!Number.isFinite(purchaseCostPerUnit) || purchaseCostPerUnit <= 0) {
    const pid = item && (item.productId || item.product_id);
    const sid = item && (item.supplierId || item.supplier_id);
    purchaseCostPerUnit = poSupplierPurchaseCost(pid, size, sid);
  }
  if (!Number.isFinite(purchaseCostPerLiter) || purchaseCostPerLiter <= 0) {
    purchaseCostPerLiter = Number((purchaseCostPerUnit / size).toFixed(2));
  }

  const lineTotal = Number((purchaseCostPerUnit * qty).toFixed(2));
  return {
    size,
    qty,
    purchaseCostPerLiter: Number(purchaseCostPerLiter.toFixed(2)),
    purchaseCostPerUnit: Number(purchaseCostPerUnit.toFixed(2)),
    lineTotal
  };
}

const PO_MIN_QTY = 1;
const PO_MAX_QTY = 999;
const PO_PURCHASE_COST_MULTIPLIER = 0.85;

window.PO_MIN_QTY = PO_MIN_QTY;
window.PO_MAX_QTY = PO_MAX_QTY;
window.PO_PURCHASE_COST_MULTIPLIER = PO_PURCHASE_COST_MULTIPLIER;
window.getPOItemCostDetails = getPOItemCostDetails;
window.startCreatePO = startCreatePO;
window.poCreatePage = poCreatePage;
window.poWizardGoToStep = poWizardGoToStep;
window.poToggleProductSize = poToggleProductSize;
function poOnRowClick(productId, containerSize, event) {
  if (event && event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'BUTTON' || event.target.tagName === 'A')) {
    return;
  }
  poToggleProductSize(productId, containerSize);
}

window.poToggleAllProductSizes = poToggleAllProductSizes;
window.poOnRowClick = poOnRowClick;
window.poToggleSelectAllVisible = poToggleSelectAllVisible;
window.poClearProductSelection = poClearProductSelection;
window.onPOCatalogSearchChange = onPOCatalogSearchChange;
window.onPOCatalogCategoryChange = onPOCatalogCategoryChange;
window.onPOCatalogStockChange = onPOCatalogStockChange;
window.poResetCatalogFilters = poResetCatalogFilters;
window.poSelectSupplier = poSelectSupplier;
window.poFilterSelectionBySupplier = poFilterSelectionBySupplier;
window.poUpdateReviewQty = poUpdateReviewQty;
window.poStepReviewQty = poStepReviewQty;
window.poRemoveReviewItem = poRemoveReviewItem;
window.submitPO = submitPO;

function poSizesFor(product) {
  return productSizes(product);
}

function poSuggestedQty(p, size = 0) {
  if (!p) return 10;
  const count = productCanCount(p, size);
  const thresh = productSizeThreshold(p, size);
  return Math.min(PO_MAX_QTY, Math.max(PO_MIN_QTY, (thresh * 2) - count));
}

// Stubs for backwards compatibility
function newPORow(productId = '', containerSize = null, supplierId = '', qty = 0) {
  return { productId, containerSize, supplierId, qty, minOrderQty: 10, unitCost: 0, lineTotal: 0 };
}
function renderPOItemRows() {
  // handled by wizard
}

/* ============================================================
   DIRECT PO CREATION FROM LOW-STOCK PRODUCTS
   ============================================================ */

function isSizeIncludedInSelection(productId, size, sizeId, targetSize) {
  if (targetSize == null || targetSize === '') return true;
  const normSize = normalizeCanSize(size);
  if (typeof targetSize === 'number' || typeof targetSize === 'string') {
    if (normalizeCanSize(targetSize) === normSize) return true;
    if (sizeId && String(sizeId).toLowerCase() === String(targetSize).toLowerCase()) return true;
    return false;
  }
  if (targetSize instanceof Map) {
    const list = targetSize.get(productId);
    if (!list) return false;
    if (list instanceof Set) {
      return list.has(normSize) || (sizeId && list.has(sizeId));
    }
    if (Array.isArray(list)) {
      return list.some(s => normalizeCanSize(s) === normSize || (sizeId && s === sizeId));
    }
    return false;
  }
  if (targetSize instanceof Set) {
    if (sizeId && targetSize.has(sizeId)) return true;
    if (targetSize.has(`${productId}__${normSize}`)) return true;
    if (targetSize.has(`${productId}__${size}`)) return true;
    if (targetSize.has(normSize)) return true;
    return false;
  }
  if (Array.isArray(targetSize)) {
    return targetSize.some(s => normalizeCanSize(s) === normSize || (sizeId && s === sizeId));
  }
  if (typeof targetSize === 'object') {
    const list = targetSize[productId];
    if (!list) return false;
    if (Array.isArray(list)) {
      return list.some(s => normalizeCanSize(s) === normSize || (sizeId && s === sizeId));
    }
    if (list instanceof Set) {
      return list.has(normSize) || (sizeId && list.has(sizeId));
    }
    return false;
  }
  return true;
}

/**
 * Handles bulk or individual purchase order generation from low-stock alerts.
 * Size-specific restocking: only includes selected container sizes that actually require restocking.
 *
 * @param {string[]|string} [productIds] - Array of product IDs or single product ID.
 * @param {any} [targetSize] - Single size, array/set of sizes or map of sizes.
 */
async function createPOFromSelectedLowStock(productIds, targetSize = null) {
  if ((!productIds || (Array.isArray(productIds) && productIds.length === 0)) && typeof LowStockService !== 'undefined' && LowStockService.selectedKeys.size > 0) {
    LowStockService.createPOFromSelected();
    return;
  }
  let ids = productIds;
  if (typeof ids === 'string') ids = [ids];
  if (!ids || !ids.length) {
    if (typeof selectedAlertSizeKeys !== 'undefined' && selectedAlertSizeKeys.size > 0) {
      const prodSet = new Set();
      selectedAlertSizeKeys.forEach(k => {
        const v = productSizeById ? productSizeById(k) : null;
        if (v && v.productId) prodSet.add(v.productId);
        else if (k.includes('__')) prodSet.add(k.split('__')[0]);
      });
      ids = Array.from(prodSet);
      if (!targetSize) targetSize = selectedAlertSizeKeys;
    } else if (typeof selectedAlertProductIds !== 'undefined' && selectedAlertProductIds.size > 0) {
      ids = Array.from(selectedAlertProductIds);
    } else if (typeof selectedDashProductIds !== 'undefined' && selectedDashProductIds.size > 0) {
      ids = Array.from(selectedDashProductIds);
    }
  }

  if (!ids || !ids.length) {
    showToast('Please select at least one low-stock product or container size first.', 'error');
    return;
  }

  const selectedProducts = ids.map(id => productById(id)).filter(Boolean);
  if (!selectedProducts.length) {
    showToast('No valid products found for selected IDs.', 'error');
    return;
  }

  // Duplicate PO guard: check size-specifically whether any selected sizes already have active open POs
  if (!window._allowDuplicatePOCreation) {
    const alreadyOnOrderSizes = [];
    selectedProducts.forEach(p => {
      const sizes = productSizes(p);
      sizes.forEach(s => {
        const variant = productSizeVariantBySize(p, s);
        const isSelected = targetSize != null
          ? isSizeIncludedInSelection(p.id, s, variant ? variant.sizeId : null, targetSize)
          : (productSizeStatus(p, s) === 'low' || productSizeStatus(p, s) === 'out');
        if (isSelected) {
          const openOrders = openPOsForProductSize(p.id, s, variant ? variant.sizeId : null);
          if (openOrders.length > 0) {
            alreadyOnOrderSizes.push({
              product: p,
              size: s,
              sizeId: variant ? variant.sizeId : null,
              orders: openOrders
            });
          }
        }
      });
    });

    if (alreadyOnOrderSizes.length > 0) {
      const details = alreadyOnOrderSizes.map(item => {
        const orderLabels = item.orders.map(o => `<b>${o.poNumber}</b> (${poStatusBadge(o.status)})`).join(', ');
        return `• <b>${escapeHtml(item.product.name)}</b> (${fmtSize(item.size)}): already in ${orderLabels}`;
      }).join('<br>');

      showPOConfirm({
        icon: '⚠️',
        title: 'Potential Duplicate Purchase Order',
        message: `The following container size(s) already have active purchase orders pending delivery:<br><br>${details}<br><br>Creating another purchase order will duplicate the order with your supplier. Do you wish to create a duplicate order anyway?`,
        confirmLabel: 'Proceed & Create Anyway',
        confirmClass: 'btn danger',
        onConfirm: () => {
          window._allowDuplicatePOCreation = true;
          createPOFromSelectedLowStock(ids, targetSize).finally(() => { window._allowDuplicatePOCreation = false; });
        }
      });
      return;
    }
  }

  // 1. Resolve suppliers for selected products
  const supplierGroups = new Map();
  const unlinkedProducts = [];

  for (const p of selectedProducts) {
    const suppliers = suppliersForProduct(p.id).filter(s => s.status === 'active');
    const supplier = suppliers[0] || (db.suppliers || []).find(s => s.status === 'active' && (s.productIds || []).includes(p.id));
    if (!supplier) {
      unlinkedProducts.push(p);
    } else {
      if (!supplierGroups.has(supplier.id)) {
        supplierGroups.set(supplier.id, { supplier, products: [] });
      }
      supplierGroups.get(supplier.id).products.push(p);
    }
  }

  // Handle unlinked products if any
  if (unlinkedProducts.length > 0) {
    const activeSuppliers = (db.suppliers || []).filter(s => s.status === 'active');
    if (activeSuppliers.length === 1) {
      const fallback = activeSuppliers[0];
      if (!fallback.productIds) fallback.productIds = [];
      unlinkedProducts.forEach(p => {
        if (!fallback.productIds.includes(p.id)) fallback.productIds.push(p.id);
        if (!supplierGroups.has(fallback.id)) {
          supplierGroups.set(fallback.id, { supplier: fallback, products: [] });
        }
        supplierGroups.get(fallback.id).products.push(p);
      });
    } else if (activeSuppliers.length > 1) {
      openUnlinkedSupplierModal(unlinkedProducts, supplierGroups, ids, targetSize);
      return;
    } else {
      showToast('No active suppliers found in system. Please add an active supplier first.', 'error');
      return;
    }
  }

  if (supplierGroups.size === 0) {
    showToast('Could not match selected products to any active suppliers.', 'error');
    return;
  }

  // If multiple suppliers were selected, let staff pick which supplier order to check and submit:
  if (supplierGroups.size > 1) {
    openMultiSupplierPOPickerModal(supplierGroups, targetSize);
    return;
  }

  // Single supplier: open the PO Create page pre-filled so staff can check before submitting!
  const [supplierId, group] = Array.from(supplierGroups.entries())[0];
  loadPOWithProducts(group.supplier.id, group.products, targetSize);
}

function loadPOWithProducts(supplierId, products, targetSize = null) {
  poViewMode = 'create';
  poSupplierId = supplierId || '';
  poSelectedKeys = new Set();
  poReviewRows = [];

  (products || []).forEach(p => {
    const sizes = productSizes(p);
    sizes.forEach(s => {
      const variant = productSizeVariantBySize(p, s);
      const isSelected = targetSize != null
        ? isSizeIncludedInSelection(p.id, s, variant ? variant.sizeId : null, targetSize)
        : true;
      if (isSelected) {
        poSelectedKeys.add(`${p.id}__${s}`);
      }
    });
  });

  if (poSupplierId && poSelectedKeys.size > 0) {
    poSyncReviewRows();
    poWizardStep = 3;
  } else if (poSelectedKeys.size > 0) {
    poWizardStep = 2;
  } else {
    poWizardStep = 1;
  }

  window._poInitialNotes = `Restock order for ${(products || []).length} product(s)`;
  goTo('purchaseOrders');
  const s = supplierById(supplierId);
  showToast(`Loaded ${poSelectedKeys.size} item(s) for ${s ? s.name : 'purchase order'}. Review and submit.`);
}

function openMultiSupplierPOPickerModal(supplierGroups, targetSize = null) {
  const groups = Array.from(supplierGroups.values());
  window._multiSupplierTargetSize = targetSize;
  const bodyHtml = `
    <div style="font-size:13px; color:var(--ink-soft); margin-bottom:14px;">
      The products you selected belong to <b>${groups.length} different suppliers</b>.
      Please choose which supplier order you want to check and submit for approval:
    </div>
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${groups.map((g, idx) => {
    const prodNames = g.products.map(p => escapeHtml(p.name)).join(', ');
    return `
          <div style="background:var(--surface-2); border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
            <div>
              <div style="font-weight:700; color:var(--teal-dark); font-size:14px;">${escapeHtml(g.supplier.name)}</div>
              <div class="muted small" style="margin-top:2px;"><b>${g.products.length}</b> product(s): ${prodNames}</div>
            </div>
            <button class="btn small" onclick="closeModal(); loadPOWithProducts('${g.supplier.id}', window._multiSupplierGroups[${idx}].products, window._multiSupplierTargetSize);">
              Check &amp; Create Order &rarr;
            </button>
          </div>
        `;
  }).join('')}
    </div>
  `;

  window._multiSupplierGroups = groups;
  openModal('Select Supplier Order to Check', bodyHtml, '<button class="btn secondary" onclick="closeModal()">Cancel</button>', 'modal-md');
}

function openUnlinkedSupplierModal(unlinkedProducts, supplierGroups, allIds, targetSize = null) {
  const activeSuppliers = (db.suppliers || []).filter(s => s.status === 'active');
  const prodNames = unlinkedProducts.map(p => escapeHtml(p.name)).join(', ');

  const bodyHtml = `
    <div style="font-size:13px; color:var(--ink-soft); margin-bottom:14px;">
      The following product(s) do not have a supplier assigned yet:<br>
      <strong style="color:var(--ink);">${prodNames}</strong><br><br>
      Please select a supplier to create this purchase order with:
    </div>
    <div class="field">
      <label>Supplier <span style="color:var(--danger);">*</span></label>
      <select id="unlinked-supplier-sel" style="width:100%;">
        ${activeSuppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
      </select>
    </div>
  `;

  const footHtml = `
    <button class="btn secondary" onclick="closeModal()">Cancel</button>
    <button class="btn" onclick="confirmUnlinkedSupplierAndCreate()">Continue &amp; Create Order &rarr;</button>
  `;

  window._pendingUnlinkedProducts = unlinkedProducts;
  window._pendingAllIds = allIds;
  window._pendingTargetSize = targetSize;
  openModal('Assign Supplier for Order', bodyHtml, footHtml, 'modal-sm');
}

async function confirmUnlinkedSupplierAndCreate() {
  const sel = document.getElementById('unlinked-supplier-sel');
  if (!sel || !sel.value) return;
  const supplier = supplierById(sel.value);
  if (!supplier) return;

  const prods = window._pendingUnlinkedProducts || [];
  if (!supplier.productIds) supplier.productIds = [];
  prods.forEach(p => {
    if (!supplier.productIds.includes(p.id)) supplier.productIds.push(p.id);
  });
  await saveDB();
  closeModal();

  createPOFromSelectedLowStock(window._pendingAllIds, window._pendingTargetSize ?? null);
}

/* ============================================================
   PO LIST ROW ACTIONS DROPDOWN MENU
   ============================================================ */
let activePOActionsMenuId = null;

function closeAllPOActionsMenus() {
  const el = document.getElementById('po-actions-menu-dropdown');
  if (el) el.remove();
  activePOActionsMenuId = null;
  document.querySelectorAll('.po-actions-menu-btn.active').forEach(b => b.classList.remove('active'));
}

function togglePORowActionsMenu(poId, btnEl, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (activePOActionsMenuId === poId) {
    closeAllPOActionsMenus();
    return;
  }
  closeAllPOActionsMenus();
  closePOProductPicker();

  const po = (db.purchaseOrders || []).find(o => o.id === poId);
  if (!po) return;

  activePOActionsMenuId = poId;
  btnEl.classList.add('active');

  const isAdmin = currentUser && currentUser.role === 'admin';
  const isStaff = currentUser && currentUser.role === 'staff';
  const canApprove = isAdmin && po.status === 'pending';
  const canReceive = isStaff && (po.status === 'ordered' || po.status === 'partial');
  const canCancel = (po.status === 'pending' && (isAdmin || isStaff)) || (po.status === 'ordered' && isAdmin);

  const menu = document.createElement('div');
  menu.id = 'po-actions-menu-dropdown';
  menu.className = 'po-actions-dropdown';
  menu.onclick = e => e.stopPropagation();

  menu.innerHTML = `
    <button type="button" class="po-action-item" onclick="closeAllPOActionsMenus(); viewPODetail('${po.id}')">
      <span class="po-act-icon">👁️</span>
      <span>View Details</span>
    </button>
    <button type="button" class="po-action-item" onclick="closeAllPOActionsMenus(); printPO('${po.id}')">
      <span class="po-act-icon">🖨️</span>
      <span>Print PO Voucher</span>
    </button>
    ${canApprove ? `
    <button type="button" class="po-action-item accent" onclick="closeAllPOActionsMenus(); confirmApprovePO('${po.id}')">
      <span class="po-act-icon">✓</span>
      <span>Approve Order</span>
    </button>` : ''}
    ${canReceive ? `
    <button type="button" class="po-action-item accent" onclick="closeAllPOActionsMenus(); goToReceivingForPO('${po.id}')">
      <span class="po-act-icon">📥</span>
      <span>Receive Delivery</span>
    </button>` : ''}
    <div class="po-action-divider"></div>
    <button type="button" class="po-action-item" onclick="closeAllPOActionsMenus(); duplicatePO('${po.id}')">
      <span class="po-act-icon">🔄</span>
      <span>Reorder / Duplicate</span>
    </button>
    ${canCancel ? `
    <div class="po-action-divider"></div>
    <button type="button" class="po-action-item danger" onclick="closeAllPOActionsMenus(); confirmCancelPO('${po.id}')">
      <span class="po-act-icon">✕</span>
      <span>Cancel Order</span>
    </button>` : ''}
  `;

  document.body.appendChild(menu);

  // Position anchored to button
  const rect = btnEl.getBoundingClientRect();
  const menuWidth = 195;
  let top = rect.bottom + 5;
  let left = rect.right - menuWidth;

  if (left < 10) left = 10;
  if (left + menuWidth > window.innerWidth - 10) left = window.innerWidth - menuWidth - 10;

  const menuHeight = menu.offsetHeight || 190;
  if (top + menuHeight > window.innerHeight - 10 && rect.top > menuHeight) {
    top = Math.max(10, rect.top - menuHeight - 5);
  }

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

function duplicatePO(id) {
  const po = (db.purchaseOrders || []).find(o => o.id === id);
  if (!po) return;
  const items = getPOItems(po);
  poViewMode = 'create';
  poWizardStep = 3;
  poSupplierId = po.supplierId;
  poSelectedKeys = new Set();
  poReviewRows = [];

  items.forEach(it => {
    const p = productById(it.productId);
    const size = Number(it.size || it.containerSize) || 1;
    const key = `${it.productId}__${size}`;
    poSelectedKeys.add(key);

    const supplierInfo = getSuppliersForProductAndSize(it.productId, size).find(m => m.supplierId === po.supplierId);
    const unitCost = (supplierInfo && supplierInfo.purchaseCost > 0) ? supplierInfo.purchaseCost : Number(it.unitCost || it.purchaseCostPerUnit || 0);
    const minOrderQty = supplierInfo ? (Number(supplierInfo.minOrderQty) || 1) : 1;
    const qty = Math.max(minOrderQty, Number(it.qty) || 1);

    poReviewRows.push({
      productId: it.productId,
      containerSize: size,
      productName: it.productName || (p ? p.name : it.productId),
      brand: it.brand || (p ? p.brand : ''),
      category: p ? (p.category || p.type) : '',
      color: it.color || (p ? p.color : ''),
      availableStock: p ? productCanCount(p, size) : 0,
      unitCost: unitCost,
      minOrderQty: minOrderQty,
      qty: qty,
      lineTotal: Number((qty * unitCost).toFixed(2))
    });
  });

  window._poInitialNotes = `Reorder from ${po.poNumber}`;
  if (typeof syncRouteState === 'function') syncRouteState({ push: true });
  renderPage();
  showToast(`Draft created from ${po.poNumber}. Review quantities and submit.`);
}

/* ============================================================
   SMART PRODUCT SEARCH DROPDOWN (CREATE PO)
   ============================================================ */
let poPickerOpenIndex = null;
let poPickerSearchQuery = '';
let poPickerFilterMode = 'all';

function closePOProductPicker() {
  const el = document.getElementById('po-product-picker-dropdown');
  if (el) el.remove();
  poPickerOpenIndex = null;
  poPickerSearchQuery = '';
  poPickerFilterMode = 'all';
  document.querySelectorAll('.po-product-picker-btn.active').forEach(b => b.classList.remove('active'));
}

function togglePOProductPicker(index, btnEl, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (poPickerOpenIndex === index) {
    closePOProductPicker();
    return;
  }
  closeAllPOActionsMenus();
  closePOProductPicker();

  const supplier = poSupplierId ? db.suppliers.find(s => s.id === poSupplierId) : null;
  if (!supplier) {
    showToast('Select a supplier first.', 'error');
    return;
  }

  const allActive = activeProducts();
  if (!allActive.length) {
    showToast('No active products found in inventory.', 'error');
    return;
  }

  const suppliedProducts = allActive.filter(p => supplier.productIds && supplier.productIds.includes(p.id));

  poPickerOpenIndex = index;
  poPickerSearchQuery = '';
  poPickerFilterMode = suppliedProducts.length > 0 ? 'supplied' : 'all';
  btnEl.classList.add('active');

  const currentProductId = poItemRows[index] ? poItemRows[index].productId : '';

  const dropdown = document.createElement('div');
  dropdown.id = 'po-product-picker-dropdown';
  dropdown.className = 'po-product-picker-dropdown';
  dropdown.onclick = e => e.stopPropagation();

  dropdown.innerHTML = renderPOProductPickerContent(index, suppliedProducts, currentProductId);
  document.body.appendChild(dropdown);

  positionPOProductPicker(btnEl, dropdown);

  setTimeout(() => {
    const input = document.getElementById('po-picker-search-input');
    if (input) input.focus();
  }, 20);
}

function positionPOProductPicker(btnEl, dropdown) {
  const rect = btnEl.getBoundingClientRect();
  const width = Math.max(340, Math.min(460, rect.width));
  let top = rect.bottom + 4;
  let left = rect.left;

  if (left + width > window.innerWidth - 10) {
    left = window.innerWidth - width - 10;
  }
  if (left < 10) left = 10;

  const maxHeight = 340;
  if (top + maxHeight > window.innerHeight - 10 && rect.top > maxHeight) {
    top = Math.max(10, rect.top - maxHeight - 4);
  }

  dropdown.style.top = `${top}px`;
  dropdown.style.left = `${left}px`;
  dropdown.style.width = `${width}px`;
}

function renderPOProductPickerContent(index, suppliedProducts, currentProductId) {
  const q = (poPickerSearchQuery || '').trim().toLowerCase();
  const allProds = activeProducts();
  const hasSupplied = suppliedProducts && suppliedProducts.length > 0;

  let pool = allProds;
  if (poPickerFilterMode === 'supplied' && hasSupplied) {
    pool = suppliedProducts;
  } else if (poPickerFilterMode === 'low') {
    pool = (hasSupplied ? suppliedProducts : allProds).filter(p => productHasLowStock(p));
  }

  let filtered = pool;
  if (q) {
    filtered = pool.filter(p => {
      const hex = getProductHex(p);
      const hay = `${p.name || ''} ${p.color || ''} ${p.brand || ''} ${p.type || ''} ${p.sku || ''} ${hex}`.toLowerCase();
      return hay.includes(q);
    });
    if (filtered.length === 0 && poPickerFilterMode === 'supplied') {
      filtered = allProds.filter(p => {
        const hex = getProductHex(p);
        const hay = `${p.name || ''} ${p.color || ''} ${p.brand || ''} ${p.type || ''} ${p.sku || ''} ${hex}`.toLowerCase();
        return hay.includes(q);
      });
    }
  }

  const lowCount = (hasSupplied ? suppliedProducts : allProds).filter(p => productHasLowStock(p)).length;

  const selectedInOtherRows = new Map();
  poItemRows.forEach((r, rIdx) => {
    if (rIdx !== index && r.productId) {
      selectedInOtherRows.set(r.productId, rIdx + 1);
    }
  });

  const itemsHtml = filtered.length === 0
    ? `<div class="po-picker-empty-state">
         <span>🔍</span>
         <div style="font-weight:600;">No matching products found</div>
         <div style="font-size:11.5px;">Try another search keyword or clear filters.</div>
       </div>`
    : filtered.map(p => {
      const hex = getProductHex(p);
      const isSel = p.id === currentProductId;
      const otherRow = selectedInOtherRows.get(p.id);
      const isLow = productHasLowStock(p);
      const lowSummary = isLow ? productLowSizesSummary(p) : '';
      const costPerL = p.price ? `${peso(poPurchaseCostPerLiter(p))}/L` : '—';
      const isLinked = hasSupplied && suppliedProducts.some(sp => sp.id === p.id);

      return `
          <button type="button" class="po-picker-item ${isSel ? 'selected' : ''} ${otherRow ? 'in-other-row' : ''}" onclick="selectPOProduct(${index}, '${p.id}', event)">
            <span class="po-picker-item-avatar" style="background-color:${hex};"></span>
            <div class="po-picker-item-main">
              <div class="po-picker-item-name">
                <span>${escapeHtml(p.name)}</span>
                ${p.color && p.color !== '-' ? `<span class="po-picker-item-color">(${escapeHtml(p.color)})</span>` : ''}
                ${isLinked ? `<span class="badge" style="background:var(--teal-tint); color:var(--teal-dark); font-size:9.5px; padding:1px 5px;">Linked</span>` : ''}
              </div>
              <div class="po-picker-item-sub">
                ${escapeHtml(p.brand || '')}${p.type ? ' · ' + escapeHtml(p.type) : ''} · Purchase Cost: ${costPerL}
              </div>
            </div>
            <div class="po-picker-item-right">
              ${otherRow
          ? `<span class="badge" style="background:var(--surface-3); color:var(--ink-soft); font-size:10px;">Row #${otherRow}</span>`
          : (isLow
            ? `<span class="badge low" title="${escapeHtml(lowSummary)}">⚠️ ${escapeHtml(lowSummary) || 'Low'}</span>`
            : `<span class="badge ok">🥫 ${formatStock(p.stock)}L</span>`
          )
        }
              ${isSel ? `<span class="po-picker-check">✓</span>` : ''}
            </div>
          </button>
        `;
    }).join('');

  return `
    <div class="po-picker-header">
      <div class="po-picker-search-bar">
        <span class="po-picker-search-icon">🔍</span>
        <input type="text" id="po-picker-search-input" class="po-picker-search-input"
          placeholder="Search paint name, brand, color, SKU..."
          value="${escapeHtml(poPickerSearchQuery)}"
          oninput="onPOPickerSearchInput(${index}, this.value)"
          autocomplete="off">
        ${poPickerSearchQuery ? `<button type="button" class="po-picker-clear-search" onclick="clearPOPickerSearch(${index})">✕</button>` : ''}
      </div>
      <div class="po-picker-filter-chips">
        ${hasSupplied ? `
          <button type="button" class="po-picker-chip ${poPickerFilterMode === 'supplied' ? 'active' : ''}" onclick="setPOPickerFilterMode(${index}, 'supplied')">
            Linked (${suppliedProducts.length})
          </button>
          <button type="button" class="po-picker-chip ${poPickerFilterMode === 'all' ? 'active' : ''}" onclick="setPOPickerFilterMode(${index}, 'all')">
            All Products (${allProds.length})
          </button>
        ` : `
          <button type="button" class="po-picker-chip ${poPickerFilterMode === 'all' ? 'active' : ''}" onclick="setPOPickerFilterMode(${index}, 'all')">
            All Products (${allProds.length})
          </button>
        `}
        ${lowCount > 0 ? `
          <button type="button" class="po-picker-chip low ${poPickerFilterMode === 'low' ? 'active' : ''}" onclick="setPOPickerFilterMode(${index}, 'low')">
            ⚠️ Low Stock (${lowCount})
          </button>` : ''}
      </div>
    </div>
    <div class="po-picker-list" id="po-picker-list-${index}">
      ${itemsHtml}
    </div>
    <div class="po-picker-footer">
      <span>Showing <b>${filtered.length}</b> of ${pool.length} products</span>
      ${currentProductId ? `<button type="button" class="po-picker-clear-btn" onclick="clearPOProductRow(${index}, event)">✕ Clear Selection</button>` : ''}
    </div>
  `;
}

function onPOPickerSearchInput(index, val) {
  poPickerSearchQuery = val || '';
  const supplier = poSupplierId ? db.suppliers.find(s => s.id === poSupplierId) : null;
  if (!supplier) return;
  const suppliedProducts = activeProducts().filter(p => supplier.productIds && supplier.productIds.includes(p.id));
  const currentProductId = poItemRows[index] ? poItemRows[index].productId : '';
  const dropdown = document.getElementById('po-product-picker-dropdown');
  if (dropdown) {
    dropdown.innerHTML = renderPOProductPickerContent(index, suppliedProducts, currentProductId);
    const input = document.getElementById('po-picker-search-input');
    if (input) {
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  }
}

function clearPOPickerSearch(index) {
  onPOPickerSearchInput(index, '');
}

function setPOPickerFilterMode(index, mode) {
  poPickerFilterMode = mode;
  onPOPickerSearchInput(index, poPickerSearchQuery);
}

function selectPOProduct(index, productId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (!poItemRows[index]) return;
  const p = productById(productId);
  if (!p) return;

  // Duplicate check: check if this product is already selected in another row
  const dupIndex = poItemRows.findIndex((r, i) => i !== index && r.productId === productId);
  if (dupIndex !== -1) {
    showToast(`"${p.name}" is already in row #${dupIndex + 1}. Please adjust quantities there.`, 'error');
    closePOProductPicker();
    return;
  }

  const prevProductId = poItemRows[index].productId;
  poItemRows[index].productId = productId;
  poItemRows[index].qtys = {};
  poItemRows[index].rawInputs = {};
  poItemRows[index].touchedSizes = {};
  poItemRows[index].invalidSizes = {};
  poItemRows[index].expanded = false;

  const sizes = productSizes(p);
  const lowSizes = productLowSizes(p);

  if (lowSizes.length > 0) {
    lowSizes.forEach(s => {
      const count = productCanCount(p, s);
      const thresh = productSizeThreshold(p, s);
      poItemRows[index].qtys[s] = Math.min(PO_MAX_QTY, Math.max(PO_MIN_QTY, (thresh * 2) - count));
      poItemRows[index].touchedSizes[s] = true;
    });
  } else if (sizes.length > 0) {
    // Expand row and pre-fill primary container size with minimum order quantity (10 units)
    poItemRows[index].expanded = true;
    sizes.forEach(s => {
      poItemRows[index].qtys[s] = poSuggestedQty(p, s);
      poItemRows[index].touchedSizes[s] = true;
    });
  }

  // Auto-link to supplier if not already linked
  const supplier = poSupplierId ? db.suppliers.find(s => s.id === poSupplierId) : null;
  if (supplier) {
    if (!supplier.productIds) supplier.productIds = [];
    if (!supplier.productIds.includes(productId)) {
      supplier.productIds.push(productId);
    }
  }

  closePOProductPicker();
  renderPOItemRows();
}

function clearPOProductRow(index, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (!poItemRows[index]) return;
  poItemRows[index].productId = '';
  poItemRows[index].qtys = {};
  poItemRows[index].rawInputs = {};
  poItemRows[index].touchedSizes = {};
  poItemRows[index].invalidSizes = {};
  poItemRows[index].expanded = false;
  closePOProductPicker();
  renderPOItemRows();
}

/* Global dropdown event listeners */
if (!window._poDropdownListenersAttached) {
  window._poDropdownListenersAttached = true;
  document.addEventListener('click', e => {
    if (!e.target.closest('#po-actions-menu-dropdown') && !e.target.closest('.po-actions-menu-btn')) {
      closeAllPOActionsMenus();
    }
    if (!e.target.closest('#po-product-picker-dropdown') && !e.target.closest('.po-product-picker-btn') && !e.target.closest('.po-picker-reset-btn')) {
      closePOProductPicker();
    }
    if (!e.target.closest('#po-calendar-popover') && !e.target.closest('.po-monthday-picker-field')) {
      closePOCalendar();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeAllPOActionsMenus();
      closePOProductPicker();
      closePOCalendar();
    }
  });

  window.addEventListener('resize', () => {
    closeAllPOActionsMenus();
    closePOProductPicker();
    closePOCalendar();
  });

  window.addEventListener('scroll', e => {
    // Prevent dropdown from prematurely closing when user scrolls inside the picker list itself
    if (e.target && e.target.closest && (e.target.closest('#po-product-picker-dropdown') || e.target.closest('#po-actions-menu-dropdown') || e.target.closest('#po-calendar-popover'))) {
      return;
    }
    closeAllPOActionsMenus();
    closePOProductPicker();
    closePOCalendar();
  }, true);
}
