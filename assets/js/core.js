/* ============================================================
   1. DATA & STORAGE ADAPTER
   ============================================================ */
const DB_KEY = 'mrgr_color_center_db';
const SESSION_KEY = 'mrgr_color_center_session';
let db = null;          // the whole "database" object
let currentUser = null; // who is logged in right now
let currentPage = null; // which screen we are on, e.g. 'dashboard', 'pos'
let cart = [];          // items being built up in the current POS sale
let posConfirmPromiseResolve = null; // POS cashier order confirmation resolver

// Storage helper: supports both window.storage and localStorage
const storage = {
  async get(key) {
    if (typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function') {
      try {
        const result = await window.storage.get(key, true);
        if (result && result.value) return result.value;
      } catch (e) {
        console.warn('window.storage.get failed, trying localStorage', e);
      }
    }
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    let saved = false;
    if (typeof window !== 'undefined' && window.storage && typeof window.storage.set === 'function') {
      try {
        await window.storage.set(key, value, true);
        saved = true;
      } catch (e) {
        console.warn('window.storage.set failed, trying localStorage', e);
      }
    }
    try {
      localStorage.setItem(key, value);
      saved = true;
    } catch (e) {
      console.warn('localStorage.setItem failed', e);
    }
    if (!saved) {
      throw new Error('Failed to save to storage');
    }
  }
};

// ---------- small helpers ----------
function uid(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function peso(n) { return '₱' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function toLocalISODate(d) {
  const date = (typeof d === 'string' && d.length === 10) ? new Date(d + 'T00:00:00') : (d || new Date());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nowISO() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const offsetHours = pad(Math.floor(Math.abs(offset) / 60));
  const offsetMinutes = pad(Math.abs(offset) % 60);
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
}

function todayISO() { return toLocalISODate(new Date()); }
function daysAgoISO(n) { const d = new Date(); d.setDate(d.getDate() - n); return toLocalISODate(d); }
function thisMonthStartISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

// Current calendar year & historical records preservation helpers
function getCurrentYear() {
  return new Date().getFullYear();
}

function currentYearStartISO(year) {
  const y = year || getCurrentYear();
  return `${y}-01-01`;
}

function currentYearEndISO(year) {
  const y = year || getCurrentYear();
  return `${y}-12-31`;
}

function isHistoricalView(from, to) {
  if (!from && !to) return true; // All-time is historical access
  const curY = getCurrentYear();
  const curStart = currentYearStartISO(curY);
  const curEnd = currentYearEndISO(curY);
  // Exactly or within current year is not historical
  if (from >= curStart && to <= curEnd) return false;
  // If starting before current year or ending before current year
  if (from && from < curStart) return true;
  if (!from && to && to < curStart) return true;
  if (to && to > curEnd) return false;
  return true;
}

const SYSTEM_START_DATE = '2026-01-01';
const SYSTEM_START_YEAR = 2026;

function getAvailableRecordYears() {
  const years = new Set();
  const currentY = getCurrentYear();
  const startY = SYSTEM_START_YEAR;

  // 2026 is the starting available year; allow users to navigate between 2026 and current year
  for (let y = currentY; y >= startY; y--) {
    years.add(y);
  }

  // Include previous years only when historical records actually exist in database
  if (typeof db !== 'undefined' && db) {
    const checkDate = d => {
      if (d) {
        const y = parseInt(String(d).slice(0, 4), 10);
        // Only include historical years up to current year, never future years
        if (!isNaN(y) && y >= 2000 && y <= currentY) years.add(y);
      }
    };
    (db.sales || []).forEach(s => s && checkDate(s.date));
    (db.movements || []).forEach(m => m && checkDate(m.date));
    (db.purchaseOrders || []).forEach(o => o && checkDate(o.orderDate || o.date));
    (db.adjustmentRequests || []).forEach(r => r && checkDate(r.date));
  }

  return Array.from(years).sort((a, b) => b - a);
}

function formatDateReadable(iso) {
  if (!iso) return '';
  const parts = String(iso).slice(0, 10).split('-');
  if (parts.length !== 3) return String(iso);
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRangeSummary(from, to, prefix = 'Date filter:') {
  const p = prefix ? `${prefix} ` : '';
  const curY = getCurrentYear();
  const today = todayISO();
  if (!from && !to) return `${p}<strong>🏛️ Historical Records (All-Time)</strong>`;
  if (from === currentYearStartISO(curY) && (to === currentYearEndISO(curY) || to === today)) {
    return `${p}<strong>📅 Current Year (${curY})</strong>`;
  }
  // Check if it's an exact previous calendar year
  if (from && to && from.endsWith('-01-01') && to.endsWith('-12-31') && from.slice(0, 4) === to.slice(0, 4)) {
    const yr = from.slice(0, 4);
    return `${p}<strong>🏛️ Historical Year ${yr}</strong>`;
  }
  if (from && to && from === to) return `${p}<strong>${formatDateReadable(from)}</strong>`;
  if (from && to) return `${p}<strong>${formatDateReadable(from)} – ${formatDateReadable(to)}</strong>`;
  if (from) return `${p}<strong>From ${formatDateReadable(from)}</strong>`;
  if (to) return `${p}<strong>Until ${formatDateReadable(to)}</strong>`;
  return '';
}

function getDateRangePreset(from, to) {
  const f = from || '';
  const t = to || '';
  if (!f && !t) return 'all';
  const today = todayISO();
  const yest = daysAgoISO(1);
  const d7 = daysAgoISO(6);
  const d30 = daysAgoISO(29);
  const mStart = thisMonthStartISO();
  const curY = getCurrentYear();
  const yStart = currentYearStartISO(curY);
  const yEnd = currentYearEndISO(curY);

  if (f === today && t === today) return 'today';
  if (f === yest && t === yest) return 'yesterday';
  if (f === d7 && t === today) return '7d';
  if (f === d30 && t === today) return '30d';
  if (f === mStart && t === today) return 'month';
  if (f === yStart && (t === yEnd || t === today)) return 'year';
  return 'custom';
}

/* ============================================================
   SYSTEM-WIDE MONTH & DAY DATE PICKER ENGINE
   ============================================================ */
function formatDateInputMMDDYYYY(iso) {
  if (!iso) return '';
  const str = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return '';
  const [y, m, d] = str.split('-');
  return `${m}/${d}/${y}`;
}

// Backwards-compatible alias for PO module
function formatPOInputDate(iso) {
  return formatDateInputMMDDYYYY(iso);
}

function updateDateYearISO(iso, targetYear, defaultMD = '01-01') {
  const curY = getCurrentYear();
  const today = todayISO();
  const minDate = SYSTEM_START_DATE;
  const yr = (targetYear === 'current' || !targetYear) ? curY : (parseInt(targetYear, 10) || curY);

  let m = defaultMD.slice(0, 2);
  let d = defaultMD.slice(3, 5);
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(String(iso).slice(0, 10))) {
    m = String(iso).slice(5, 7);
    d = String(iso).slice(8, 10);
  }
  const maxDays = new Date(yr, parseInt(m, 10), 0).getDate();
  let dayNum = parseInt(d, 10);
  if (dayNum > maxDays) dayNum = maxDays;
  let newIso = `${yr}-${m}-${String(dayNum).padStart(2, '0')}`;

  const effectiveMin = (yr >= SYSTEM_START_YEAR ? minDate : `${yr}-01-01`);
  if (yr === curY && newIso > today) newIso = today;
  if (newIso < effectiveMin) newIso = effectiveMin;
  return newIso;
}

let appCalConfig = null;
let appCalViewingMonth = new Date().getMonth();

const APP_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function closeAppMonthDayPicker() {
  const el = document.getElementById('app-calendar-popover');
  if (el) el.remove();
  const poEl = document.getElementById('po-calendar-popover');
  if (poEl) poEl.remove();
  appCalConfig = null;
}

function closePOCalendar() {
  closeAppMonthDayPicker();
}

function openAppMonthDayPicker(config) {
  if (!config) return;
  if (config.event) {
    config.event.stopPropagation();
  }
  const existing = document.getElementById('app-calendar-popover') || document.getElementById('po-calendar-popover');
  if (existing && appCalConfig && appCalConfig.target === config.target && appCalConfig.anchorEl === config.anchorEl) {
    closeAppMonthDayPicker();
    return;
  }
  closeAppMonthDayPicker();
  if (typeof closeAllPOActionsMenus === 'function') closeAllPOActionsMenus();
  if (typeof closePOProductPicker === 'function') closePOProductPicker();

  appCalConfig = config;
  const curY = getCurrentYear();
  const yr = (typeof config.selectedYear === 'function' ? config.selectedYear() : config.selectedYear) || curY;
  const currentIso = (typeof config.currentDate === 'function' ? config.currentDate() : config.currentDate) || '';

  if (currentIso && /^\d{4}-\d{2}-\d{2}$/.test(String(currentIso).slice(0, 10))) {
    appCalViewingMonth = parseInt(String(currentIso).slice(5, 7), 10) - 1;
  } else if (yr === curY) {
    appCalViewingMonth = new Date().getMonth();
  } else {
    appCalViewingMonth = 0;
  }

  renderAppMonthDayPicker();
}

function renderAppMonthDayPicker() {
  if (!appCalConfig) return;
  let popover = document.getElementById('app-calendar-popover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'app-calendar-popover';
    popover.className = 'app-calendar-popover po-calendar-popover';
    popover.onclick = e => e.stopPropagation();
    document.body.appendChild(popover);
  }

  const curY = getCurrentYear();
  const today = todayISO();
  const curMonthIdx = new Date().getMonth();
  const yr = (typeof appCalConfig.selectedYear === 'function' ? appCalConfig.selectedYear() : appCalConfig.selectedYear) || curY;
  const numYear = parseInt(yr, 10) || curY;
  const m = appCalViewingMonth;

  const currentIso = (typeof appCalConfig.currentDate === 'function' ? appCalConfig.currentDate() : appCalConfig.currentDate) || '';
  const otherIso = (typeof appCalConfig.otherDate === 'function' ? appCalConfig.otherDate() : appCalConfig.otherDate) || '';

  const canPrev = !(numYear === SYSTEM_START_YEAR && m === 0);
  const canNext = !(numYear === curY && m >= curMonthIdx);

  const firstDayOfWeek = new Date(numYear, m, 1).getDay();
  const daysInMonth = new Date(numYear, m + 1, 0).getDate();

  const minDate = appCalConfig.minDate || SYSTEM_START_DATE;
  const maxDate = appCalConfig.maxDate || today;

  let daysHtml = '';
  for (let i = 0; i < firstDayOfWeek; i++) {
    daysHtml += `<div class="app-cal-cell-empty po-cal-cell-empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${numYear}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    let isDisabled = false;

    // Future dates clamp
    if (numYear === curY && dateStr > maxDate) isDisabled = true;
    const effectiveMin = (numYear >= SYSTEM_START_YEAR ? minDate : `${numYear}-01-01`);
    if (dateStr < effectiveMin) isDisabled = true;

    // Validate from <= to
    if (appCalConfig.target === 'from' && otherIso && dateStr > otherIso) {
      isDisabled = true;
    }
    if (appCalConfig.target === 'to' && otherIso && dateStr < otherIso) {
      isDisabled = true;
    }

    const isSelected = (currentIso === dateStr);
    const isToday = (dateStr === today);

    if (isDisabled) {
      daysHtml += `<button type="button" class="app-cal-day-btn po-cal-day-btn app-cal-day-disabled po-cal-day-disabled" disabled>${d}</button>`;
    } else {
      daysHtml += `<button type="button" class="app-cal-day-btn po-cal-day-btn ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}" onclick="appCalPickDay(${d}, event)" title="${formatDateReadable(dateStr)}">${d}</button>`;
    }
  }

  const targetLabel = (appCalConfig.target === 'from' ? 'From Date' : 'To Date');

  popover.innerHTML = `
    <div class="app-cal-header po-cal-header">
      <div class="app-cal-month-wrap po-cal-month-wrap">
        <button type="button" class="app-cal-nav-btn po-cal-nav-btn" onclick="appCalPrevMonth(event)" ${canPrev ? '' : 'disabled'} title="Previous month">‹</button>
        <select class="app-cal-month-dropdown po-cal-month-dropdown" onchange="appCalChangeMonth(this.value, event)" title="Select month">
          ${APP_MONTH_NAMES.map((name, idx) => {
            const isMonthDisabled = (numYear === curY && idx > curMonthIdx);
            return `<option value="${idx}" ${idx === m ? 'selected' : ''} ${isMonthDisabled ? 'disabled' : ''}>${name}</option>`;
          }).join('')}
        </select>
        <button type="button" class="app-cal-nav-btn po-cal-nav-btn" onclick="appCalNextMonth(event)" ${canNext ? '' : 'disabled'} title="Next month">›</button>
      </div>

      <!-- Locked Year Display: Manual year selection is hidden/disabled; year is locked to Year dropdown -->
      <div class="app-cal-year-locked po-cal-year-locked" title="Year is locked to ${numYear} from the Year dropdown">
        <span class="app-cal-lock-icon po-cal-lock-icon">🔒</span>
        <span class="app-cal-year-num po-cal-year-num">${numYear}</span>
      </div>
    </div>

    <div class="app-cal-weekdays po-cal-weekdays">
      <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
    </div>

    <div class="app-cal-days-grid po-cal-days-grid">
      ${daysHtml}
    </div>

    <div class="app-cal-footer po-cal-footer">
      <div class="app-cal-footer-note po-cal-footer-note">
        Setting <b>${targetLabel}</b> · Year locked to <b>${numYear}</b>
      </div>
      <button type="button" class="app-cal-close-btn po-cal-close-btn" onclick="closeAppMonthDayPicker()">Close</button>
    </div>
  `;

  positionAppCalendar(appCalConfig.anchorEl);
}

function appCalPrevMonth(event) {
  if (event) event.stopPropagation();
  if (appCalViewingMonth > 0) {
    appCalViewingMonth--;
    renderAppMonthDayPicker();
  }
}

function appCalNextMonth(event) {
  if (event) event.stopPropagation();
  const curY = getCurrentYear();
  const yr = appCalConfig ? (typeof appCalConfig.selectedYear === 'function' ? appCalConfig.selectedYear() : appCalConfig.selectedYear) : curY;
  const numYear = parseInt(yr, 10) || curY;
  const curMonthIdx = new Date().getMonth();
  if (numYear === curY && appCalViewingMonth >= curMonthIdx) return;
  if (appCalViewingMonth < 11) {
    appCalViewingMonth++;
    renderAppMonthDayPicker();
  }
}

function appCalChangeMonth(val, event) {
  if (event) event.stopPropagation();
  const idx = parseInt(val, 10);
  if (!isNaN(idx) && idx >= 0 && idx <= 11) {
    appCalViewingMonth = idx;
    renderAppMonthDayPicker();
  }
}

function appCalPickDay(d, event) {
  if (event) event.stopPropagation();
  if (!appCalConfig) return;
  const curY = getCurrentYear();
  const yr = (typeof appCalConfig.selectedYear === 'function' ? appCalConfig.selectedYear() : appCalConfig.selectedYear) || curY;
  const numYear = parseInt(yr, 10) || curY;
  const m = appCalViewingMonth + 1;
  const iso = `${numYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const cb = appCalConfig.onSelect;
  closeAppMonthDayPicker();
  if (typeof cb === 'function') {
    cb(iso);
  }
}

function positionAppCalendar(anchorEl) {
  const popover = document.getElementById('app-calendar-popover') || document.getElementById('po-calendar-popover');
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

if (!window._appCalListenersAttached) {
  window._appCalListenersAttached = true;
  document.addEventListener('click', e => {
    if (!e.target.closest('#app-calendar-popover') && !e.target.closest('#po-calendar-popover') &&
        !e.target.closest('.app-monthday-picker-field') && !e.target.closest('.po-monthday-picker-field')) {
      closeAppMonthDayPicker();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeAppMonthDayPicker();
    }
  });

  window.addEventListener('resize', () => {
    closeAppMonthDayPicker();
  });

  window.addEventListener('scroll', e => {
    if (e.target && e.target.closest && (e.target.closest('#app-calendar-popover') || e.target.closest('#po-calendar-popover'))) {
      return;
    }
    closeAppMonthDayPicker();
  }, true);
}
function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}
function formatDateOnly(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
function formatDateShort(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}
function formatStock(n) {
  const num = Number(n);
  if (isNaN(num)) return '0';
  return num % 1 === 0 ? num.toString() : num.toFixed(2);
}
function formatLiters(n) {
  return formatStock(n) + ' L';
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str == null ? '' : str);
}

function getProductHex(product) {
  if (!product) return '';
  if (product.colorHex && /^#[0-9A-Fa-f]{6}$/i.test(product.colorHex)) {
    return product.colorHex;
  }
  if (typeof getProductDefaultColor === 'function') {
    return getProductDefaultColor(product);
  }
  if (product.color && product.color.startsWith('#') && (product.color.length === 4 || product.color.length === 7)) {
    return product.color;
  }
  return '#1F6F6B';
}

function generateReceiptNo() {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const seq = String((db && db.sales ? db.sales.length : 0) + 1).padStart(4, '0');
  return `OR-${dateStr}-${seq}`;
}

function getReceiptNo(sale) {
  if (!sale) return 'OR-0000';
  if (sale.receiptNo) return sale.receiptNo;
  const d = sale.date ? new Date(sale.date) : new Date();
  const dateStr = d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
  const idx = (db && db.sales ? db.sales : []).findIndex(s => s.id === sale.id);
  const seq = String(idx >= 0 ? idx + 1 : 1).padStart(4, '0');
  return `OR-${dateStr}-${seq}`;
}

function showToast(message, type) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  const icon = type === 'ok' ? '🎉' : (type === 'error' ? '⚠️' : 'ℹ️');
  el.innerHTML = `
<div style="display:flex; align-items:center; gap:8px;">
  <span style="font-size:16px;">${icon}</span>
  <span>${escapeHtml(message)}</span>
</div>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = 'all 0.22s ease';
    setTimeout(() => el.remove(), 220);
  }, 2800);
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', emoji: '☀️' };
  if (hour < 18) return { text: 'Good afternoon', emoji: '🌤️' };
  return { text: 'Good evening', emoji: '🌙' };
}

function formatHeaderDate(d) {
  const dateObj = (d instanceof Date && !isNaN(d)) ? d : new Date();
  return dateObj.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatHeaderTime(d) {
  const dateObj = (d instanceof Date && !isNaN(d)) ? d : new Date();
  return dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/* ============================================================
   2. SEED DATA
   ============================================================ */
function buildSeedData() {
  return {
    products: [],
    suppliers: [],
    users: [],
    sales: [],
    movements: [],
    purchaseOrders: [],
    adjustmentRequests: []
  };
}

/* ============================================================
   3. STORAGE — load and save to MySQL MRGR_ColorCenter
   ============================================================ */
/* Removes products sharing the same name + brand + color (size no longer distinguishes
   products). The first one is kept; references to removed ones are re-pointed to it.
   Returns true if anything was removed. */
function dedupeProducts() {
  if (!db || !Array.isArray(db.products)) return false;
  const norm = v => String(v || '').trim().toLowerCase();
  const keep = new Map();
  const remap = {};
  const unique = [];
  db.products.forEach(p => {
    const key = [p.name, p.brand, p.type, p.color].map(norm).join('|');
    if (keep.has(key)) {
      const mainId = keep.get(key);
      remap[p.id] = mainId;
      const mainProd = unique.find(x => x.id === mainId);
      if (mainProd) {
        if (p.canStock && typeof p.canStock === 'object' && !Array.isArray(p.canStock)) {
          if (!mainProd.canStock || typeof mainProd.canStock !== 'object' || Array.isArray(mainProd.canStock)) mainProd.canStock = {};
          Object.keys(p.canStock).forEach(sz => {
            mainProd.canStock[sz] = (Number(mainProd.canStock[sz]) || 0) + (Number(p.canStock[sz]) || 0);
          });
        }
        mainProd.stock = Number(((Number(mainProd.stock) || 0) + (Number(p.stock) || 0)).toFixed(2));
        mainProd.openedStock = Number(((Number(mainProd.openedStock) || 0) + (Number(p.openedStock) || 0)).toFixed(2));
        if (Array.isArray(p.sizes)) {
          mainProd.sizes = [...new Set([...(mainProd.sizes || []), ...p.sizes])];
        }
      }
    } else {
      keep.set(key, p.id);
      unique.push(p);
    }
  });
  if (!Object.keys(remap).length) return false;
  db.products = unique;
  db.deletedProductIds = [...new Set([...(db.deletedProductIds || []), ...Object.keys(remap)])];
  const fix = o => { if (o && remap[o.productId]) o.productId = remap[o.productId]; };
  (db.sales || []).forEach(s => (s.items || []).forEach(it => { fix(it); (it.components || []).forEach(fix); }));
  (db.movements || []).forEach(m => { fix(m); (m.lines || []).forEach(fix); });
  (db.purchaseOrders || []).forEach(po => (po.items || []).forEach(fix));
  (db.suppliers || []).forEach(s => {
    if (Array.isArray(s.productIds)) {
      s.productIds = [...new Set(s.productIds.map(id => remap[id] || id))];
    }
  });
  return true;
}

async function loadDB() {
  try {
    const res = await fetch('api/db.php');
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.db && ((Array.isArray(data.db.products) && data.db.products.length > 0) || (Array.isArray(data.db.users) && data.db.users.length > 0))) {
        db = data.db;
        let migratedDecimals = false;
        db.products = db.products
          .filter(p => (p.type || '').toLowerCase() !== 'accessory')
          .map(p => {
            const prodId = p.productId || p.product_id || p.id;
            const prodName = p.productName || p.product_name || p.name;
            const category = p.category || p.type;
            const supplierId = p.supplierId || p.supplier_id || null;
            const prod = {
              ...p,
              id: prodId,
              productId: prodId,
              product_id: prodId,
              name: prodName,
              productName: prodName,
              product_name: prodName,
              type: p.type || category,
              category: category,
              supplierId: supplierId,
              supplier_id: supplierId,
              status: p.status || 'active',
              stock: Number(p.stock) || 0,
              canStock: (p.canStock && !Array.isArray(p.canStock) && typeof p.canStock === 'object') ? p.canStock : {},
              openedStock: Number(p.openedStock) || 0,
              openedCanSize: Number(p.openedCanSize) || 0,
              sizes: Array.isArray(p.sizes) ? p.sizes : [],
              sizesData: Array.isArray(p.sizesData) ? p.sizesData : [],
              pendingSizes: Array.isArray(p.pendingSizes) ? p.pendingSizes : [],
              openedBySize: (p.openedBySize && !Array.isArray(p.openedBySize) && typeof p.openedBySize === 'object') ? p.openedBySize : null,
              threshold: Number(p.threshold) || 0,
              thresholdBySize: (p.thresholdBySize && typeof p.thresholdBySize === 'object' && !Array.isArray(p.thresholdBySize)) ? p.thresholdBySize : {},
              price: Number(p.price) || 0,
              recentPrice: (p.recentPrice !== undefined && p.recentPrice !== null && p.recentPrice !== '') ? Number(p.recentPrice) : ((p.recent_price !== undefined && p.recent_price !== null && p.recent_price !== '') ? Number(p.recent_price) : null),
              pendingPrice: (p.pendingPrice !== undefined && p.pendingPrice !== null && p.pendingPrice !== '') ? Number(p.pendingPrice) : null,
              pendingEdit: p.pendingEdit || null
            };
            if (typeof syncProductVariants === 'function') {
              syncProductVariants(prod);
            }
            if (typeof normalizeProductOpenedStock === 'function' && normalizeProductOpenedStock(prod)) {
              migratedDecimals = true;
            }
            if (typeof normalizeProductThresholds === 'function' && normalizeProductThresholds(prod)) {
              migratedDecimals = true;
            }
            return prod;
          });
        db.movements = (db.movements || []).map(movement => {
          const storedName = String(movement.productName || '').trim();
          if (storedName && storedName !== '0') return movement;
          const product = productById(movement.productId);
          return { ...movement, productName: product ? product.name : (movement.type === 'colormix' ? 'Color Mix' : 'Unknown product') };
        });
        if (!db.purchaseOrders) db.purchaseOrders = [];
        db.purchaseOrders = db.purchaseOrders.map(po => {
          let items = [];
          if (Array.isArray(po.items) && po.items.length > 0) {
            items = po.items;
          } else if (po.itemsJson) {
            try {
              items = typeof po.itemsJson === 'string' ? JSON.parse(po.itemsJson) : po.itemsJson;
              if (!Array.isArray(items)) items = [];
            } catch (e) {
              items = [];
            }
          }
          return {
            ...po,
            items,
            itemsJson: JSON.stringify(items)
          };
        });
        if (!Array.isArray(db.adjustmentRequests)) db.adjustmentRequests = [];
        storage.set(DB_KEY, JSON.stringify(db)); // cache locally
        if (dedupeProducts() || migratedDecimals) await saveDB();
        return;
      }
    }
  } catch (e) {
    console.warn('Could not fetch from MySQL api/db.php, using local cache', e);
  }

  // Fallback to local storage if offline/server error
  try {
    const val = await storage.get(DB_KEY);
    if (val) {
      db = JSON.parse(val);
      let migratedFallbackDecimals = false;
      if (Array.isArray(db.products)) {
        db.products = db.products
          .filter(p => (p.type || '').toLowerCase() !== 'accessory')
          .map(p => {
            const prod = {
              ...p,
              status: p.status || 'active',
              stock: Number(p.stock) || 0,
              canStock: (p.canStock && !Array.isArray(p.canStock) && typeof p.canStock === 'object') ? p.canStock : {},
              openedStock: Number(p.openedStock) || 0,
              openedCanSize: Number(p.openedCanSize) || 0,
              sizes: Array.isArray(p.sizes) ? p.sizes : [],
              pendingSizes: Array.isArray(p.pendingSizes) ? p.pendingSizes : [],
              openedBySize: (p.openedBySize && !Array.isArray(p.openedBySize) && typeof p.openedBySize === 'object') ? p.openedBySize : null,
              recentPrice: (p.recentPrice !== undefined && p.recentPrice !== null && p.recentPrice !== '') ? Number(p.recentPrice) : null,
              pendingPrice: (p.pendingPrice !== undefined && p.pendingPrice !== null && p.pendingPrice !== '') ? Number(p.pendingPrice) : null,
              pendingEdit: p.pendingEdit || null
            };
            if (typeof normalizeProductOpenedStock === 'function' && normalizeProductOpenedStock(prod)) {
              migratedFallbackDecimals = true;
            }
            return prod;
          });
      }
      db.movements = (db.movements || []).map(movement => {
        const storedName = String(movement.productName || '').trim();
        if (storedName && storedName !== '0') return movement;
        const product = productById(movement.productId);
        return { ...movement, productName: product ? product.name : (movement.type === 'colormix' ? 'Color Mix' : 'Unknown product') };
      });
      if (!db.purchaseOrders) db.purchaseOrders = [];
      db.purchaseOrders = db.purchaseOrders.map(po => {
        let items = [];
        if (Array.isArray(po.items) && po.items.length > 0) {
          items = po.items;
        } else if (po.itemsJson) {
          try {
            items = typeof po.itemsJson === 'string' ? JSON.parse(po.itemsJson) : po.itemsJson;
            if (!Array.isArray(items)) items = [];
          } catch (e) {
            items = [];
          }
        }
        return {
          ...po,
          items,
          itemsJson: JSON.stringify(items)
        };
      });
      if (!Array.isArray(db.adjustmentRequests)) db.adjustmentRequests = [];
      if (dedupeProducts() || migratedFallbackDecimals) await saveDB();
      return;
    }
  } catch (e) { /* nothing saved yet */ }
  db = buildSeedData();
  await saveDB();
}

async function saveDB() {
  // Sync all product variants & Product IDs before saving
  if (db && Array.isArray(db.products)) {
    db.products.forEach(p => {
      if (typeof syncProductVariants === 'function') {
        syncProductVariants(p);
      }
    });
  }

  // 1. Local storage cache
  try {
    await storage.set(DB_KEY, JSON.stringify(db));
  } catch (e) { }

  // 2. Persist to MySQL database MRGR_ColorCenter
  try {
    const res = await fetch('api/db.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        db,
        currentUser: (typeof currentUser !== 'undefined' && currentUser) ? { id: currentUser.id, role: currentUser.role, username: currentUser.username } : null
      })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || ('HTTP ' + res.status));
    }
    if (db.deletedProductIds && db.deletedProductIds.length) db.deletedProductIds = [];
  } catch (e) {
    console.error('Save to MySQL failed', e);
    showToast('Could not save to database — check connection.', 'error');
  }

  // 3. Keep module navigation notification badges fresh in real-time
  if (typeof updateNavBadges === 'function') {
    try { updateNavBadges(); } catch (e) { }
  }
}

/* ============================================================
   4. REUSABLE PAGINATION ENGINE (Client & Server-Side Support)
   ============================================================ */
const paginationRegistry = {};
const PAGINATION_PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_PAGINATION_SIZE = 10;

function getPaginationState(key, defaultPageSize = DEFAULT_PAGINATION_SIZE) {
  const safeKey = String(key || 'default');
  if (!paginationRegistry[safeKey]) {
    const validInitSize = PAGINATION_PAGE_SIZES.includes(Number(defaultPageSize))
      ? Number(defaultPageSize)
      : DEFAULT_PAGINATION_SIZE;
    paginationRegistry[safeKey] = {
      page: 1,
      pageSize: validInitSize,
      totalItems: 0,
      totalPages: 1,
      startRow: 0,
      endRow: 0,
      loading: false,
      isNavigating: false,
      onUpdate: null,
      scrollTarget: null,
      recordLabel: 'records'
    };
  }
  return paginationRegistry[safeKey];
}

function resetPaginationPage(key) {
  if (!key) return;
  if (Array.isArray(key)) {
    key.forEach(k => resetPaginationPage(k));
    return;
  }
  const state = getPaginationState(key);
  state.page = 1;
}

function resetPaginationByPrefix(prefix) {
  if (!prefix) return;
  Object.keys(paginationRegistry).forEach(k => {
    if (k.startsWith(prefix)) {
      paginationRegistry[k].page = 1;
    }
  });
}

function buildPaginationPageNumbers(currentPage, totalPages) {
  const total = Math.max(1, Number(totalPages) || 1);
  const current = Math.max(1, Math.min(Number(currentPage) || 1, total));
  if (total <= 7) {
    const pages = [];
    for (let i = 1; i <= total; i++) pages.push(i);
    return pages;
  }
  const pages = [1];
  if (current > 3) {
    pages.push('...');
  }
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  if (current < total - 2) {
    pages.push('...');
  }
  if (total > 1) {
    pages.push(total);
  }
  return pages;
}

function paginateArray(items, key, options = {}) {
  const arr = Array.isArray(items) ? items : [];
  const state = getPaginationState(key, options.defaultPageSize || DEFAULT_PAGINATION_SIZE);

  if (options.onUpdate !== undefined) state.onUpdate = options.onUpdate;
  if (options.scrollTarget !== undefined) state.scrollTarget = options.scrollTarget;
  if (options.recordLabel !== undefined) state.recordLabel = options.recordLabel;

  const totalItems = arr.length;
  const pageSize = PAGINATION_PAGE_SIZES.includes(Number(state.pageSize))
    ? Number(state.pageSize)
    : DEFAULT_PAGINATION_SIZE;
  state.pageSize = pageSize;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (state.page > totalPages) state.page = totalPages;
  if (state.page < 1) state.page = 1;

  const startIdx = totalItems === 0 ? 0 : (state.page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalItems);
  const pagedItems = arr.slice(startIdx, endIdx);

  state.totalItems = totalItems;
  state.totalPages = totalPages;
  state.startRow = totalItems === 0 ? 0 : startIdx + 1;
  state.endRow = endIdx;

  return {
    pagedItems,
    pageItems: pagedItems,
    items: pagedItems,
    page: state.page,
    pageSize: state.pageSize,
    totalItems,
    totalPages,
    startRow: state.startRow,
    endRow: state.endRow,
    html: renderPaginationControls(key, options)
  };
}

function renderPaginationControls(key, options = {}) {
  const safeKey = String(key || 'default');
  const state = getPaginationState(safeKey, options.defaultPageSize || DEFAULT_PAGINATION_SIZE);

  if (options.onUpdate !== undefined) state.onUpdate = options.onUpdate;
  if (options.scrollTarget !== undefined) state.scrollTarget = options.scrollTarget;
  if (options.recordLabel !== undefined) state.recordLabel = options.recordLabel;
  if (options.loading !== undefined) state.loading = Boolean(options.loading);
  if (options.totalItems !== undefined) state.totalItems = Math.max(0, Number(options.totalItems) || 0);
  if (options.pageSize !== undefined && PAGINATION_PAGE_SIZES.includes(Number(options.pageSize))) {
    state.pageSize = Number(options.pageSize);
  }
  if (options.page !== undefined) {
    state.page = Math.max(1, Number(options.page) || 1);
  }

  const totalItems = state.totalItems;
  const pageSize = state.pageSize;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (state.page > totalPages) state.page = totalPages;
  if (state.page < 1) state.page = 1;
  state.totalPages = totalPages;

  const startRow = totalItems === 0 ? 0 : (state.page - 1) * pageSize + 1;
  const endRow = Math.min(state.page * pageSize, totalItems);
  state.startRow = startRow;
  state.endRow = endRow;

  const label = state.recordLabel || 'records';
  const isFirstPage = state.page <= 1;
  const isLastPage = state.page >= totalPages;
  const disabledAttr = state.loading ? 'disabled' : '';

  const pageNums = buildPaginationPageNumbers(state.page, totalPages);
  const pageButtonsHtml = pageNums.map(p => {
    if (p === '...') {
      return '<span class="mrgr-page-ellipsis" aria-hidden="true">…</span>';
    }
    const isActive = p === state.page;
    return `<button type="button" class="mrgr-page-btn ${isActive ? 'active' : ''}" ${isActive ? 'aria-current="page"' : ''} ${disabledAttr} onclick="changeTablePage('${escapeAttr(safeKey)}', ${p})">${p}</button>`;
  }).join('');

  const sizeOptionsHtml = PAGINATION_PAGE_SIZES.map(sz =>
    `<option value="${sz}" ${sz === pageSize ? 'selected' : ''}>${sz} records</option>`
  ).join('');

  const showingHtml = totalItems === 0
    ? `Showing <strong>0</strong> of <strong>0</strong> ${escapeHtml(label)}`
    : `Showing <strong>${startRow.toLocaleString()}–${endRow.toLocaleString()}</strong> of <strong>${totalItems.toLocaleString()}</strong> ${escapeHtml(label)}`;

  return `
    <div class="mrgr-pagination ${state.loading ? 'is-loading' : ''}" data-pagination-key="${escapeAttr(safeKey)}">
      <div class="mrgr-pagination-left">
        <span class="mrgr-pagination-summary">${showingHtml}</span>
        <span class="mrgr-pagination-total-badge">Total: ${totalItems.toLocaleString()} ${escapeHtml(label)}</span>
        <label class="mrgr-pagination-size-wrap">
          <span>Rows per page:</span>
          <select class="mrgr-page-size-select" onchange="changeTablePageSize('${escapeAttr(safeKey)}', this.value)" ${disabledAttr} aria-label="Rows per page">
            ${sizeOptionsHtml}
          </select>
        </label>
      </div>
      <div class="mrgr-pagination-right">
        ${state.loading ? '<span class="mrgr-page-loading-spinner">Loading…</span>' : ''}
        <span class="mrgr-page-indicator">Page <strong>${state.page}</strong> of <strong>${totalPages}</strong></span>
        <div class="mrgr-page-nav" role="navigation" aria-label="Table Pagination">
          <button type="button" class="mrgr-page-btn nav-prev" onclick="changeTablePage('${escapeAttr(safeKey)}', ${state.page - 1})" ${isFirstPage || state.loading ? 'disabled' : ''}>‹ Previous</button>
          ${pageButtonsHtml}
          <button type="button" class="mrgr-page-btn nav-next" onclick="changeTablePage('${escapeAttr(safeKey)}', ${state.page + 1})" ${isLastPage || state.loading ? 'disabled' : ''}>Next ›</button>
        </div>
      </div>
    </div>
  `;
}

function scrollTableToTop(scrollTarget, key) {
  try {
    let targetEl = null;
    if (scrollTarget) {
      targetEl = typeof scrollTarget === 'string' ? document.querySelector(scrollTarget) : scrollTarget;
    }
    if (!targetEl && key) {
      const pagEl = document.querySelector(`.mrgr-pagination[data-pagination-key="${key}"]`);
      if (pagEl) {
        targetEl = pagEl.closest('.panel, .audit-table-wrap, .po-table-panel, .rep-section-card') || pagEl.parentElement;
      }
    }
    if (!targetEl) return;

    // 1. Reset any internal vertical scroll on table wrappers inside or on the target
    if (targetEl.scrollTop > 0) targetEl.scrollTop = 0;
    const innerScrolls = targetEl.querySelectorAll('.table-scroll, .audit-table-wrap');
    innerScrolls.forEach(el => {
      if (el.scrollTop > 0) el.scrollTop = 0;
    });

    // 2. Scroll the containing table/panel into view only if its top is scrolled out of view
    const rect = targetEl.getBoundingClientRect();
    const headerOffset = 76; // Sticky topbar buffer
    if (rect.top < headerOffset || rect.top > window.innerHeight * 0.75) {
      const targetTop = window.pageYOffset + rect.top - headerOffset;
      window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth'
      });
    }
  } catch (e) {
    // Ignore scroll errors on detached DOM
  }
}

function triggerPaginationUpdate(key) {
  const state = getPaginationState(key);
  state.isNavigating = true;

  let result;
  try {
    if (typeof state.onUpdate === 'function') {
      result = state.onUpdate(state.page, state.pageSize);
    } else if (typeof state.onUpdate === 'string' && typeof window[state.onUpdate] === 'function') {
      result = window[state.onUpdate](state.page, state.pageSize);
    } else if (typeof renderMain === 'function') {
      result = renderMain();
    }
  } catch (err) {
    console.error('Pagination update error for', key, err);
  }

  const finalize = () => {
    requestAnimationFrame(() => {
      scrollTableToTop(state.scrollTarget, key);
      state.isNavigating = false;
    });
  };

  if (result && typeof result.then === 'function') {
    result.then(finalize).catch(finalize);
  } else {
    finalize();
  }
}

function changeTablePage(key, newPage) {
  const state = getPaginationState(key);
  if (state.loading || state.isNavigating) return;
  const targetPage = Math.max(1, Math.min(Number(newPage) || 1, state.totalPages || 1));
  if (targetPage === state.page) return;
  state.page = targetPage;
  triggerPaginationUpdate(key);
}

function changeTablePageSize(key, newSize) {
  const state = getPaginationState(key);
  if (state.loading || state.isNavigating) return;
  const parsed = Number(newSize);
  const validSize = PAGINATION_PAGE_SIZES.includes(parsed) ? parsed : DEFAULT_PAGINATION_SIZE;
  if (validSize === state.pageSize) return;
  state.pageSize = validSize;
  state.page = 1;
  triggerPaginationUpdate(key);
}

