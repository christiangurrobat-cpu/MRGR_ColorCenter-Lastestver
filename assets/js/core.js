/* ============================================================
   1. DATA & STORAGE ADAPTER
   ============================================================ */
const DB_KEY = 'mrgr_color_center_db';
const SESSION_KEY = 'mrgr_color_center_session';
let db = null;          // the whole "database" object
let currentUser = null; // who is logged in right now
let currentPage = null; // which screen we are on, e.g. 'dashboard', 'pos'
let cart = [];          // items being built up in the current POS sale
let posCashTendered = 0;
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

function getProductHex(product) {
  if (!product) return '';
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
              threshold: Number(p.threshold) || 0,
              thresholdBySize: (p.thresholdBySize && typeof p.thresholdBySize === 'object' && !Array.isArray(p.thresholdBySize)) ? p.thresholdBySize : {},
              price: Number(p.price) || 0,
              recentPrice: (p.recentPrice !== undefined && p.recentPrice !== null && p.recentPrice !== '') ? Number(p.recentPrice) : ((p.recent_price !== undefined && p.recent_price !== null && p.recent_price !== '') ? Number(p.recent_price) : null),
              pendingPrice: (p.pendingPrice !== undefined && p.pendingPrice !== null && p.pendingPrice !== '') ? Number(p.pendingPrice) : null,
              pendingEdit: p.pendingEdit || null
            };
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
  // 1. Local storage cache
  try {
    await storage.set(DB_KEY, JSON.stringify(db));
  } catch (e) { }

  // 2. Persist to MySQL database MRGR_ColorCenter
  try {
    const res = await fetch('api/db.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ db })
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
