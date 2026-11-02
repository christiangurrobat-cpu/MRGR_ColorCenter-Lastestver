/* ============================================================
   4. NAVIGATION per role
   ============================================================ */
function navItemsFor(role) {
  if (role === 'admin') return [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'approvals', label: 'Pending Approvals', icon: '⏳' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
    { id: 'alerts', label: 'Low-Stock Alerts', icon: '⚠️' },
    { id: 'purchaseOrders', label: 'Purchase Orders', icon: '📋' },
    { id: 'suppliers', label: 'Suppliers', icon: '👥' },
    { id: 'reports', label: 'Reports', icon: '📈' },
    { id: 'auditLog', label: 'Audit Log', icon: '🧾' },
    { id: 'users', label: 'Staff & Users', icon: '👤' },
  ];
  if (role === 'cashier') return [
    { id: 'pos', label: 'Point of Sale', icon: '🛒' },
    { id: 'inventory', label: 'Inventory (view)', icon: '📦' },
    { id: 'sales', label: 'Sales History', icon: '🧾' },
  ];
  return [ // staff
    { id: 'staffDashboard', label: 'Dashboard', icon: '📊' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
    { id: 'alerts', label: 'Low-Stock Alerts', icon: '⚠️' },
    { id: 'purchaseOrders', label: 'Purchase Orders', icon: '📋' },
    { id: 'receiving', label: 'Stock Receiving / Adjust', icon: '📥' },
    { id: 'suppliersView', label: 'Supplier Directory', icon: '👥' },
    { id: 'reports', label: 'Reports', icon: '📈' },
  ];
}
function defaultPageFor(role) {
  if (role === 'admin') return 'dashboard';
  if (role === 'cashier') return 'pos';
  return 'staffDashboard';
}

/* ============================================================
   4.1 MODULE NOTIFICATION BADGES ("kulay pula ang bilog")
   ============================================================ */
function getModuleNotificationCount(moduleId, role) {
  if (!db) return 0;
  const currentRole = role || (currentUser ? currentUser.role : 'admin');

  switch (moduleId) {
    case 'approvals': {
      if (typeof getTotalPendingApprovalsCount === 'function') {
        return getTotalPendingApprovalsCount();
      }
      let total = 0;
      if (typeof pendingAdjRequests === 'function') {
        total += pendingAdjRequests().length;
      } else {
        total += (db.adjustmentRequests || []).filter(r => r.status === 'pending').length;
      }
      total += (db.products || []).filter(p => 
        p.status === 'pending_approval' || 
        Boolean(p.pendingEdit) || 
        (p.pendingSizes && p.pendingSizes.length > 0) || 
        (p.pendingPrice != null && Number(p.pendingPrice) > 0)
      ).length;
      total += (db.purchaseOrders || []).filter(o => o.status === 'pending').length;
      return total;
    }

    case 'alerts': {
      if (typeof lowStockProducts === 'function') {
        return lowStockProducts().length;
      }
      return (db.products || []).filter(p => p.status === 'active' && Number(p.stock) <= Number(p.threshold || 5)).length;
    }

    case 'receiving': {
      if (currentRole === 'admin') return 0;
      let openPOCount = 0;
      if (typeof openPOsForReceiving === 'function') {
        openPOCount = openPOsForReceiving().length;
      } else {
        openPOCount = (db.purchaseOrders || []).filter(o => o.status === 'ordered' || o.status === 'partial').length;
      }

      let pendingAdjCount = 0;
      if (typeof pendingAdjRequests === 'function') {
        pendingAdjCount = pendingAdjRequests().length;
      } else {
        pendingAdjCount = (db.adjustmentRequests || []).filter(r => r.status === 'pending').length;
      }
      return openPOCount + pendingAdjCount;
    }

    case 'purchaseOrders': {
      const pendingPOs = (db.purchaseOrders || []).filter(o => o.status === 'pending');
      const openPOs = (db.purchaseOrders || []).filter(o => o.status === 'ordered' || o.status === 'partial');
      if (currentRole === 'admin') {
        return pendingPOs.length > 0 ? pendingPOs.length : openPOs.length;
      }
      return openPOs.length > 0 ? openPOs.length : pendingPOs.length;
    }

    case 'inventory': {
      const pendingInv = (db.products || []).filter(p => 
        p.status === 'pending_approval' || 
        Boolean(p.pendingEdit) || 
        (p.pendingSizes && p.pendingSizes.length > 0) || 
        (p.pendingPrice != null && Number(p.pendingPrice) > 0)
      );
      if (pendingInv.length > 0) return pendingInv.length;
      const zeroStock = (db.products || []).filter(p => p.status === 'active' && Number(p.stock) <= 0);
      return zeroStock.length;
    }

    case 'suppliers':
    case 'suppliersView': {
      // Supplier is a directory / masterlist; no notification badge needed
      return 0;
    }

    case 'reports': {
      // Reports is an analytics / viewer module; no notification badge needed
      return 0;
    }

    case 'auditLog': {
      const todayIso = typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10);
      const todayLogs = (db.auditLog || []).filter(a => {
        const d = a.timestamp || a.date || '';
        return d.slice(0, 10) === todayIso;
      });
      return todayLogs.length;
    }

    case 'users': {
      const inactive = (db.users || []).filter(u => u.status !== 'active');
      return inactive.length;
    }

    case 'pos': {
      if (typeof cart !== 'undefined' && Array.isArray(cart) && cart.length > 0) {
        return cart.reduce((sum, it) => sum + (Number(it.qty) || 1), 0);
      }
      return 0;
    }

    case 'sales': {
      const todayIso = typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10);
      const todaySales = (db.sales || []).filter(s => (s.date || '').slice(0, 10) === todayIso);
      return todaySales.length;
    }

    case 'dashboard':
    case 'staffDashboard': {
      let total = 0;
      const lowProducts = typeof lowStockProducts === 'function'
        ? lowStockProducts()
        : (db.products || []).filter(p => p.status === 'active' && Number(p.stock) <= Number(p.threshold || 5));
      total += lowProducts.length;

      const pendingInv = (db.products || []).filter(p => 
        p.status === 'pending_approval' || 
        Boolean(p.pendingEdit) || 
        (p.pendingSizes && p.pendingSizes.length > 0) || 
        (p.pendingPrice != null && Number(p.pendingPrice) > 0)
      );
      total += pendingInv.length;

      const pendingPOs = (db.purchaseOrders || []).filter(o => o.status === 'pending');
      total += pendingPOs.length;

      let pendingAdjCount = 0;
      if (typeof pendingAdjRequests === 'function') {
        pendingAdjCount = pendingAdjRequests().length;
      } else {
        pendingAdjCount = (db.adjustmentRequests || []).filter(r => r.status === 'pending').length;
      }
      total += pendingAdjCount;

      return total;
    }

    default:
      return 0;
  }
}

function getModuleBadgeHtml(moduleId, role) {
  const count = getModuleNotificationCount(moduleId, role);
  if (!count || count <= 0) return '';
  const displayCount = count > 99 ? '99+' : count;
  return `<span class="nav-badge" style="margin-left:6px; vertical-align:middle;" title="${count} notification${count === 1 ? '' : 's'}">${displayCount}</span>`;
}

function updateNavBadges() {
  if (typeof currentUser === 'undefined' || !currentUser) return;
  const items = navItemsFor(currentUser.role);
  items.forEach(it => {
    const el = document.getElementById(`nav-badge-${it.id}`);
    const count = getModuleNotificationCount(it.id, currentUser.role);
    if (el) {
      if (count > 0) {
        el.textContent = count > 99 ? '99+' : count;
        el.style.display = 'inline-flex';
        el.classList.remove('hidden');
        el.title = `${count} notification${count === 1 ? '' : 's'}`;
      } else {
        el.style.display = 'none';
        el.classList.add('hidden');
        el.textContent = '';
      }
    }
  });

  // Update tabs inside Stock Receiving if present
  const rcvTabBadge = document.getElementById('rcv-tab-badge-pos');
  if (rcvTabBadge && typeof openPOsForReceiving === 'function') {
    const openCount = openPOsForReceiving().length;
    if (openCount > 0) {
      rcvTabBadge.textContent = openCount;
      rcvTabBadge.style.display = 'inline-flex';
    } else {
      rcvTabBadge.style.display = 'none';
    }
  }

  const adjTabBadge = document.getElementById('rcv-tab-badge-adj');
  if (adjTabBadge && typeof pendingAdjRequests === 'function') {
    const adjCount = pendingAdjRequests().length;
    if (adjCount > 0) {
      adjTabBadge.textContent = adjCount;
      adjTabBadge.style.display = 'inline-flex';
    } else {
      adjTabBadge.style.display = 'none';
    }
  }
}

/* ============================================================
   5. RENDER — top level
   ============================================================ */
let liveClockInterval = null;

function updateLiveClock() {
  const clockEl = document.getElementById('topbar-clock');
  if (!clockEl) return;
  const now = new Date();
  clockEl.textContent = formatHeaderTime(now);

  const greetingEl = document.getElementById('topbar-greeting');
  if (greetingEl) {
    const g = getGreeting();
    const gText = `${g.emoji} ${g.text}`;
    if (greetingEl.textContent !== gText) {
      greetingEl.textContent = gText;
    }
  }

  const dateEl = document.getElementById('topbar-date');
  if (dateEl) {
    const dText = formatHeaderDate(now);
    if (dateEl.textContent !== dText) {
      dateEl.textContent = dText;
    }
  }
}

function startLiveClock() {
  if (liveClockInterval) clearInterval(liveClockInterval);
  updateLiveClock();
  liveClockInterval = setInterval(updateLiveClock, 1000);
}

function stopLiveClock() {
  if (liveClockInterval) {
    clearInterval(liveClockInterval);
    liveClockInterval = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && typeof currentUser !== 'undefined' && currentUser) {
    updateLiveClock();
  }
});

function renderApp() {
  const app = document.getElementById('app');
  if (!currentUser) {
    stopLiveClock();
    app.innerHTML = loginScreen();
    return;
  }
  app.innerHTML = shell();
  renderPage();
  updateNavBadges();
  startLiveClock();
}

function shell() {
  const items = navItemsFor(currentUser.role);
  const navHtml = items.map(it => {
    const count = getModuleNotificationCount(it.id, currentUser.role);
    const isVisible = count > 0;
    const displayCount = count > 99 ? '99+' : count;
    return `
<button class="nav-item ${currentPage === it.id ? 'active' : ''}" onclick="goTo('${it.id}')" title="${it.label}">
  <span style="font-size:14px; opacity:0.85;">${it.icon || '•'}</span>
  <span class="nav-label">${it.label}</span>
  <span id="nav-badge-${it.id}" class="nav-badge ${isVisible ? '' : 'hidden'}" style="${isVisible ? 'display:inline-flex;' : 'display:none;'}" title="${count} notification${count === 1 ? '' : 's'}">${displayCount}</span>
</button>`;
  }).join('');

  const roleLabel = { admin: 'Administrator', cashier: 'Cashier', staff: 'Inventory Staff' }[currentUser.role];
  const userInitial = (currentUser.name || 'U').charAt(0).toUpperCase();
  const greeting = getGreeting();
  const now = new Date();

  return `
  <div class="shell">
<div class="sidebar">
  <div class="brand">
    <div class="swatch-strip"><span class="swatch sw-teal"></span><span class="swatch sw-orange"></span><span class="swatch sw-mustard"></span></div>
    <div class="brand-text">MRGR<br><small>COLOR CENTER</small></div>
  </div>
  <div class="nav-list">${navHtml}</div>
  <div style="padding-top:14px; border-top:1px solid #3a352e; margin-top:auto;">
    <div style="font-size:11px; color:#8E8578; display:flex; align-items:center; gap:6px;">
      <span style="width:7px; height:7px; border-radius:50%; background:#4ade80; display:inline-block;"></span>
      <span>System Online · v2.5</span>
    </div>
  </div>
</div>
<div class="main">
  <div class="topbar">
    <div>
      <h1 id="page-title" style="margin:0;">MRGR Color Center</h1>
      <div class="date" id="topbar-datetime" style="margin-top:2px;">
        <span id="topbar-greeting">${greeting.emoji} ${greeting.text}</span>
        <span style="margin:0 6px;">·</span>
        <span id="topbar-date">${formatHeaderDate(now)}</span>
        <span style="margin:0 6px;">·</span>
        <span id="topbar-clock" class="topbar-clock" style="font-variant-numeric:tabular-nums; font-feature-settings:'tnum'; font-weight:600; color:var(--ink);" title="Live Time">${formatHeaderTime(now)}</span>
      </div>
    </div>
    <div class="topbar-actions">
      <div class="user-badge-wrap">
        <div class="user-avatar">${userInitial}</div>
        <div class="user-badge-info">
          <div class="who">${escapeHtml(currentUser.name)}</div>
          <div class="role">${roleLabel}</div>
        </div>
      </div>
      <button class="btn secondary small" onclick="logout()" title="Sign out of account">Log out</button>
    </div>
  </div>
  <div class="content" id="page-content"></div>
</div>
  </div>`;
}

const PAGE_TITLES = {
  dashboard: 'Dashboard', approvals: 'Pending Approvals Hub', pos: 'Point of Sale', products: 'Product Maintenance', inventory: 'Inventory',
  sales: 'Sales History', reports: 'Reports', suppliers: 'Supplier Management', users: 'User Management', auditLog: 'Audit Log',
  staffDashboard: 'Dashboard', receiving: 'Stock Receiving / Adjustments', suppliersView: 'Supplier Directory', alerts: 'Low-Stock Alerts',
  purchaseOrders: 'Purchase Orders',
};

function goTo(page) {
  if (currentUser && currentUser.role === 'admin' && page === 'receiving') {
    page = 'approvals';
  }
  currentPage = page;
  renderApp();
}

function renderPage() {
  document.getElementById('page-title').textContent = PAGE_TITLES[currentPage] || 'MRGR Color Center';
  const target = document.getElementById('page-content');
  const renderers = {
    dashboard: adminDashboard, approvals: (typeof approvalsPage === 'function' ? approvalsPage : adminDashboard), pos: posPage, products: productsPage, inventory: inventoryPage,
    sales: salesHistoryPage, reports: reportsPage, suppliers: suppliersPage, users: usersPage, auditLog: auditLogPage,
    staffDashboard: staffDashboard, receiving: receivingPage, suppliersView: suppliersViewPage, alerts: alertsPage,
    purchaseOrders: purchaseOrdersPage,
  };
  const fn = renderers[currentPage] || adminDashboard;
  target.innerHTML = fn();
  if (currentPage === 'pos') renderPosProductList();
  if (currentPage === 'purchaseOrders') initPOPage();
  if (typeof updateNavBadges === 'function') updateNavBadges();
}

/* ============================================================
   6. LOGIN
   ============================================================ */
function loginScreen() {
  return `
  <div class="login-wrap">
<div class="login-side">
  <div class="brand-mark">
    <div class="swatch-strip"><span class="swatch sw-teal"></span><span class="swatch sw-orange"></span><span class="swatch sw-mustard"></span><span class="swatch sw-sage"></span></div>
    <div class="brand-name">MRGR COLOR CENTER</div>
  </div>
  <div>
    <h1>Every color, every can, accounted for.</h1>
    <p class="tagline">Sales and inventory, without the logbook. Track stock, ring up sales, and compose custom paint mixing jobs from one simple system.</p>
  </div>
  <div class="chip-wall">
    <div class="chip" style="background:#C1443D"></div>
    <div class="chip" style="background:#1F6F6B"></div>
    <div class="chip" style="background:#D9A441"></div>
    <div class="chip" style="background:#74936B"></div>
    <div class="chip" style="background:#3E5C8A"></div>
    <div class="chip" style="background:#E7DFD3"></div>
    <div class="chip" style="background:#8A5A24"></div>
    <div class="chip" style="background:#2B2420"></div>
  </div>
</div>
<div class="login-form-side">
  <div class="login-card">
    <h2>Sign in</h2>
    <p class="muted small" style="margin-bottom:18px;">Use your MRGR staff account to continue.</p>
    <div id="login-error-slot"></div>
    <form onsubmit="return handleLogin(event)">
      <div class="field">
        <label for="li-username">Username</label>
        <input id="li-username" type="text" autocomplete="username" required>
      </div>
      <div class="field">
        <label for="li-password">Password</label>
        <input id="li-password" type="password" autocomplete="current-password" required>
      </div>
      <button class="btn block" type="submit">Log in</button>
    </form>
  </div>
</div>
  </div>`;
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('li-username').value.trim();
  const password = document.getElementById('li-password').value;
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  const errorSlot = document.getElementById('login-error-slot');
  if (!user) {
    errorSlot.innerHTML = `<div class="login-error">Incorrect username or password.</div>`;
    return false;
  }
  if (user.status !== 'active') {
    errorSlot.innerHTML = `<div class="login-error">This account has been deactivated. Contact the administrator.</div>`;
    return false;
  }
  currentUser = user;
  logAudit('LOGIN', 'Session', 'Signed in');
  currentPage = defaultPageFor(user.role);
  cart = [];
  await storage.set(SESSION_KEY, JSON.stringify({ userId: user.id }));
  renderApp();
  return false;
}

function logout() {
  logAudit('LOGOUT', 'Session', 'Signed out');
  stopLiveClock();
  currentUser = null;
  currentPage = null;
  cart = [];
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { }
  renderApp();
}

/* ============================================================
   7. SHARED DATA HELPERS
   ============================================================ */
function activeProducts() { return db.products.filter(p => p.status === 'active'); }
/* Returns the low-stock threshold in cans for a specific can size of a product */
function productSizeThreshold(p, size) {
  const s = normalizeCanSize(size);
  if (!p || !s) return 0;
  const map = (p.thresholdBySize && typeof p.thresholdBySize === 'object' && !Array.isArray(p.thresholdBySize)) ? p.thresholdBySize : null;
  if (map && map[s] !== undefined && map[s] !== null && map[s] !== '') {
    const v = Number(map[s]);
    return isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  }
  // Fallback defaults if thresholdBySize has not been set for this size:
  const overall = Number(p.threshold) || 5;
  if (s >= 16) return Math.max(1, Math.round(overall / 16)) || 1;
  if (s >= 4) return Math.max(2, Math.round(overall / 4)) || 2;
  return Math.max(5, Math.round(overall / s)) || 5;
}

/* Status for a single can size: 'out' (0 cans), 'low' (<= threshold), 'ok' (> threshold) */
function productSizeStatus(p, size) {
  const s = normalizeCanSize(size);
  const count = productCanCount(p, s);
  const thresh = productSizeThreshold(p, s);
  if (count <= 0) return 'out';
  if (count <= thresh) return 'low';
  return 'ok';
}

/* Returns the list of sizes for product `p` that are low or out of stock */
function productLowSizes(p) {
  if (!p) return [];
  return productSizes(p).filter(s => {
    const st = productSizeStatus(p, s);
    return st === 'low' || st === 'out';
  });
}

/* Compact string describing low/out sizes, e.g. "1L: 0/5 cans (Out) · 4L: 1/2 cans (Low)" */
function productLowSizesSummary(p) {
  const lowSizes = productLowSizes(p);
  if (!lowSizes.length) return '';
  return lowSizes.map(s => {
    const count = productCanCount(p, s);
    const thresh = productSizeThreshold(p, s);
    return `${fmtSize(s)}: ${count}/${thresh} cans (${count === 0 ? 'Out' : 'Low'})`;
  }).join(' · ');
}

/* Returns the sum of (threshold * size) in liters across all sizes of product `p` */
function productTotalThresholdLiters(p) {
  if (!p) return 0;
  return Number(productSizes(p).reduce((sum, s) => sum + (productSizeThreshold(p, s) * s), 0).toFixed(2));
}

/* Formats clear, easy-to-read threshold chips/badges for each can size (kada liter) */
function productSizeThresholdBadgesHtml(p, options = {}) {
  const sizes = productSizes(p);
  if (!sizes.length) return '<span class="muted small">No sizes</span>';
  return sizes.map(s => {
    const thresh = productSizeThreshold(p, s);
    const count = productCanCount(p, s);
    const st = productSizeStatus(p, s);
    const canWord = thresh === 1 ? 'can' : 'cans';
    const liters = formatLiters(thresh * s);

    let bg = '#F7F4EE';
    let border = '#E7DFD0';
    let color = 'var(--ink)';
    let statusLabel = '';

    if (options.highlightStatus !== false) {
      if (st === 'out') {
        bg = '#FDE8E8';
        border = '#F8B4B4';
        color = '#9B1C1C';
        statusLabel = ' · Out';
      } else if (st === 'low') {
        bg = '#FEF3C7';
        border = '#FCD34D';
        color = '#92400E';
        statusLabel = ' · Low';
      }
    }

    const title = `${fmtSize(s)}: Minimum threshold is ${thresh} ${canWord} (${liters})${st !== 'ok' ? ' — Stock currently ' + st.toUpperCase() + ' (' + count + ' ' + (count === 1 ? 'can' : 'cans') + ' available)' : ' — Stock healthy (' + count + ' ' + (count === 1 ? 'can' : 'cans') + ' available)'}`;

    return `<span style="display:inline-flex; align-items:center; gap:3px; padding:2px 6px; background:${bg}; border:1px solid ${border}; border-radius:4px; font-size:11px; font-weight:600; color:${color}; font-family:'Space Grotesk',sans-serif; white-space:nowrap; line-height:1.3;" title="${escapeHtml(title)}">
      <span>${fmtSize(s)}:</span> <span style="font-weight:700;">${thresh} ${canWord}</span> <span style="font-size:10px; opacity:0.8; font-weight:400;">(${liters})</span>${statusLabel ? `<span style="font-size:10px; font-weight:700;">${statusLabel}</span>` : ''}
    </span>`;
  }).join('');
}

/* Renders the Threshold table cell with accurate total liters and clearly formatted per-liter can thresholds */
function productThresholdCellHtml(p) {
  const totalLiters = productTotalThresholdLiters(p) || Number(p.threshold) || 0;
  return `
    <div style="font-weight:700; font-size:13.5px; color:var(--ink); line-height:1.2;">
      ${formatLiters(totalLiters)} <span style="font-size:11px; font-weight:500; color:var(--ink-soft);">(Total)</span>
    </div>
    <div style="display:flex; flex-wrap:wrap; justify-content:flex-end; gap:3px; margin-top:4px; max-width:280px; margin-left:auto;">
      ${productSizeThresholdBadgesHtml(p)}
    </div>
  `;
}

/* A product has low stock if ANY size is at or below its separate threshold, or if stock is depleted.
   For products without per-size canStock tracking, fallback to total stock <= threshold */
function productHasLowStock(p) {
  if (!p) return false;
  if (Number(p.stock) <= 0) return true;
  const lowSizes = productLowSizes(p);
  if (lowSizes.length > 0) return true;
  if (!p.canStock || typeof p.canStock !== 'object') {
    return Number(p.stock) <= Number(p.threshold || 0);
  }
  return false;
}

function lowStockProducts() { return activeProducts().filter(p => productHasLowStock(p)); }
/* Default can sizes (liters). Every product can define its OWN list of sizes in `p.sizes` (e.g. [0.5, 1, 3.5, 20]);
   products without one fall back to these defaults. */
const CAN_SIZES = [1, 4, 16];

function normalizeCanSize(n) {
  const v = Number(Number(n).toFixed(2));
  return (isFinite(v) && v > 0) ? v : 0;
}

function sanitizeSizeList(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach(x => {
    const v = normalizeCanSize(x);
    if (v && !out.includes(v)) out.push(v);
  });
  return out.sort((a, b) => a - b);
}

/* Sizes (liters) of ONE product, ascending. Always includes any size that currently holds sealed or opened stock. */
function productSizes(p) {
  let base = sanitizeSizeList(p && p.sizes);
  if (!base.length) base = CAN_SIZES.slice();
  const extra = [];
  const c = p && p.canStock && !Array.isArray(p.canStock) && typeof p.canStock === 'object' ? p.canStock : {};
  Object.keys(c).forEach(k => { if ((Number(c[k]) || 0) > 0) extra.push(k); });
  const o = p && p.openedBySize && !Array.isArray(p.openedBySize) && typeof p.openedBySize === 'object' ? p.openedBySize : {};
  Object.keys(o).forEach(k => { if ((Number(o[k]) || 0) > 0) extra.push(k); });
  return sanitizeSizeList(base.concat(extra));
}

function productHasSize(p, size) {
  return productSizes(p).includes(normalizeCanSize(size));
}

/* "1L", "0.5L", "3.5L" */
function fmtSize(s) {
  return `${Number(Number(s).toFixed(2))}L`;
}

/* Smallest size >= liters (falls back to the largest size) */
function bestFitSize(sizes, liters) {
  const asc = sanitizeSizeList(sizes);
  if (!asc.length) return 0;
  return asc.find(s => s >= liters - 1e-9) || asc[asc.length - 1];
}

function productCanCount(p, size) {
  const c = p && p.canStock && !Array.isArray(p.canStock) && typeof p.canStock === 'object' ? p.canStock : {};
  return Math.max(0, Math.floor(Number(c[size]) || 0));
}

function productHasCanBreakdown(p) {
  return productSizes(p).some(s => productCanCount(p, s) > 0);
}

function canBreakdownLiters(p) {
  return Number(productSizes(p).reduce((sum, s) => sum + productCanCount(p, s) * s, 0).toFixed(2));
}

/* Opened / Used Stock is tracked PER CAN SIZE: p.openedBySize = { "<size>": liters, ... } (sizes come from productSizes(p)).
   Each size keeps its own leftover pool (leftover from an opened small can is NOT mixed with an opened larger can).
   p.openedStock (total liters) and p.openedCanSize (largest size that has leftover) are kept in sync for legacy callers. */
function productOpenedBySizeMap(p) {
  return (p && p.openedBySize && !Array.isArray(p.openedBySize) && typeof p.openedBySize === 'object') ? p.openedBySize : null;
}

/* Opened / Used leftover liters for ONE can size */
function productOpenedLiters(p, size) {
  const m = productOpenedBySizeMap(p);
  if (!m) return 0;
  return Math.max(0, Number((Number(m[size]) || 0).toFixed(2)));
}

/* Opened / Used Stock (Liters) leftover from opening sealed cans during Color Mixing (all sizes combined) */
function productOpenedStock(p) {
  if (!p) return 0;
  if (!productOpenedBySizeMap(p)) return Math.max(0, Number((Number(p.openedStock) || 0).toFixed(2)));
  const map = productOpenedBySizeMap(p) || {};
  const allSizes = Array.from(new Set([...productSizes(p), ...Object.keys(map).map(Number)]));
  return Math.max(0, Number(allSizes.reduce((sum, s) => sum + productOpenedLiters(p, s), 0).toFixed(2)));
}

/* Returns how many liters have been used out of the opened can(s) of the given size */
function productUsedFromOpenedCan(p, size) {
  if (size === undefined || size === null) {
    const map = productOpenedBySizeMap(p) || {};
    const allSizes = Array.from(new Set([...productSizes(p), ...Object.keys(map).map(Number)]));
    return Number(allSizes.reduce((sum, s) => sum + productUsedFromOpenedCan(p, s), 0).toFixed(2));
  }
  const left = productOpenedLiters(p, size);
  if (left <= 0) return 0;
  const cans = Math.ceil(left / size - 1e-9);
  return Math.max(0, Number((cans * size - left).toFixed(2)));
}

/* One entry per can size that currently has opened leftover: [{ size, left, used }] */
function productOpenedEntries(p) {
  if (!p) return [];
  const map = productOpenedBySizeMap(p) || {};
  const allSizes = Array.from(new Set([...productSizes(p), ...Object.keys(map).map(Number)])).sort((a, b) => a - b);
  return allSizes
    .map(s => ({ size: s, left: productOpenedLiters(p, s), used: productUsedFromOpenedCan(p, s) }))
    .filter(e => e.left > 0);
}

/* Compact per-size text, e.g. "0.20L (1L can) · 1.25L (4L can)" */
function productOpenedSizesLabel(p, withCan = true) {
  return productOpenedEntries(p).map(e => `${formatStock(e.left)}L (${fmtSize(e.size)}${withCan ? ' can' : ''})`).join(' · ');
}

/* Largest can size that currently holds opened leftover (0 when nothing is opened). Prefer productOpenedEntries() for display. */
function productOpenedCanSize(p) {
  const entries = productOpenedEntries(p);
  return entries.length ? entries[entries.length - 1].size : 0;
}

function guessOpenedCanSize(liters, storedSize, p) {
  const sizes = productSizes(p);
  const stored = normalizeCanSize(storedSize);
  if (stored && sizes.includes(stored) && stored >= liters) return stored;
  return bestFitSize(sizes, liters) || 1;
}

/* Keeps the legacy aggregate fields (openedStock / openedCanSize) in sync with openedBySize */
function syncProductOpenedTotals(p) {
  if (!p) return false;
  let changed = false;
  const total = productOpenedStock(p);
  const size = productOpenedCanSize(p);
  if (Number(p.openedStock) !== total) { p.openedStock = total; changed = true; }
  if ((Number(p.openedCanSize) || 0) !== size) { p.openedCanSize = size; changed = true; }
  return changed;
}

/* Replaces all per-size opened pools. `map` = { <size>: liters, ... } */
function setProductOpenedBySize(p, map) {
  if (!p) return;
  p.openedBySize = {};
  Object.keys(map || {}).forEach(k => {
    const s = normalizeCanSize(k);
    const v = Math.max(0, Number((Number(map[k]) || 0).toFixed(2)));
    if (s && v > 0) p.openedBySize[s] = v;
  });
  syncProductOpenedTotals(p);
}

/* Total available liters for Color Mixing (Sealed Stock + Opened / Used Stock) */
function productMixAvailableStock(p) {
  if (!p) return 0;
  return Math.max(0, Number(((Number(p.stock) || 0) + productOpenedStock(p)).toFixed(2)));
}

/* Ensures every product has its own size list (p.sizes), that fractional liters in `p.stock` are moved into the
   opened pools (only for products without a per-size breakdown), and that the legacy single opened pool
   (openedStock + openedCanSize) is migrated into per-size pools. */
function normalizeProductOpenedStock(p) {
  if (!p) return false;
  let changed = false;
  const cleanSizes = sanitizeSizeList(p.sizes);
  if (!cleanSizes.length || JSON.stringify(cleanSizes) !== JSON.stringify(p.sizes)) {
    p.sizes = productSizes(p);
    changed = true;
  } else {
    const full = productSizes(p);
    if (full.length !== cleanSizes.length) { p.sizes = full; changed = true; }
  }
  const legacyOpened = Math.max(0, Number((Number(p.openedStock) || 0).toFixed(2)));
  const map = productOpenedBySizeMap(p);
  const mapTotal = map ? Object.keys(map).reduce((sum, k) => sum + (Number(map[k]) || 0), 0) : 0;
  if (!map || (mapTotal <= 0 && legacyOpened > 0)) {
    p.openedBySize = {};
    if (legacyOpened > 0) p.openedBySize[guessOpenedCanSize(legacyOpened, p.openedCanSize, p)] = legacyOpened;
    changed = true;
  }
  if (productHasCanBreakdown(p)) {
    const canLiters = canBreakdownLiters(p);
    if (Number(p.stock) !== canLiters) {
      p.stock = canLiters;
      changed = true;
    }
  } else {
    const rawStock = Math.max(0, Number(p.stock) || 0);
    const wholeStock = Math.floor(rawStock + 1e-9);
    const decimalPart = Number((rawStock - wholeStock).toFixed(2));
    if (decimalPart > 0) {
      p.stock = wholeStock;
      const sz = guessOpenedCanSize(decimalPart, 0, p);
      p.openedBySize[sz] = Number(((Number(p.openedBySize[sz]) || 0) + decimalPart).toFixed(2));
      changed = true;
    }
  }
  if (syncProductOpenedTotals(p)) changed = true;
  return changed;
}

/* Ensures each size in product `p` has an explicit threshold in p.thresholdBySize and syncs total threshold */
function normalizeProductThresholds(p) {
  if (!p) return false;
  let changed = false;
  if (!p.thresholdBySize || typeof p.thresholdBySize !== 'object' || Array.isArray(p.thresholdBySize)) {
    p.thresholdBySize = {};
    changed = true;
  }
  const sizes = productSizes(p);
  sizes.forEach(s => {
    if (p.thresholdBySize[s] === undefined || p.thresholdBySize[s] === null || p.thresholdBySize[s] === '') {
      p.thresholdBySize[s] = productSizeThreshold(p, s);
      changed = true;
    } else {
      const v = parseInt(p.thresholdBySize[s], 10);
      if (isNaN(v) || v < 0) {
        p.thresholdBySize[s] = 0;
        changed = true;
      }
    }
  });
  const totalLiters = productTotalThresholdLiters(p);
  if (totalLiters > 0 && Math.abs((Number(p.threshold) || 0) - totalLiters) > 0.001) {
    p.threshold = totalLiters;
    changed = true;
  }
  return changed;
}

/* Simulates or executes consuming `litersNeeded` of product `p` for Color Mixing:
   1. Uses the Opened / Used pool(s) first. Each can size has its own pool:
      - If `preferredCanSize` is chosen, only that size's opened pool is used first.
      - In `auto` mode (`preferredCanSize = 0`), the pools are drained smallest size first.
   2. If more is needed, opens sealed cans from `p.canStock` / `p.stock`:
      - If `preferredCanSize` is chosen, opens that size first before falling back to other sizes.
      - In `auto` mode, picks the best-fitting available can size of THIS product.
   3. Leftover liters from the newly opened can go into the opened pool of THAT can size for future mixes,
      while `p.stock` decreases by the full liters of the opened can. */
function previewColorMixConsumption(p, litersNeeded, preferredCanSize = 0) {
  const sizes = productSizes(p);
  const req = Math.max(0, Number((Number(litersNeeded) || 0).toFixed(2)));
  const pref = normalizeCanSize(preferredCanSize);
  const prefValid = sizes.includes(pref);
  const currentOpened = productOpenedStock(p);

  const currentBySize = {};
  const usedFromOpenedBySize = {};
  const cansOpened = {};
  const addedToOpenedBySize = {};
  sizes.forEach(s => {
    currentBySize[s] = productOpenedLiters(p, s);
    usedFromOpenedBySize[s] = 0;
    cansOpened[s] = 0;
    addedToOpenedBySize[s] = 0;
  });

  let remaining = req;
  const drainPool = s => {
    const take = Number(Math.min(currentBySize[s] - usedFromOpenedBySize[s], remaining).toFixed(2));
    if (take > 0) {
      usedFromOpenedBySize[s] = Number((usedFromOpenedBySize[s] + take).toFixed(2));
      remaining = Number((remaining - take).toFixed(2));
    }
  };
  (prefValid ? [pref] : sizes).forEach(drainPool);
  // The chosen size has no sealed cans left to open -> fall back to the other opened pools
  if (remaining > 0 && prefValid && productHasCanBreakdown(p) && productCanCount(p, pref) <= 0) {
    sizes.forEach(drainPool);
  }
  const usedFromOpened = Number((req - remaining).toFixed(2));
  let stillNeeded = remaining;

  let openedLitersFromCans = 0;
  let lastOpenedCanSize = 0;

  if (stillNeeded > 0) {
    if (productHasCanBreakdown(p)) {
      const tempCans = {};
      sizes.forEach(s => { tempCans[s] = productCanCount(p, s); });
      let rem = stillNeeded;

      // 1. If a preferred can size was explicitly chosen, pull from that size first
      if (prefValid && tempCans[pref] > 0) {
        while (rem > 0 && tempCans[pref] > 0) {
          tempCans[pref]--;
          cansOpened[pref]++;
          openedLitersFromCans += pref;
          lastOpenedCanSize = pref;
          rem = Number((rem - pref).toFixed(2));
        }
      }

      // 2. Smart Auto-Selection for any remaining liters needed:
      //    pick the smallest available can that covers what's left; if none is big enough, the largest available can.
      while (rem > 0) {
        const avail = sizes.filter(s => tempCans[s] > 0);
        if (!avail.length) break;
        const chosen = bestFitSize(avail, rem);
        tempCans[chosen]--;
        cansOpened[chosen]++;
        openedLitersFromCans += chosen;
        lastOpenedCanSize = chosen;
        rem = Number((rem - chosen).toFixed(2));
      }

      if (rem > 0) {
        const fallbackSize = prefValid ? pref : bestFitSize(sizes, rem);
        const countNeeded = Math.ceil(rem / fallbackSize - 1e-9);
        cansOpened[fallbackSize] += countNeeded;
        openedLitersFromCans += countNeeded * fallbackSize;
        lastOpenedCanSize = fallbackSize;
      }
    } else {
      // No per-size breakdown recorded yet - honor preferredCanSize or smart-fit size based on volume needed
      const availWhole = Math.floor(Number(p && p.stock) || 0);
      let chosenSize = prefValid ? pref : bestFitSize(sizes.filter(s => availWhole <= 0 || s <= availWhole), stillNeeded);
      if (!chosenSize) chosenSize = sizes[0] || 1;
      if (availWhole > 0 && chosenSize > availWhole) {
        chosenSize = sizes.filter(s => s <= availWhole).pop() || chosenSize;
      }
      const cansCount = Math.max(1, Math.ceil(stillNeeded / chosenSize - 1e-9));
      const totalToOpen = Math.min(availWhole > 0 ? availWhole : cansCount * chosenSize, cansCount * chosenSize);
      openedLitersFromCans = totalToOpen;
      cansOpened[chosenSize] = cansCount;
      lastOpenedCanSize = chosenSize;
    }
  }

  // Remaining opened leftover per size = what was there minus what was used; new leftover goes to the size of the can that was opened
  const newOpenedBySize = {};
  sizes.forEach(s => {
    newOpenedBySize[s] = Math.max(0, Number((currentBySize[s] - usedFromOpenedBySize[s]).toFixed(2)));
  });
  if (stillNeeded > 0 && lastOpenedCanSize && openedLitersFromCans > stillNeeded) {
    const leftover = Number((openedLitersFromCans - stillNeeded).toFixed(2));
    newOpenedBySize[lastOpenedCanSize] = Number(((newOpenedBySize[lastOpenedCanSize] || 0) + leftover).toFixed(2));
    addedToOpenedBySize[lastOpenedCanSize] = leftover;
  }

  const newOpenedStock = Number(sizes.reduce((sum, s) => sum + (newOpenedBySize[s] || 0), 0).toFixed(2));
  const sizesWithLeft = sizes.filter(s => newOpenedBySize[s] > 0);
  const newOpenedCanSize = sizesWithLeft.length ? sizesWithLeft[sizesWithLeft.length - 1] : 0;
  const addedToOpened = Number(sizes.reduce((sum, s) => sum + (addedToOpenedBySize[s] || 0), 0).toFixed(2));

  return {
    req,
    sizes,
    preferredCanSize: pref,
    currentOpened,
    currentOpenedBySize: currentBySize,
    usedFromOpened,
    usedFromOpenedBySize,
    stillNeeded,
    cansOpened,
    openedLitersFromCans,
    addedToOpened,
    addedToOpenedBySize,
    newOpenedStock,
    newOpenedBySize,
    newOpenedCanSize
  };
}

function consumeProductForColorMix(p, litersNeeded, preferredCanSize = 0) {
  if (!p) return null;
  normalizeProductOpenedStock(p);
  const plan = previewColorMixConsumption(p, litersNeeded, preferredCanSize);
  const hadBreakdown = productHasCanBreakdown(p);
  if (hadBreakdown) {
    if (!p.canStock || Array.isArray(p.canStock) || typeof p.canStock !== 'object') p.canStock = {};
    plan.sizes.forEach(s => {
      if (plan.cansOpened[s] > 0) {
        p.canStock[s] = Math.max(0, productCanCount(p, s) - plan.cansOpened[s]);
      }
    });
  }
  setProductOpenedBySize(p, plan.newOpenedBySize);
  // Deduct the whole sealed liters that were opened from `p.stock`
  const sealedDeducted = plan.openedLitersFromCans > 0 ? plan.openedLitersFromCans : plan.stillNeeded;
  p.stock = hadBreakdown
    ? canBreakdownLiters(p)
    : Math.max(0, Math.floor(Number((p.stock - sealedDeducted).toFixed(2))));
  return plan;
}

/* Opened / Used badge(s): one line per can size that has leftover */
function openedStockBadgeHtml(p) {
  const entries = productOpenedEntries(p);
  if (!entries.length) {
    return `<span class="muted" style="opacity:.45;">0 L</span>`;
  }
  return `
    <div style="display:inline-flex; flex-direction:column; align-items:flex-end; gap:4px; line-height:1.25;">
      ${entries.map(e => `
      <div style="display:inline-flex; flex-direction:column; align-items:flex-end; gap:1px;">
        <span class="badge" style="background:#FDF4E3; color:#9A6216; border:1px solid #F0D9B5; font-family:'Space Grotesk',sans-serif; font-weight:700;">
          🫙 ${formatLiters(e.left)} left <span style="opacity:0.85; font-weight:600;">(${fmtSize(e.size)} can)</span>
        </span>
        <span style="font-size:11px; color:#8A5A24; font-weight:600; font-family:'Space Grotesk',sans-serif;">
          Used: ${formatLiters(e.used)} of ${fmtSize(e.size)}
        </span>
      </div>`).join('')}
    </div>`;
}

function formatMixConsumptionNote(plan) {
  if (!plan) return '';
  const parts = [];
  const sizes = plan.sizes || CAN_SIZES;
  const bySize = (map) => sizes.filter(s => map && map[s] > 0).map(s => `${formatStock(map[s])}L from ${fmtSize(s)}`).join(', ');
  if (plan.usedFromOpened > 0) {
    parts.push(`${formatStock(plan.usedFromOpened)}L from Opened/Used Stock (${bySize(plan.usedFromOpenedBySize)})`);
  }
  const openedCansList = sizes
    .filter(s => plan.cansOpened[s] > 0)
    .map(s => `${plan.cansOpened[s]}×${fmtSize(s)}`);
  if (openedCansList.length > 0) {
    parts.push(`Opened ${openedCansList.join(', ')} can${openedCansList.length > 1 || Object.values(plan.cansOpened).some(v => v > 1) ? 's' : ''}`);
  }
  if (plan.addedToOpened > 0) {
    const added = sizes.filter(s => plan.addedToOpenedBySize && plan.addedToOpenedBySize[s] > 0).map(s => `${formatStock(plan.addedToOpenedBySize[s])}L → ${fmtSize(s)} can`).join(', ');
    parts.push(`+${formatStock(plan.addedToOpened)}L saved to Opened/Used Stock (${added})`);
  }
  return parts.length ? ` [${parts.join('; ')}]` : '';
}

function productById(id) { return db.products.find(p => p.id === id); }
function productOptionLabel(p) {
  const hex = getProductHex(p);
  const hexStr = hex ? ` (${hex})` : '';
  const color = p.color && p.color !== '-' ? ` · ${p.color}` : '';
  return `${p.name}${hexStr}${color} — ${p.brand} (stock: ${formatLiters(p.stock)})`;
}
function movementProductLabel(movement) {
  const product = movement.productId ? productById(movement.productId) : null;
  if (product) return productOptionLabel(product);
  return movement.productName || (movement.type === 'colormix' ? 'Color Mix' : 'Unknown product');
}
function supplierById(id) { return db.suppliers.find(s => s.id === id); }
function salesOn(iso) { return db.sales.filter(s => s.date.slice(0, 10) === iso); }
function salesBetween(fromISO, toISO) { return db.sales.filter(s => s.date.slice(0, 10) >= fromISO && s.date.slice(0, 10) <= toISO); }
function movementsBetween(fromISO, toISO) { return db.movements.filter(m => m.date.slice(0, 10) >= fromISO && m.date.slice(0, 10) <= toISO); }
function purchaseOrdersBetween(fromISO, toISO) {
  return (db.purchaseOrders || []).filter(o => {
    const d = String(o.orderDate || '').slice(0, 10);
    if (fromISO && d < fromISO) return false;
    if (toISO && d > toISO) return false;
    return true;
  });
}
function sumSales(list) { return list.reduce((t, s) => t + (Number(s.total || 0) - Number(s.refundTotal || 0)), 0); }

function staffLabel(name) {
  const u = (db.users || []).find(x => x.name === name);
  const role = u ? { admin: 'Admin', cashier: 'Cashier', staff: 'Inventory Staff' }[u.role] : '';
  return escapeHtml(name || '') + (role ? ` (${role})` : '');
}

/* PO deliveries, sales, returns & adjustments log "[Received/Sold/Added/Deducted N × SL, ...]" or Opened Stock in the note; read size/containers back from it. */
function movementSizeInfo(note) {
  const str = String(note || '');
  const m = str.match(/(?:Received|Sold|Return|Exchange|Added|Deducted|Adjusted)[^\d]*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)L/i)
    || str.match(/\[(?:[A-Za-z/–—\s]+\s+)?(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)L/i);
  if (m) return { units: Number(m[1]), size: Number(m[2]), openedLiters: 0, openedCanSize: null };

  const mOpen = str.match(/(?:Disposed|Deducted)\s+(\d+(?:\.\d+)?)L\s+(?:leftover\s+)?from\s+(?:(\d+(?:\.\d+)?)L\s+)?(?:opened\s+can|Opened\s*\/\s*Used\s*Stock)/i);
  if (mOpen) {
    return { units: 0, size: null, openedLiters: Number(mOpen[1]), openedCanSize: mOpen[2] ? Number(mOpen[2]) : null };
  }
  return { units: 0, size: null, openedLiters: 0, openedCanSize: null };
}

/* Qty cell text: "+3 × 16L (+48 L)" for sized movements, "-1.5 L (Opened)" for opened stock, or signed liters. */
function movementLineQtyText(l) {
  if (l.size) {
    const sign = l.qty > 0 ? '+' : (l.qty < 0 ? '-' : '');
    const literSign = l.qty > 0 ? '+' : '';
    return `${sign}${l.units} × ${l.size}L (${literSign}${formatStock(l.qty)} L)`;
  }
  if (l.openedLiters > 0) {
    return `-${formatStock(l.openedLiters)} L (Opened${l.openedCanSize ? ' ' + l.openedCanSize + 'L' : ''})`;
  }
  return (l.qty > 0 ? '+' : '') + formatStock(l.qty) + ' L';
}

function movementBalanceTrail(noteStr) {
  if (!noteStr) return '';
  const str = String(noteStr);
  const canMatch = str.match(/(\d+(?:\.\d+)?L\s+Cans:\s*\d+\s*(?:→|->)\s*\d+)/i);
  const openMatch = str.match(/(Opened(?:\s*Stock)?:\s*[\d.]+L\s*(?:→|->)\s*[\d.]+L)/i);
  const stockMatch = str.match(/(Stock:\s*[\d.]+L\s*(?:→|->)\s*[\d.]+L)/i);
  const parts = [];
  if (canMatch) parts.push(canMatch[1].replace(/\s*(?:->|→)\s*/g, '→'));
  if (openMatch) parts.push(openMatch[1].replace(/\s*(?:->|→)\s*/g, '→'));
  if (stockMatch) parts.push(stockMatch[1].replace(/\s*(?:->|→)\s*/g, '→'));
  return parts.join(' · ');
}

function groupStockMovements(movesList) {
  const sorted = (movesList || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const grouped = [];
  const mergedIdx = {};
  // Exclude custom color mix non-product entries so only real inventory item movements remain
  sorted.filter(m => m.type !== 'colormix' || m.productId).forEach(m => {
    const noteStr = String(m.note || '');
    const ref = (noteStr.match(/OR-\d+-\d+/) || noteStr.match(/PO Delivery:\s*(\S+)/) || [])[0] || '';
    const key = [m.type, m.date, m.staffName, ref].join('|');
    const sz = movementSizeInfo(noteStr);
    const balanceTrail = movementBalanceTrail(noteStr);
    const isOpenedEntry = sz.openedLiters > 0 || /\[Opened\s*\/\s*Used\s*Stock\]/i.test(String(m.productName || ''));
    const sizeSuffix = sz.size
      ? ` — ${sz.size}L Can`
      : (isOpenedEntry ? ` — 🫙 Opened / Used Stock${sz.openedCanSize ? ' (' + sz.openedCanSize + 'L Can)' : ''}` : '');
    const line = {
      label: movementProductLabel(m) + sizeSuffix,
      qty: Number(m.qtyChange),
      size: sz.size,
      units: sz.units,
      openedLiters: sz.openedLiters,
      openedCanSize: sz.openedCanSize,
      balanceTrail: balanceTrail,
      note: noteStr
    };
    if (mergedIdx[key] !== undefined) {
      const row = grouped[mergedIdx[key]];
      const same = row.lines.find(l => l.label === line.label && l.note === line.note);
      if (same) { same.qty += line.qty; same.units += line.units; same.openedLiters += line.openedLiters; } else row.lines.push(line);
    } else {
      mergedIdx[key] = grouped.length;
      grouped.push({ ...m, lines: [line] });
    }
  });
  return grouped;
}

function movementNoteHtml(m) {
  if (m.type === 'colormix') {
    const rc = (String((m.lines && m.lines[0] ? m.lines[0].note : m.note) || '').match(/Receipt:\s*(\S+)/) || [])[1];
    return rc ? `Color mix ingredients · Receipt: ${escapeHtml(rc)}` : escapeHtml((m.lines && m.lines[0] ? m.lines[0].note : m.note) || '');
  }
  const notes = m.lines ? m.lines.map(l => l.note) : [m.note || ''];
  return (new Set(notes).size === 1 ? [notes[0]] : notes).map(escapeHtml).join('<br>');
}

function movementTypeBadge(type) {
  const map = {
    sale: ['role-cashier', 'Sale'],
    receiving: ['ok', 'Receiving'],
    adjustment: ['mid', 'Adjustment'],
    colormix: ['role-staff', 'Color Mix'],
    return: ['role-admin', 'Return / Exchange'],
    exchange: ['role-cashier', 'Exchange'],
    refund: ['low', 'Return / Exchange']
  };
  const [cls, label] = map[type] || ['ok', type];
  return `<span class="badge ${cls}">${label}</span>`;
}

function formatDateTimeStacked(iso) {
  if (!iso) return '<span class="muted">—</span>';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return escapeHtml(iso);
  const dateStr = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return `<div class="movement-date-cell"><span class="movement-date-day">${escapeHtml(dateStr)}</span><span class="movement-date-time">${escapeHtml(timeStr)}</span></div>`;
}

function staffLabelStacked(name) {
  if (!name) return '<span class="muted">—</span>';
  const u = (db.users || []).find(x => x.name === name);
  const role = u ? { admin: 'Admin', cashier: 'Cashier', staff: 'Inventory Staff' }[u.role] : '';
  return `<div class="movement-staff-name">${escapeHtml(name)}</div>${role ? `<div class="movement-staff-role">${escapeHtml(role)}</div>` : ''}`;
}

function movementLineDeltaBadge(l) {
  const qty = Number(l.qty || 0);
  const isPos = qty > 0;
  const isNeg = qty < 0;
  const sign = isPos ? '+' : (isNeg ? '-' : '');
  const signClass = isPos ? 'delta-pos' : (isNeg ? 'delta-neg' : 'delta-zero');

  if (l.size && l.units) {
    const unitsAbs = Math.abs(l.units);
    const unitText = `${unitsAbs} can${unitsAbs === 1 ? '' : 's'}`;
    const literSign = isPos ? '+' : '';
    return `<span class="movement-delta ${signClass}"><span class="delta-units">${sign}${unitText}</span><span class="delta-liters">(${literSign}${formatStock(qty)} L)</span></span>`;
  }
  if (l.openedLiters > 0) {
    return `<span class="movement-delta delta-opened"><span class="delta-units">-${formatStock(l.openedLiters)} L</span><span class="delta-liters">(Opened${l.openedCanSize ? ' ' + l.openedCanSize + 'L' : ''})</span></span>`;
  }
  return `<span class="movement-delta ${signClass}"><span class="delta-units">${sign}${formatStock(Math.abs(qty))} L</span></span>`;
}

function movementNoteFormatted(m) {
  const notes = m.lines ? m.lines.map(l => l.note).filter(Boolean) : [m.note].filter(Boolean);
  const rawNote = String(notes[0] || m.note || '').trim();
  if (!rawNote) return '<span class="muted">—</span>';

  // Extract reference number
  const orMatch = rawNote.match(/\b(OR-\d{4}-\d+)\b/);
  const poMatch = rawNote.match(/\b(PO-\d{4}-\d+)\b/);
  const recMatch = rawNote.match(/Receipt:\s*(\S+)/i);
  const poProgMatch = rawNote.match(/PO:\s*(\d+\/\d+)/i);

  let ref = null;
  let refType = null;
  if (orMatch) {
    ref = orMatch[1];
    refType = 'or';
  } else if (poMatch) {
    ref = poMatch[1];
    refType = 'po';
  } else if (recMatch) {
    ref = recMatch[1];
    refType = 'rec';
  }

  const poProgress = poProgMatch ? `${poProgMatch[1]} items` : null;

  // Combine unique notes if multiple
  const uniqueRawNotes = Array.from(new Set(notes));
  const combinedRaw = uniqueRawNotes.join(' · ');

  // Clean note text by stripping brackets and references
  let cleaned = combinedRaw
    .replace(/\[(?:Received|Sold|Return|Exchange|Added|Deducted|Adjusted)?[^\]]*\]/gi, '')
    .trim();

  if (ref) {
    cleaned = cleaned.replace(new RegExp(`\\(?${ref}\\)?`, 'g'), '').trim();
  }

  // Remove redundant boilerplate prefixes that the ref badge already conveys
  cleaned = cleaned
    .replace(/^(?:Sold via POS|PO Delivery:?|Customer Return\s*\/\s*Exchange:?|Exchange Replacement Issued:?)\s*/i, '')
    .replace(/^Receipt:\s*/i, '')
    .replace(/PO:\s*\d+\/\d+/gi, '')
    .replace(/^[·:\-\s]+|[·:\-\s]+$/g, '')
    .trim();

  // Clean supplier or reason prefix like (Davies Paints) - text
  cleaned = cleaned.replace(/^\(([^)]+)\)\s*[-·:]*\s*/, '$1 · ').trim();
  cleaned = cleaned.replace(/^\(([^)]+)\)$/, '$1').trim();
  cleaned = cleaned.replace(/^[·:\-\s]+|[·:\-\s]+$/g, '').trim();

  // If empty after cleaning, provide context based on transaction type
  if (!cleaned) {
    if (m.type === 'sale') cleaned = 'POS Sale';
    else if (m.type === 'receiving') cleaned = 'PO Shipment Received';
    else if (m.type === 'colormix') cleaned = 'Color Mix Preparation';
    else if (m.type === 'return') cleaned = 'Customer Return';
  }

  let refBadgeHtml = '';
  if (ref) {
    if (refType === 'po') {
      refBadgeHtml = `<span class="movement-ref-pill pill-po" title="Purchase Order"><span class="pill-icon">📋</span> ${escapeHtml(ref)}</span>`;
    } else if (refType === 'or') {
      refBadgeHtml = `<span class="movement-ref-pill pill-or" title="Official Receipt"><span class="pill-icon">🧾</span> ${escapeHtml(ref)}</span>`;
    } else {
      refBadgeHtml = `<span class="movement-ref-pill pill-rec" title="Receipt Reference"><span class="pill-icon">🏷️</span> ${escapeHtml(ref)}</span>`;
    }
  }

  return `
    <div class="movement-note-wrap">
      ${(refBadgeHtml || poProgress) ? `
        <div class="movement-ref-row">
          ${refBadgeHtml}
          ${poProgress ? `<span class="movement-po-progress" title="PO Items Received">${escapeHtml(poProgress)}</span>` : ''}
        </div>
      ` : ''}
      <div class="movement-note-text">${escapeHtml(cleaned)}</div>
    </div>
  `;
}

function renderStockMovementsTable(moves, options = {}) {
  const hideStaff = !!options.hideStaff;
  const emptyText = options.emptyText || 'No movements recorded yet.';
  const colCount = hideStaff ? 5 : 6;

  if (!moves || !moves.length) {
    return `
      <table class="movement-table">
        <thead>
          <tr>
            <th class="movement-date-td">Date &amp; Time</th>
            <th class="movement-type-td">Type</th>
            <th>Product / Item</th>
            <th class="right movement-qty-td">Qty Change</th>
            ${!hideStaff ? '<th class="movement-staff-td">Staff / User</th>' : ''}
            <th>Reference &amp; Note</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colspan="${colCount}" class="empty-state">${escapeHtml(emptyText)}</td></tr>
        </tbody>
      </table>
    `;
  }

  const rowsHtml = moves.map(m => {
    const lines = m.lines || [];
    const isBatch = lines.length > 1;

    let itemsTdHtml = '';
    if (isBatch) {
      itemsTdHtml = `
        <td colspan="2" class="movement-batch-items-td">
          <div class="movement-items-list">
            ${lines.map(l => `
              <div class="movement-item-paired-row">
                <div class="movement-item-left">
                  <span class="movement-item-name">${escapeHtml(l.label)}</span>
                  ${l.balanceTrail ? `<div class="movement-balance-trail"><span class="trail-icon">📦</span> ${escapeHtml(l.balanceTrail)}</div>` : ''}
                </div>
                <span class="movement-item-delta">${movementLineDeltaBadge(l)}</span>
              </div>
            `).join('')}
          </div>
        </td>
      `;
    } else {
      const singleLine = lines[0] || { label: movementProductLabel(m), qty: m.qtyChange };
      itemsTdHtml = `
        <td class="movement-product-td">
          <div class="movement-prod-name">${escapeHtml(singleLine.label)}</div>
          ${singleLine.balanceTrail ? `<div class="movement-balance-trail"><span class="trail-icon">📦</span> ${escapeHtml(singleLine.balanceTrail)}</div>` : ''}
        </td>
        <td class="right movement-qty-td">
          ${movementLineDeltaBadge(singleLine)}
        </td>
      `;
    }

    return `
      <tr class="movement-row ${isBatch ? 'movement-row-batch' : ''}">
        <td class="movement-date-td">${formatDateTimeStacked(m.date)}</td>
        <td class="movement-type-td">
          ${movementTypeBadge(m.type)}
          ${isBatch ? `<div class="movement-batch-count">${lines.length} items</div>` : ''}
        </td>
        ${itemsTdHtml}
        ${!hideStaff ? `<td class="movement-staff-td">${staffLabelStacked(m.staffName)}</td>` : ''}
        <td class="movement-note-td">${movementNoteFormatted(m)}</td>
      </tr>
    `;
  }).join('');

  return `
    <table class="movement-table">
      <thead>
        <tr>
          <th class="movement-date-td">Date &amp; Time</th>
          <th class="movement-type-td">Type</th>
          <th>Product / Item</th>
          <th class="right movement-qty-td">Qty Change</th>
          ${!hideStaff ? '<th class="movement-staff-td">Staff / User</th>' : ''}
          <th>Reference &amp; Note</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}

function stockBadge(p) {
  const stock = Number(p && p.stock) || 0;
  if (stock <= 0) return `<span class="badge out">Out of Stock</span>`;
  if (productHasLowStock(p)) {
    const summary = productLowSizesSummary(p);
    const tip = summary ? `Low stock sizes: ${summary}` : `Stock (${formatLiters(stock)}) ≤ threshold (${formatLiters(p?.threshold || 0)})`;
    return `<span class="badge low" title="${escapeHtml(tip)}">Low Stock</span>`;
  }
  return `<span class="badge ok">In Stock</span>`;
}

function getPOItems(po) {
  if (!po) return [];
  if (Array.isArray(po.items) && po.items.length > 0) return po.items;
  if (po.itemsJson) {
    try {
      const parsed = typeof po.itemsJson === 'string' ? JSON.parse(po.itemsJson) : po.itemsJson;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn('Error parsing po.itemsJson', e);
    }
  }
  if (Array.isArray(po.items)) return po.items;
  return [];
}

/* ============================================================
   PURCHASE ORDER & ON-ORDER STOCK TRACKING
   ============================================================ */

/**
 * Returns any open purchase orders (pending, ordered, or partially received) containing this product.
 */
function openPOsForProduct(productId) {
  return (db.purchaseOrders || []).filter(po => {
    if (po.status !== 'pending' && po.status !== 'ordered' && po.status !== 'partial') return false;
    const items = getPOItems(po);
    return items.some(it => String(it.productId) === String(productId));
  });
}

/**
 * True if product is currently on order in an open purchase order.
 */
function productHasOpenPO(productId) {
  return openPOsForProduct(productId).length > 0;
}

/**
 * Low stock products that do NOT yet have an open purchase order (truly need reordering).
 */
function lowStockProductsNeedingPO() {
  return lowStockProducts().filter(p => !productHasOpenPO(p.id));
}

/**
 * Low stock products that already have a pending or ordered purchase order en route.
 */
function lowStockProductsOnOrder() {
  return lowStockProducts().filter(p => productHasOpenPO(p.id));
}

function openPODetail(poId) {
  if (typeof poViewMode !== 'undefined') poViewMode = 'detail';
  if (typeof poDetailId !== 'undefined') poDetailId = poId;
  goTo('purchaseOrders');
}

