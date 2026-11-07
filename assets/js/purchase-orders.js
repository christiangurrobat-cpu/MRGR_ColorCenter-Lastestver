/* ============================================================
   18b. PURCHASE ORDERS — order stock from suppliers
   ============================================================ */
let poViewMode = 'list';  // 'list' | 'create' | 'detail'
let poDetailId = null;
let poItemRows = [];
let poSupplierId = '';
let poFilterStatus = '';
let poCreateStockFilter = 'low_out'; // 'low_out' | 'all' | 'low_only' | 'out_only' | 'good_only'

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

function poStatusBadge(status) {
  const map = {
    pending: ['po-pending', 'Pending Approval'],
    ordered: ['po-ordered', 'Approved / Ordered'],
    partial: ['po-partial', 'Partially Received'],
    received: ['po-received', 'Received'],
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

function setPODateFilter(from, to) {
  const minDate = getPOMinSelectableDate();
  const maxDate = getPOMaxSelectableDate();
  let f = from || '';
  let t = to || '';
  if (f && f > maxDate) f = maxDate;
  if (t && t > maxDate) t = maxDate;
  if (f && f < minDate) f = minDate;
  if (t && t < minDate) t = minDate;
  if (f && t && f > t) {
    const tmp = f;
    f = t;
    t = tmp;
  }
  poDateFrom = f;
  poDateTo = t;
  // Preserve selected year; do NOT set to custom
  resetPaginationPage('purchase_orders');
  renderPage();
}

function setPODateShortcut(daysAgo) {
  if (daysAgo === null || daysAgo === undefined) setPODatePreset('all');
  else if (daysAgo === 0) setPODatePreset('today');
  else if (daysAgo === 1) setPODatePreset('yesterday');
  else if (daysAgo === 6) setPODatePreset('7d');
  else if (daysAgo === 29) setPODatePreset('30d');
  else {
    const minDate = getPOMinSelectableDate();
    const d = daysAgoISO(daysAgo);
    poDateFrom = d < minDate ? minDate : d;
    poDateTo = todayISO();
    resetPaginationPage('purchase_orders');
    renderPage();
  }
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
        <button type="button" class="btn ghost small" onclick="setPODatePreset('year')" style="color:#7B4F09; border-color:#D19A42; background:#fff;">Return to Current Year (${curY}) &rarr;</button>
      </div>
    ` : ''}

    <div class="po-list-search">
      <span style="font-size:15px; color:var(--ink-soft);">🔍</span>
      <input id="po-search-input" type="text" placeholder="Search by PO number, supplier, or notes…" value="${escapeHtml(poSearch)}" oninput="poSearch=this.value; renderPOListRows()" autocomplete="off">
      ${poSearch ? `<button class="btn ghost small" onclick="poSearch=''; document.getElementById('po-search-input').value=''; renderPOListRows()" title="Clear search">✕</button>` : ''}
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
  const rowsHtml = pag.pagedItems.map((po, i) => `
    <div class="po-summary-row" style="animation-delay:${i * 30}ms" onclick="viewPODetail('${po.id}')">
      <div class="po-num">${escapeHtml(po.poNumber)}</div>
      <div class="po-supplier">${escapeHtml(po.supplierName)}</div>
      <div class="po-date">${formatDateOnly(po.orderDate)}</div>
      <div>${poStatusBadge(po.status)}</div>
      <div class="po-total">${peso(po.totalAmount)}</div>
      <div class="po-row-actions-cell" onclick="event.stopPropagation()">
        <button type="button" class="po-actions-menu-btn" onclick="togglePORowActionsMenu('${po.id}', this, event)" title="Actions for ${escapeHtml(po.poNumber)}">
          <span>•••</span>
        </button>
      </div>
    </div>`).join('');
  return rowsHtml + pag.html;
}

function renderPOListRows(keepPage = false) {
  if (!keepPage) {
    resetPaginationPage('purchase_orders');
  }
  const el = document.getElementById('po-list-rows');
  if (el) el.innerHTML = renderPOListRowsHTML();
}

function viewPODetail(id) {
  closePOCalendar();
  closeAllPOActionsMenus();
  closePOProductPicker();
  poViewMode = 'detail';
  poDetailId = id;
  renderPage();
}

function backToPOList() {
  closePOCalendar();
  closeAllPOActionsMenus();
  closePOProductPicker();
  poViewMode = 'list';
  poDetailId = null;
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
      ${poStatusBadge(po.status)}
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
              <th>Brand</th>
              <th class="right">Unit Cost</th>
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
          const received = Number(item.receivedQty !== undefined ? item.receivedQty : (po.status === 'received' ? ordered : 0));
          const remaining = Math.max(0, Number((ordered - received).toFixed(2)));
          const statusBadge = (po.status === 'received' || remaining <= 0)
            ? `<span class="badge ok">✓ Complete</span>`
            : (received > 0
              ? `<span class="badge po-partial">${formatStock(received)} / ${formatStock(ordered)}</span>`
              : `<span class="badge inactive">0 / ${formatStock(ordered)}</span>`);
          const p = productById(item.productId);
          const size = Number(item.size) || 1;
          const variant = p ? productSizeVariantBySize(p, size) : null;
          const sizeId = item.sizeId || (variant ? variant.sizeId : null);
          const prodId = p ? (p.productId || p.id) : item.productId;

          return `
              <tr style="animation:poRowIn .2s ease-out ${i * 30}ms both">
                <td style="color:var(--ink-soft); font-size:12px;">${i + 1}</td>
                <td>
                  <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <strong>${escapeHtml(item.productName)}</strong>
                    <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal);">(${getProductHex(p)})</code>
                    ${item.color && item.color !== '-' ? `<span class="muted small"> (${escapeHtml(item.color)})</span>` : ''}
                  </div>
                </td>
                <td class="muted small">
                  <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                    <span>${escapeHtml(item.brand || '')} · <strong>${size}L</strong></span>
                  </div>
                </td>
                <td class="right">${peso(item.unitCost)}</td>
                <td class="right"><strong>${formatStock(ordered)}</strong></td>
                <td class="right" style="color:${received > 0 ? 'var(--teal)' : 'var(--ink-soft)'}; font-weight:600;">${formatStock(received)}</td>
                <td class="right" style="color:${remaining > 0 ? '#C1443D' : 'var(--success)'}; font-weight:700;">${formatStock(remaining)}</td>
                <td class="center">${statusBadge}</td>
                <td class="right" style="font-weight:700; color:var(--teal-dark);">${peso(item.unitCost * ordered)}</td>
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
  </div>`;
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
  const po = (db.purchaseOrders || []).find(o => o.id === id);
  if (!po) return;
  const prevStatus = po.status === 'pending' ? 'Pending Approval' : (po.status || 'Pending');
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

/* Adds a PO's ordered/partial quantities to stock, logs movements and updates PO status (partial vs received). */
async function completePOReceiving(po, refNote = '', batchQtys = null) {
  const items = getPOItems(po);
  const date = nowISO();
  const prevPOStatus = po.status === 'partial' ? 'Partial Delivery' : 'Approved / Ordered';
  let receivedItemCount = 0;
  const receivedDetailsList = [];
  const beforeSummaryList = [];
  const afterSummaryList = [];
  let firstProductId = '';

  items.forEach((item, idx) => {
    const p = productById(item.productId);
    const ordered = Number(item.qty || 0);
    const alreadyReceived = Number(item.receivedQty !== undefined ? item.receivedQty : (po.status === 'received' ? ordered : 0));
    const remaining = Math.max(0, Number((ordered - alreadyReceived).toFixed(2)));

    let qtyToReceive = remaining;
    if (batchQtys !== null) {
      qtyToReceive = Math.min(remaining, Math.max(0, Number(batchQtys[idx] ?? batchQtys[item.productId] ?? 0)));
    }

    if (qtyToReceive > 0) {
      receivedItemCount++;
      const newReceivedTotal = Number((alreadyReceived + qtyToReceive).toFixed(2));
      item.receivedQty = newReceivedTotal;

      if (p) {
        if (!firstProductId) firstProductId = p.productId || p.id;
        const size = Number(item.size) || 1;
        const variant = productSizeVariantBySize(p, size);
        const sizeId = item.sizeId || (variant ? variant.sizeId : null);
        const liters = Number((qtyToReceive * size).toFixed(2));
        const beforeStock = Number(p.stock) || 0;
        const beforeCans = productCanCount(p, size);
        const afterCans = beforeCans + qtyToReceive;
        if (!p.canStock || Array.isArray(p.canStock) || typeof p.canStock !== 'object') p.canStock = {};
        p.canStock[size] = afterCans;
        syncProductVariants(p);
        normalizeProductOpenedStock(p);
        const afterStock = productHasCanBreakdown(p) ? canBreakdownLiters(p) : Number((beforeStock + liters).toFixed(2));
        p.stock = afterStock;
        syncProductVariants(p);
        receivedDetailsList.push(`${p.name} (${qtyToReceive} × ${size}L = +${formatStock(liters)}L)`);
        beforeSummaryList.push(`${p.name} (${size}L): ${beforeCans} units (${formatStock(beforeStock)}L total)`);
        afterSummaryList.push(`${p.name} (${size}L): ${afterCans} units (${formatStock(p.stock)}L total)`);
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
          note: `PO Delivery: ${po.poNumber} (${po.supplierName}) [Received ${qtyToReceive} × ${size}L (+${formatStock(liters)}L) · ${size}L Units: ${beforeCans}→${afterCans}, Stock: ${formatStock(beforeStock)}L→${formatStock(p.stock)}L, PO: ${newReceivedTotal}/${ordered}]${refNote ? ' — ' + refNote : ''}`,
          staffName: (currentUser && currentUser.name) || 'Staff'
        });
      }
    } else {
      item.receivedQty = alreadyReceived;
    }
  });

  const allCompleted = items.every(it => Number(it.receivedQty || 0) >= Number(it.qty || 0));
  po.status = allCompleted ? 'received' : 'partial';
  po.receivedAt = date;
  po.items = items;
  po.itemsJson = JSON.stringify(items);

  if (receivedItemCount > 0 && typeof logAudit === 'function') {
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

    logAudit('PO_RECEIVE', 'Purchase Order', `${allCompleted ? 'Fully received' : 'Partially received'} Purchase Order ${po.poNumber} from ${po.supplierName} (${receivedItemCount} item${receivedItemCount === 1 ? '' : 's'})`, {
      entityName: po.poNumber,
      fieldChanged: 'Purchase Order Status',
      oldValue: prevPOStatus,
      newValue: allCompleted ? 'Fully Received' : 'Partial Delivery',
      referenceNo: po.poNumber,
      reason: rcvSummary
    });
  }

  await saveDB();

  return { items, allCompleted, receivedItemCount };
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
    <h1>Purchase Order: ${escapeHtml(po.poNumber)}</h1>
    <h2>MRGR Color Center</h2>
    <div class="meta">
      <strong>Supplier:</strong> ${escapeHtml(po.supplierName)}<br>
      <strong>Date:</strong> ${formatDateTime(po.orderDate)}<br>
      <strong>Status:</strong> ${po.status.charAt(0).toUpperCase() + po.status.slice(1)}<br>
      <strong>Created By:</strong> ${escapeHtml(po.createdBy)}
      ${po.notes ? `<br><strong>Notes:</strong> ${escapeHtml(po.notes)}` : ''}
    </div>
    <table>
      <thead><tr><th>#</th><th>Product</th><th>Brand</th><th class="right">Unit Cost</th><th class="right">Ordered</th><th class="right">Received</th><th class="right">Remaining</th><th class="right">Total</th></tr></thead>
      <tbody>${items.map((item, i) => {
    const ordered = Number(item.qty || 0);
    const received = Number(item.receivedQty !== undefined ? item.receivedQty : (po.status === 'received' ? ordered : 0));
    const remaining = Math.max(0, Number((ordered - received).toFixed(2)));
    const hex = getProductHex(productById(item.productId));
    return `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(item.productName)}${hex ? ` (${hex})` : ''}${item.color && item.color !== '-' ? ` (${escapeHtml(item.color)})` : ''}</td>
          <td>${escapeHtml(item.brand || '')}</td>
          <td class="right">₱${Number(item.unitCost).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
          <td class="right">${formatStock(ordered)}</td>
          <td class="right">${formatStock(received)}</td>
          <td class="right">${formatStock(remaining)}</td>
          <td class="right">₱${Number(item.unitCost * ordered).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
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
function getProductsForSupplier(supplierId) {
  if (!supplierId || typeof db === 'undefined' || !db || !Array.isArray(db.products)) return [];
  const supplier = (db.suppliers || []).find(s => s.id === supplierId);
  const sProductIds = supplier && Array.isArray(supplier.productIds) ? supplier.productIds : [];
  return activeProducts().filter(p => {
    if (!p || p.status !== 'active') return false;
    return sProductIds.includes(p.id) || p.supplierId === supplierId || p.supplier_id === supplierId;
  });
}

function onPOStockFilterChange(val) {
  poCreateStockFilter = val || 'low_out';
  renderPOItemRows();
}

function isSizeVisibleInPO(product, size, row, filter) {
  if (filter === 'all') return true;
  if (row && row.expanded) return true;

  const st = productSizeStatus(product, size);
  if (filter === 'low_out') {
    return st === 'low' || st === 'out';
  }
  if (filter === 'low_only') {
    return st === 'low';
  }
  if (filter === 'out_only') {
    return st === 'out';
  }
  if (filter === 'good_only') {
    return st === 'ok';
  }
  return true;
}

function togglePOProductExpand(index) {
  const row = poItemRows[index];
  if (!row) return;
  row.expanded = !row.expanded;
  // If collapsing back to default, clear any order quantities entered for Good Stock sizes
  // so hidden sizes have zero order quantity by default and do not affect the grand total
  if (!row.expanded && row.productId) {
    const product = productById(row.productId);
    if (product) {
      poSizesFor(product).forEach(s => {
        if (productSizeStatus(product, s) === 'ok') {
          if (row.qtys && row.qtys[s]) {
            delete row.qtys[s];
          }
        }
      });
    }
  }
  renderPOItemRows();
}

function startCreatePO() {
  closePOCalendar();
  closeAllPOActionsMenus();
  closePOProductPicker();
  poViewMode = 'create';
  poSupplierId = '';
  poCreateStockFilter = 'low_out';
  poItemRows = [newPORow('')];
  renderPage();
}

function poCreatePage() {
  const supplierOptions = db.suppliers
    .filter(s => s.status === 'active')
    .map(s => {
      const linkedCount = getProductsForSupplier(s.id).length;
      return `<option value="${s.id}" ${s.id === poSupplierId ? 'selected' : ''}>${escapeHtml(s.name)} (${linkedCount} products)</option>`;
    })
    .join('');

  const htmlContent = `
  <div style="display:flex; align-items:center; gap:10px; margin-bottom:18px;">
<button class="btn secondary small" onclick="backToPOList()">← Purchase Orders</button>
<span style="color:var(--ink-soft); font-size:13px;">›</span>
<span style="font-size:13px; font-weight:600;">New Order</span>
  </div>

  <div class="panel">
<div class="panel-head row">
  <h3>📋 Create Purchase Order</h3>
  <div class="spacer"></div>
  <span class="muted small">Fields marked <span style="color:var(--danger);">*</span> are required</span>
</div>
<div class="panel-body">
  ${poItemRows.some(r => r.productId) ? `
    <div class="alert-banner warning" style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
      <span style="font-size:18px;">🔍</span>
      <div>
        <b>Check Low-Stock Order Before Submitting:</b> Low-stock &amp; out-of-stock sizes have been loaded with recommended quantities. Staff can verify container sizes, change quantities, add notes, and submit for approval.
      </div>
    </div>
  ` : ''}
  <form id="po-create-form" onsubmit="return submitPO(event)">
    <div class="form-grid">
      <div class="field">
        <label>Supplier <span style="color:var(--danger);">*</span></label>
        <select id="po-supplier" onchange="onPOSupplierChange()" required>
          <option value="">-- Select a Supplier --</option>
          ${supplierOptions || '<option value="" disabled>No active suppliers on file</option>'}
        </select>
      </div>
      <div class="field">
        <label>Notes (optional)</label>
        <input id="po-notes" type="text" placeholder="e.g. Urgent restock, monthly order" value="${escapeHtml(window._poInitialNotes || '')}">
      </div>
    </div>

    <div style="margin-top:22px;">
      <div class="po-items-toolbar">
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <h4 style="margin:0;">Order Items</h4>
          <div class="po-stock-filter-wrapper">
            <label for="po-stock-filter" style="font-size:12px; font-weight:600; color:var(--ink-soft); margin:0;">Filter Sizes:</label>
            <select id="po-stock-filter" class="po-filter-select" onchange="onPOStockFilterChange(this.value)">
              <option value="low_out" ${poCreateStockFilter === 'low_out' ? 'selected' : ''}>Low Stock &amp; Out of Stock (Default)</option>
              <option value="all" ${poCreateStockFilter === 'all' ? 'selected' : ''}>All Container Sizes</option>
              <option value="low_only" ${poCreateStockFilter === 'low_only' ? 'selected' : ''}>Low Stock Only</option>
              <option value="out_only" ${poCreateStockFilter === 'out_only' ? 'selected' : ''}>Out of Stock Only</option>
              <option value="good_only" ${poCreateStockFilter === 'good_only' ? 'selected' : ''}>Good Stock Only</option>
            </select>
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn secondary small" onclick="addPOItemRow()">+ Add Row</button>
          <button type="button" class="btn secondary small" onclick="addAllSupplierProductsToPO()">⚡ All Supplier Products</button>
          <button type="button" class="btn secondary small" onclick="addLowStockToPO()">⚠️ Low-Stock Only</button>
        </div>
      </div>
      <div id="po-items-container"></div>
    </div>

    <div id="po-create-total" class="po-items-summary" style="margin-top:16px;">
      <div><div class="po-grand-label">Grand Total · 0 items</div></div>
      <div class="po-grand-total" id="po-grand-total-value">₱0.00</div>
    </div>

    <div style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end; align-items:center;">
      <span class="muted small" style="margin-right:auto;">
        ${currentUser && currentUser.role === 'admin'
      ? '✅ As Administrator, this order will be automatically approved and marked as <b>Ordered</b>.'
      : '⏳ As Inventory Staff, this order will be submitted as <b>Pending Approval</b> for the Administrator to review.'}
      </span>
      <button type="button" class="btn secondary" onclick="backToPOList()">Cancel</button>
      <button type="submit" class="btn" id="btn-submit-po">${currentUser && currentUser.role === 'admin' ? 'Create & Approve Order →' : 'Submit for Approval →'}</button>
    </div>
  </form>
</div>
  </div>`;
  window._poInitialNotes = '';
  return htmlContent;
}

function onPOSupplierChange() {
  const sel = document.getElementById('po-supplier');
  if (!sel) return;
  poSupplierId = sel.value;
  poCreateStockFilter = 'low_out';
  closePOProductPicker();

  if (!poSupplierId) {
    poItemRows = [newPORow('')];
    renderPOItemRows();
    return;
  }

  const supplierProducts = getProductsForSupplier(poSupplierId);
  if (supplierProducts.length > 0) {
    poItemRows = supplierProducts.map(p => {
      const qtys = {};
      const lowSizes = productLowSizes(p);
      lowSizes.forEach(s => {
        const count = productCanCount(p, s);
        const thresh = productSizeThreshold(p, s);
        const minBatch = s >= 16 ? 1 : (s >= 4 ? 2 : 5);
        qtys[s] = Math.min(PO_MAX_QTY, Math.max(minBatch, (thresh * 2) - count));
      });
      // Good stock sizes have 0 quantity by default
      return newPORow(p.id, qtys, false);
    });
  } else {
    poItemRows = [newPORow('')];
  }

  renderPOItemRows();
}

function renderPOItemRows() {
  const container = document.getElementById('po-items-container');
  const totalEl = document.getElementById('po-create-total');
  if (!container) return;

  const supplier = poSupplierId ? db.suppliers.find(s => s.id === poSupplierId) : null;

  if (!supplier) {
    container.innerHTML = `<div class="alert-banner" style="margin-bottom:0;">ℹ️ Please select a supplier above. The item list will show products linked to that supplier.</div>`;
    if (totalEl) {
      totalEl.innerHTML = `<div class="po-grand-label">Grand Total · 0 items</div><div class="po-grand-total">₱0.00</div>`;
    }
    return;
  }

  const allActive = activeProducts();
  const suppliedProducts = getProductsForSupplier(supplier.id);

  if (allActive.length === 0) {
    container.innerHTML = `<div class="alert-banner danger" style="margin-bottom:0;">⚠️ No active products found in inventory. <a href="#" onclick="goTo('inventory'); return false;" style="font-weight:600; text-decoration:underline;">Add products in Inventory &rarr;</a></div>`;
    return;
  }

  const unlinkedBanner = suppliedProducts.length === 0
    ? `<div class="alert-banner" style="margin-bottom:14px; font-size:12.5px;">ℹ️ No products are pre-linked to <b>${escapeHtml(supplier.name)}</b> yet. You can select any paint product below — it will be linked to this supplier automatically.</div>`
    : '';

  let grandTotal = 0;
  let totalCans = 0;
  let validLineCount = 0;

  const rowsHtml = poItemRows.map((row, index) => {
    const product = row.productId ? productById(row.productId) : null;

    if (!product || product.status !== 'active') {
      return `
        <tr class="po-group-first-row po-product-row-unselected" style="animation:poRowIn .18s ease-out both;">
          <td class="po-cell-product-group" style="vertical-align:middle;">
            ${renderPOProductPickerTrigger(index, null)}
          </td>
          <td class="center muted">—</td>
          <td class="center muted">—</td>
          <td class="center muted">—</td>
          <td class="right muted">—</td>
          <td class="right muted">—</td>
          <td class="right muted">—</td>
          <td class="po-cell-action-group center" style="vertical-align:middle;">
            ${poItemRows.length > 1
          ? `<button type="button" class="btn ghost small po-remove-product-btn" onclick="removePOItemRow(${index})" title="Remove row">✕</button>`
          : ''}
          </td>
        </tr>`;
    }

    const allSizes = poSizesFor(product);
    const pricePerLiter = Number(product.price) || 0;
    const isExpanded = Boolean(row.expanded);

    const totalProductCans = allSizes.reduce((sum, s) => sum + productCanCount(product, s), 0);
    const lowOrOutSizes = allSizes.filter(s => {
      const st = productSizeStatus(product, s);
      return st === 'low' || st === 'out';
    });
    const restockCount = lowOrOutSizes.length;
    const goodSizes = allSizes.filter(s => productSizeStatus(product, s) === 'ok');
    const hiddenGoodCount = isExpanded ? 0 : goodSizes.length;

    const visibleSizes = allSizes.filter(s => isSizeVisibleInPO(product, s, row, poCreateStockFilter));

    allSizes.forEach(s => {
      const currentQty = Number(row.qtys && row.qtys[s]) || 0;
      if (currentQty > 0) {
        const pricePerCan = poUnitCost(product, s);
        grandTotal += Number((currentQty * pricePerCan).toFixed(2));
        totalCans += currentQty;
        validLineCount++;
      }
    });

    const expandBtnHtml = isExpanded
      ? `<button type="button" class="btn ghost small po-expand-toggle-btn" onclick="togglePOProductExpand(${index})" title="Hide Good Stock container sizes">
           ▴ Hide Good Stock Sizes
         </button>`
      : (hiddenGoodCount > 0
        ? `<button type="button" class="btn secondary small po-expand-toggle-btn" onclick="togglePOProductExpand(${index})" title="Show all ${allSizes.length} container sizes">
               ▾ Show All Container Sizes (${hiddenGoodCount})
             </button>`
        : `<span class="muted small center" style="display:block; font-size:11px; padding:3px 0;">All container sizes visible</span>`
      );

    const productCardHtml = `
      <div class="po-product-group-card">
        ${renderPOProductPickerTrigger(index, product)}
        <div class="po-product-meta-details">
          <div><b style="color:var(--ink);">Brand:</b> ${escapeHtml(product.brand || '—')}</div>
          <div><b style="color:var(--ink);">Color:</b> ${escapeHtml(product.color && product.color !== '-' ? product.color : '—')}</div>
          <div><b style="color:var(--ink);">Category:</b> <span class="badge" style="background:#F4EFE6; color:#6B6259; font-size:11px; padding:1px 6px;">${escapeHtml(product.category || product.type || 'General')}</span></div>
        </div>
        <div class="po-product-stock-indicators">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--ink-soft);">Total Stock:</span>
            <span style="font-weight:700; color:var(--ink);">${formatStock(product.stock)}L <span class="muted font-normal">(${totalProductCans} units)</span></span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--ink-soft);">Requires Restock:</span>
            <span class="badge ${restockCount > 0 ? 'low' : 'ok'} small" style="font-size:11px;">
              ${restockCount > 0 ? `⚠️ ${restockCount} size${restockCount === 1 ? '' : 's'}` : '✓ None'}
            </span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--ink-soft);">Hidden Good Stock:</span>
            <span style="font-weight:700; color:${hiddenGoodCount > 0 ? 'var(--teal-dark)' : 'var(--ink-soft)'};">
              ${isExpanded ? '0 (Expanded)' : `${hiddenGoodCount} size${hiddenGoodCount === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
        <div style="margin-top:2px;">
          ${expandBtnHtml}
        </div>
      </div>
    `;

    const actionCellHtml = (rowSpan) => `
      <td class="po-cell-action-group center" rowspan="${rowSpan}" style="vertical-align:middle;">
        ${poItemRows.length > 1
        ? `<button type="button" class="btn ghost small po-remove-product-btn" onclick="removePOItemRow(${index})" title="Remove ${escapeHtml(product.name)} from order">✕</button>`
        : `<button type="button" class="btn ghost small po-remove-product-btn" onclick="clearPOProductRow(${index}, event)" title="Clear product">✕</button>`}
      </td>
    `;

    if (visibleSizes.length === 0) {
      return `
        <tr class="po-group-first-row po-product-row-empty" style="animation:poRowIn .18s ease-out both;">
          <td class="po-cell-product-group" rowspan="1">
            ${productCardHtml}
          </td>
          <td colspan="6" class="center muted po-empty-sizes-cell" style="padding:20px 14px; background:#FAF9F6; vertical-align:middle;">
            <div style="display:flex; flex-direction:column; align-items:center; gap:6px;">
              <span style="font-size:13px; color:var(--ink-soft);">
                All container sizes are in <b>Good Stock</b> (${hiddenGoodCount} hidden).
              </span>
              <button type="button" class="btn secondary small" onclick="togglePOProductExpand(${index})">
                ▾ Show All Container Sizes (${hiddenGoodCount})
              </button>
            </div>
          </td>
          ${actionCellHtml(1)}
        </tr>
      `;
    }

    const rowSpan = visibleSizes.length;
    return visibleSizes.map((s, sizeIdx) => {
      const currentQty = Number(row.qtys && row.qtys[s]) || 0;
      const canCount = productCanCount(product, s);
      const thresh = productSizeThreshold(product, s);
      const st = productSizeStatus(product, s);
      const isLow = st === 'low' || st === 'out';

      const pricePerCan = poUnitCost(product, s);
      const lineTotal = Number((currentQty * pricePerCan).toFixed(2));

      const isFirstSizeRow = sizeIdx === 0;

      const productCellHtml = isFirstSizeRow
        ? `<td class="po-cell-product-group" rowspan="${rowSpan}">
             ${productCardHtml}
           </td>`
        : '';

      const actionTd = isFirstSizeRow ? actionCellHtml(rowSpan) : '';

      let stockBadgeHtml = '';
      if (st === 'out') {
        stockBadgeHtml = `
          <div class="po-stock-display">
            <span class="badge out" title="Out of stock! Threshold is ${thresh} units">0 units</span>
            <div class="po-shortage-hint">OUT OF STOCK</div>
          </div>`;
      } else if (st === 'low') {
        stockBadgeHtml = `
          <div class="po-stock-display">
            <span class="badge low" title="Low stock: ${canCount} units (min threshold: ${thresh} units)">${canCount} ${canCount === 1 ? 'unit' : 'units'}</span>
            <div class="po-shortage-hint">LOW STOCK (min ${thresh})</div>
          </div>`;
      } else {
        stockBadgeHtml = `
          <div class="po-stock-display">
            <span class="badge ok" title="Good stock: ${canCount} units (threshold: ${thresh} units)">${canCount} ${canCount === 1 ? 'unit' : 'units'}</span>
            <div class="po-good-hint">GOOD STOCK</div>
          </div>`;
      }

      return `
        <tr class="po-size-row ${isFirstSizeRow ? 'po-group-first-row' : ''} ${currentQty > 0 ? 'has-order-qty' : ''}"
            id="po-size-row-${index}-${s}"
            style="animation:poRowIn .18s ease-out both;">
          ${productCellHtml}
          <td class="po-cell-size center">
            <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
              <span class="po-size-tag"><strong>${fmtSize(s)}</strong></span>
            </div>
          </td>
          <td class="po-cell-stock center">
            ${stockBadgeHtml}
          </td>
          <td class="po-cell-qty center">
            <div class="po-table-qty-group">
              <button type="button" class="po-table-qty-btn minus" onclick="stepPOQty(${index}, ${s}, -1)" title="Decrease quantity">−</button>
              <input type="number"
                     id="po-qty-${index}-${s}"
                     class="po-table-qty-input ${currentQty > 0 ? 'active' : ''}"
                     min="0"
                     max="${PO_MAX_QTY}"
                     step="1"
                     value="${currentQty > 0 ? currentQty : 0}"
                     placeholder="0"
                     onclick="this.select()"
                     onfocus="this.select()"
                     oninput="onPOQtyChange(${index}, ${s}, this.value)"
                     onkeydown="if(['-','e','E','+'].includes(event.key)){event.preventDefault();}">
              <button type="button" class="po-table-qty-btn plus" onclick="stepPOQty(${index}, ${s}, 1)" title="Increase quantity">+</button>
              <span class="po-table-qty-unit">units</span>
            </div>
          </td>
          <td class="po-cell-price-l right" style="font-family:'Space Grotesk',sans-serif; font-size:13px; color:var(--ink-soft);">
            ${peso(pricePerLiter)}
          </td>
          <td class="po-cell-price-can right" id="po-can-price-${index}-${s}" style="font-family:'Space Grotesk',sans-serif; font-size:13.5px; font-weight:600; color:var(--ink);">
            ${peso(pricePerCan)}
          </td>
          <td class="po-cell-line-total right" id="po-line-total-${index}-${s}" style="font-family:'Space Grotesk',sans-serif; font-size:14px; font-weight:700;">
            <span class="po-line-total-val ${lineTotal > 0 ? 'has-total' : 'zero'}">${peso(lineTotal)}</span>
          </td>
          ${actionTd}
        </tr>`;
    }).join('');
  }).join('');

  container.innerHTML = `
    ${unlinkedBanner}
    <div class="po-table-responsive-wrap">
      <table class="po-create-order-table">
        <thead>
          <tr>
            <th style="min-width:280px; text-align:left;">Product</th>
            <th style="min-width:110px; text-align:center;">Container Size</th>
            <th style="min-width:130px; text-align:center;">Available Stock</th>
            <th style="min-width:160px; text-align:center;">Order Quantity</th>
            <th style="min-width:120px; text-align:right;">Price per Liter</th>
            <th style="min-width:120px; text-align:right;">Price per Unit</th>
            <th style="min-width:130px; text-align:right;">Line Total</th>
            <th style="width:40px; text-align:center;"></th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;

  if (totalEl) {
    totalEl.innerHTML = `
      <div><div class="po-grand-label">Grand Total · ${validLineCount} item${validLineCount !== 1 ? 's' : ''} (${totalCans} unit${totalCans !== 1 ? 's' : ''})</div></div>
      <div class="po-grand-total" id="po-grand-total-value">${peso(grandTotal)}</div>
    `;
    const grandTotalEl = document.getElementById('po-grand-total-value');
    if (grandTotalEl) {
      grandTotalEl.classList.remove('bump');
      void grandTotalEl.offsetWidth;
      grandTotalEl.classList.add('bump');
    }
  }
}


const PO_MAX_QTY = 1000; // maximum quantity allowed per size per product
const PO_SIZES = [1, 4, 16];
/* Each product has its own can sizes (p.sizes); fall back to the defaults while no product is chosen */
function poSizesFor(product) { return product ? productSizes(product) : PO_SIZES; }

function newPORow(productId, qtys, expanded = false) {
  return { id: uid('poi'), productId: productId || '', qtys: { ...(qtys || {}) }, expanded: Boolean(expanded) };
}

function poUnitCost(product, size) {
  const pricePerLiter = product && product.price ? Number(product.price) : 0;
  return Number((pricePerLiter * (Number(size) || 1)).toFixed(2));
}

function poRowTotals(row) {
  const product = row.productId ? productById(row.productId) : null;
  let lineTotal = 0;
  let hasQty = false;
  if (product) {
    poSizesFor(product).forEach(s => {
      const q = Number(row.qtys && row.qtys[s]) || 0;
      if (q > 0) {
        hasQty = true;
        lineTotal += q * poUnitCost(product, s);
      }
    });
  }
  return { lineTotal: Number(lineTotal.toFixed(2)), hasQty };
}

function calculatePOGrandSummary() {
  let grand = 0;
  let totalCans = 0;
  let validLines = 0;

  poItemRows.forEach(r => {
    const p = r.productId ? productById(r.productId) : null;
    if (!p) return;
    poSizesFor(p).forEach(s => {
      const q = Number(r.qtys && r.qtys[s]) || 0;
      if (q > 0) {
        grand += q * poUnitCost(p, s);
        totalCans += q;
        validLines++;
      }
    });
  });

  return { grand: Number(grand.toFixed(2)), totalCans, validLines };
}

function updatePOGrandTotalDisplay() {
  const { grand, totalCans, validLines } = calculatePOGrandSummary();
  const totalEl = document.getElementById('po-create-total');
  if (totalEl) {
    totalEl.innerHTML = `
      <div><div class="po-grand-label">Grand Total · ${validLines} item${validLines !== 1 ? 's' : ''} (${totalCans} unit${totalCans !== 1 ? 's' : ''})</div></div>
      <div class="po-grand-total" id="po-grand-total-value">${peso(grand)}</div>
    `;
    const grandEl = document.getElementById('po-grand-total-value');
    if (grandEl) {
      grandEl.classList.remove('bump');
      void grandEl.offsetWidth;
      grandEl.classList.add('bump');
    }
  }
}

function onPOQtyChange(index, size, rawValue) {
  const row = poItemRows[index];
  if (!row) return;

  let valStr = String(rawValue || '').trim();
  let qty = 0;
  if (valStr !== '') {
    qty = Math.max(0, parseInt(valStr, 10) || 0);
  }

  if (qty > PO_MAX_QTY) {
    qty = PO_MAX_QTY;
    showToast(`Maximum quantity per size is ${PO_MAX_QTY}.`, 'error');
    const inputEl = document.getElementById(`po-qty-${index}-${size}`);
    if (inputEl) inputEl.value = PO_MAX_QTY;
  }

  if (!row.qtys) row.qtys = {};
  row.qtys[size] = qty;

  const product = row.productId ? productById(row.productId) : null;
  const pricePerCan = poUnitCost(product, size);
  const lineTotal = Number((qty * pricePerCan).toFixed(2));

  // update the line total cell for this container size row
  const lineTotalEl = document.getElementById(`po-line-total-${index}-${size}`);
  if (lineTotalEl) {
    lineTotalEl.innerHTML = `<span class="po-line-total-val ${lineTotal > 0 ? 'has-total' : 'zero'}">${peso(lineTotal)}</span>`;
  }

  // update input active style
  const inputEl = document.getElementById(`po-qty-${index}-${size}`);
  if (inputEl) {
    inputEl.classList.toggle('active', qty > 0);
  }

  // highlight size row if qty > 0
  const rowEl = document.getElementById(`po-size-row-${index}-${size}`);
  if (rowEl) {
    rowEl.classList.toggle('has-order-qty', qty > 0);
  }

  updatePOGrandTotalDisplay();
}

function stepPOQty(index, size, delta) {
  const row = poItemRows[index];
  if (!row) return;
  const current = Number(row.qtys && row.qtys[size]) || 0;
  const next = Math.max(0, Math.min(PO_MAX_QTY, current + delta));
  const inputEl = document.getElementById(`po-qty-${index}-${size}`);
  if (inputEl) inputEl.value = next;
  onPOQtyChange(index, size, next);
}

function updatePOItemRow(index, field, value) {
  if (!poItemRows[index]) return;
  poItemRows[index][field] = value;
  renderPOItemRows();
}

function addPOItemRow() {
  poItemRows.push(newPORow(''));
  renderPOItemRows();
}

function removePOItemRow(index) {
  if (poItemRows.length <= 1) {
    poItemRows[0] = newPORow('');
  } else {
    poItemRows.splice(index, 1);
  }
  renderPOItemRows();
}

function poSuggestedQty(p, size = 0) {
  if (!p) return 5;
  const s = size > 0 ? normalizeCanSize(size) : ((productSizes(p) || [])[0] || 1);
  const count = productCanCount(p, s);
  const thresh = productSizeThreshold(p, s);
  const minBatch = s >= 16 ? 1 : (s >= 4 ? 2 : 5);
  const needed = Math.max(minBatch, (thresh * 2) - count);
  return Math.min(PO_MAX_QTY, needed);
}

function addAllSupplierProductsToPO() {
  const supplier = poSupplierId ? db.suppliers.find(s => s.id === poSupplierId) : null;
  if (!supplier) { showToast('Select a supplier first.', 'error'); return; }
  const supplied = getProductsForSupplier(supplier.id);
  if (!supplied.length) { showToast('No products linked to this supplier.', 'error'); return; }
  poItemRows = supplied.map(p => newPORow(p.id, {}, true));
  renderPOItemRows();
  showToast(`Loaded ${supplied.length} product(s) from ${supplier.name}.`);
}

function addLowStockToPO() {
  const supplier = poSupplierId ? db.suppliers.find(s => s.id === poSupplierId) : null;
  if (!supplier) { showToast('Select a supplier first.', 'error'); return; }
  const supplied = getProductsForSupplier(supplier.id);
  const low = supplied.filter(p => productHasLowStock(p));
  if (!low.length) { showToast('No low-stock products from this supplier.', 'ok'); return; }
  if (poItemRows.length === 1 && !poItemRows[0].productId) poItemRows = [];
  low.forEach(p => {
    if (!poItemRows.some(r => r.productId === p.id)) {
      const qtys = {};
      const lowSizes = productLowSizes(p);
      const hasNonStandard = lowSizes.some(s => ![1, 4, 16].includes(s));
      if (lowSizes.length > 0) {
        lowSizes.forEach(s => {
          const count = productCanCount(p, s);
          const thresh = productSizeThreshold(p, s);
          const minBatch = s >= 16 ? 1 : (s >= 4 ? 2 : 5);
          qtys[s] = Math.min(PO_MAX_QTY, Math.max(minBatch, (thresh * 2) - count));
        });
      } else {
        const primarySize = (productSizes(p) || [])[0] || 1;
        qtys[primarySize] = poSuggestedQty(p, primarySize);
      }
      poItemRows.push(newPORow(p.id, qtys, false));
    }
  });
  renderPOItemRows();
  showToast(`Added ${low.length} low-stock item(s).`);
}

async function submitPO(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (window._isSubmittingPO) return false;
  window._isSubmittingPO = true;
  const submitBtn = document.getElementById('btn-submit-po');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const supplierId = document.getElementById('po-supplier').value;
    const supplier = db.suppliers.find(s => s.id === supplierId);
    if (!supplier) { showToast('Please select a supplier.', 'error'); return false; }

    const validRows = poItemRows.filter(r => r.productId && productById(r.productId));
    if (validRows.length === 0) { showToast('Add at least one product to the order.', 'error'); return false; }

    // One PO item per product + size (only sizes with order quantity > 0)
    const items = [];
    validRows.forEach(row => {
      const p = productById(row.productId);
      poSizesFor(p).forEach(s => {
        const q = Number(row.qtys && row.qtys[s]) || 0;
        if (q > 0) {
          const variant = productSizeVariantBySize(p, s);
          items.push({
            productId: p.productId || p.id,
            product_id: p.productId || p.id,
            sizeId: variant ? variant.sizeId : null,
            size_id: variant ? variant.sizeId : null,
            productName: p.name,
            brand: p.brand,
            color: p.color,
            size: s,
            qty: q,
            pricePerLiter: Number(p.price) || 0,
            unitCost: poUnitCost(p, s)
          });
        }
      });
    });

    if (items.length === 0) {
      showToast('Enter an order quantity for at least one container size before submitting.', 'error');
      return false;
    }

    const totalAmount = items.reduce((sum, it) => sum + (it.qty * it.unitCost), 0);
    const notes = (document.getElementById('po-notes') ? document.getElementById('po-notes').value : '').trim();
    const isAdmin = currentUser && currentUser.role === 'admin';
    const status = isAdmin ? 'ordered' : 'pending';

    const expectedDate = null; // Offline system: no expected delivery date

    const po = {
      id: uid('po'),
      poNumber: generatePONumber(),
      supplierId: supplier.id,
      supplierName: supplier.name,
      orderDate: nowISO(),
      expectedDate,
      status,
      totalAmount: Number(totalAmount.toFixed(2)),
      items,
      itemsJson: JSON.stringify(items),
      notes,
      createdBy: (currentUser && currentUser.name) || 'Staff',
      receivedAt: null
    };

    if (!db.purchaseOrders) db.purchaseOrders = [];
    db.purchaseOrders.push(po);
    if (typeof logAudit === 'function') {
      const itemSummary = items.map(it => `${it.productName} (${it.qty} × ${it.size || 1}L)`).join(', ');
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
          reason: notes || `Order for ${supplier.name}: ${itemSummary}`
        }
      );
    }
    await saveDB();

    showToast(
      isAdmin
        ? `Purchase Order ${po.poNumber} created & approved for ${supplier.name}.`
        : `Purchase Order ${po.poNumber} submitted for Admin approval.`,
      'ok'
    );
    poViewMode = 'detail';
    poDetailId = po.id;
    poItemRows = [];
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
      openUnlinkedSupplierModal(unlinkedProducts, supplierGroups, ids);
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
  poSupplierId = supplierId;
  poCreateStockFilter = 'low_out';

  // Build the item rows pre-filled with suggested quantities
  poItemRows = products.map(p => {
    const qtys = {};
    const sizes = productSizes(p);
    let addedAny = false;

    sizes.forEach(s => {
      const count = productCanCount(p, s);
      const thresh = productSizeThreshold(p, s);
      const st = productSizeStatus(p, s);
      const variant = productSizeVariantBySize(p, s);
      const hasOpen = productSizeHasOpenPO(p.id, s, variant ? variant.sizeId : null);

      const isSelected = targetSize != null
        ? isSizeIncludedInSelection(p.id, s, variant ? variant.sizeId : null, targetSize)
        : (st === 'out' || st === 'low' || count <= thresh) && !hasOpen;

      if (isSelected) {
        if (!hasOpen || window._allowDuplicatePOCreation) {
          const minBatch = s >= 16 ? 1 : (s >= 4 ? 2 : 5);
          qtys[s] = Math.min(PO_MAX_QTY, Math.max(minBatch, (thresh * 2) - count));
          addedAny = true;
        } else {
          qtys[s] = 0;
        }
      } else {
        qtys[s] = 0;
      }
    });

    return newPORow(p.id, qtys);
  }).filter(row => {
    return Object.values(row.qtys).some(q => Number(q) > 0);
  });

  // If all rows were filtered out (e.g. all on order), provide fallback row
  if (!poItemRows.length && products.length) {
    poItemRows = [newPORow(products[0].id, {})];
  }

  // Pre-fill notes
  window._poInitialNotes = `Low-stock restock order for ${poItemRows.length} product(s)`;

  // Clear selections
  if (typeof selectedAlertSizeKeys !== 'undefined') selectedAlertSizeKeys.clear();
  if (typeof selectedAlertProductIds !== 'undefined') selectedAlertProductIds.clear();
  if (typeof selectedDashProductIds !== 'undefined') selectedDashProductIds.clear();

  // Navigate to purchase orders page in create mode so staff can check before submitting
  goTo('purchaseOrders');

  const s = supplierById(supplierId);
  showToast(`Loaded ${poItemRows.length} product(s) for ${s ? s.name : 'supplier'}. Please check quantities before submitting for approval.`, 'ok');
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
          <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
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

function openUnlinkedSupplierModal(unlinkedProducts, supplierGroups, allIds) {
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

  createPOFromSelectedLowStock(window._pendingAllIds);
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
  poSupplierId = po.supplierId;

  const grouped = {};
  items.forEach(it => {
    if (!grouped[it.productId]) {
      grouped[it.productId] = { qtys: {}, showAllSizes: false };
    }
    const sz = Number(it.size) || 1;
    grouped[it.productId].qtys[sz] = Number(it.qty) || 0;
    if (![1, 4, 16].includes(sz)) {
      grouped[it.productId].showAllSizes = true;
    }
  });

  poItemRows = Object.keys(grouped).map(pid => newPORow(pid, grouped[pid].qtys, grouped[pid].showAllSizes));
  if (!poItemRows.length) poItemRows = [newPORow('')];

  window._poInitialNotes = `Reorder from ${po.poNumber}`;
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

function renderPOProductPickerTrigger(index, product) {
  if (product) {
    const hex = getProductHex(product);
    return `
      <div class="po-product-picker-trigger-wrap">
        <button type="button" class="po-product-picker-btn selected ${poPickerOpenIndex === index ? 'active' : ''}"
          onclick="togglePOProductPicker(${index}, this, event)"
          title="Click to search or switch paint product">
          <span class="po-picker-avatar" style="background-color:${hex};"></span>
          <div class="po-picker-info">
            <div class="po-picker-title">${escapeHtml(product.name)}</div>
            <div class="po-picker-sub">${escapeHtml(product.brand || '')}${product.color && product.color !== '-' ? ' · ' + escapeHtml(product.color) : ''} · <span style="font-weight:600; color:${productHasLowStock(product) ? '#C1443D' : 'var(--teal-dark)'};">Stock: ${formatLiters(product.stock)}</span></div>
          </div>
          <span class="po-picker-arrow">▾</span>
        </button>
        <button type="button" class="po-picker-reset-btn" onclick="clearPOProductRow(${index}, event)" title="Change / remove product">✕</button>
      </div>`;
  }

  return `
    <button type="button" class="po-product-picker-btn empty ${poPickerOpenIndex === index ? 'active' : ''}"
      onclick="togglePOProductPicker(${index}, this, event)"
      title="Click to select paint product">
      <span class="po-picker-avatar-placeholder">🎨</span>
      <div class="po-picker-info">
        <div class="po-picker-title" style="color:var(--ink-soft); font-weight:600;">Select paint product…</div>
        <div class="po-picker-sub">Search paint name, color swatch, brand, or SKU</div>
      </div>
      <span class="po-picker-arrow">▾</span>
    </button>`;
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
      const price = p.price ? `${peso(p.price)}/L` : '—';
      const isLinked = hasSupplied && suppliedProducts.some(sp => sp.id === p.id);

      return `
          <button type="button" class="po-picker-item ${isSel ? 'selected' : ''} ${otherRow ? 'in-other-row' : ''}" onclick="selectPOProduct(${index}, '${p.id}', event)">
            <span class="po-picker-item-avatar" style="background-color:${hex};"></span>
            <div class="po-picker-item-main">
              <div class="po-picker-item-name">
                <span>${escapeHtml(p.name)}</span>
                ${p.color && p.color !== '-' ? `<span class="po-picker-item-color">(${escapeHtml(p.color)})</span>` : ''}
                ${isLinked ? `<span class="badge" style="background:#EAF4F3; color:var(--teal-dark); font-size:9.5px; padding:1px 5px;">Linked</span>` : ''}
              </div>
              <div class="po-picker-item-sub">
                ${escapeHtml(p.brand || '')}${p.type ? ' · ' + escapeHtml(p.type) : ''} · Price: ${price}
              </div>
            </div>
            <div class="po-picker-item-right">
              ${otherRow
          ? `<span class="badge" style="background:#F0EDED; color:var(--ink-soft); font-size:10px;">Row #${otherRow}</span>`
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
  poItemRows[index].expanded = false;

  const sizes = productSizes(p);
  const lowSizes = productLowSizes(p);

  if (lowSizes.length > 0) {
    lowSizes.forEach(s => {
      const count = productCanCount(p, s);
      const thresh = productSizeThreshold(p, s);
      const minBatch = s >= 16 ? 1 : (s >= 4 ? 2 : 5);
      poItemRows[index].qtys[s] = Math.min(PO_MAX_QTY, Math.max(minBatch, (thresh * 2) - count));
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
