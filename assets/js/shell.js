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
    { id: 'suppliers', label: 'Supplier Directory', icon: '👥' },
    { id: 'reports', label: 'Reports', icon: '📈' },
  ];
}
function defaultPageFor(role) {
  if (role === 'admin') return 'dashboard';
  if (role === 'cashier') return 'pos';
  return 'staffDashboard';
}

/* ============================================================
   4.1 MODULE NOTIFICATION BADGES (Red badge counters)
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
      // Exactly matches default tab "Needs Purchase Order":
      // Count of low stock products with NO open Purchase Order yet
      if (typeof lowStockProductsNeedingPO === 'function') {
        return lowStockProductsNeedingPO().length;
      }
      if (typeof lowStockProducts === 'function') {
        return lowStockProducts().filter(p => !productHasOpenPO(p.id)).length;
      }
      return 0;
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
      // Count of Purchase Orders awaiting Admin review / authorization
      const pendingPOs = (db.purchaseOrders || []).filter(o => o.status === 'pending');
      return pendingPOs.length;
    }

    case 'inventory': {
      const pendingInv = (db.products || []).filter(p =>
        p.status === 'pending_approval' ||
        Boolean(p.pendingEdit) ||
        (p.pendingSizes && p.pendingSizes.length > 0) ||
        (p.pendingPrice != null && Number(p.pendingPrice) > 0)
      );
      if (currentRole === 'staff') {
        return pendingInv.length;
      }
      // For Admin, pending items are in Approvals hub; here shows out-of-stock count (0 stock) if any
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
      // Audit log is an event trail; no notification badge needed
      return 0;
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
      // Sales History is a completed transaction ledger; no pending notification needed
      return 0;
    }

    case 'dashboard':
    case 'staffDashboard': {
      // Top-level landing overview; badges are shown on specific actionable modules
      return 0;
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

let isSidebarCollapsed = localStorage.getItem('mrgr_sidebar_collapsed') === 'true';

function toggleSidebarCollapse(forceState) {
  if (typeof forceState === 'boolean') {
    isSidebarCollapsed = forceState;
  } else {
    isSidebarCollapsed = !isSidebarCollapsed;
  }
  localStorage.setItem('mrgr_sidebar_collapsed', isSidebarCollapsed ? 'true' : 'false');
  const shellEl = document.querySelector('.shell');
  if (shellEl) {
    if (isSidebarCollapsed) shellEl.classList.add('sidebar-collapsed');
    else shellEl.classList.remove('sidebar-collapsed');

    if (window.innerWidth <= 768) {
      if (!isSidebarCollapsed) shellEl.classList.add('mobile-open');
      else shellEl.classList.remove('mobile-open');
    }
  }
}

function shell() {
  const items = navItemsFor(currentUser.role);
  const navHtml = items.map(it => {
    const count = getModuleNotificationCount(it.id, currentUser.role);
    const isVisible = count > 0;
    const displayCount = count > 99 ? '99+' : count;
    return `
<button class="nav-item ${currentPage === it.id ? 'active' : ''}" onclick="goTo('${it.id}')" title="${it.label}">
  <span class="nav-icon" aria-hidden="true">${it.icon || '•'}</span>
  <span class="nav-label">${it.label}</span>
  <span id="nav-badge-${it.id}" class="nav-badge ${isVisible ? '' : 'hidden'}" style="${isVisible ? 'display:inline-flex;' : 'display:none;'}" title="${count} notification${count === 1 ? '' : 's'}">${displayCount}</span>
</button>`;
  }).join('');

  const roleLabel = { admin: 'Administrator', cashier: 'Cashier', staff: 'Inventory Staff' }[currentUser.role];
  const userInitial = (currentUser.name || 'U').charAt(0).toUpperCase();
  const greeting = getGreeting();
  const now = new Date();

  return `
  <div class="shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}">
<div class="sidebar-backdrop" onclick="toggleSidebarCollapse(true)"></div>
<div class="sidebar" id="app-sidebar">
  <div class="brand">
    <div class="swatch-strip"><span class="swatch sw-teal"></span><span class="swatch sw-orange"></span><span class="swatch sw-mustard"></span></div>
    <div class="brand-text">MRGR<br><small>COLOR CENTER</small></div>
  </div>
  <div class="nav-list">${navHtml}</div>
  <div style="padding-top:14px; border-top:1px solid #3a352e; margin-top:auto;">
    <div style="font-size:11px; color:#8E8578; display:flex; align-items:center; gap:6px;" class="system-status-text">
      <span style="width:7px; height:7px; border-radius:50%; background:#4ade80; display:inline-block; flex-shrink:0;"></span>
      <span>System Online · v2.5</span>
    </div>
  </div>
</div>
<div class="main">
  <div class="topbar">
    <div style="display:flex; align-items:center; gap:12px;">
      <button type="button" class="sidebar-toggle-btn" onclick="toggleSidebarCollapse()" title="Toggle navigation sidebar" aria-label="Toggle navigation sidebar">
        <span class="toggle-icon">☰</span>
      </button>
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
  dashboard: 'Dashboard', approvals: 'Pending Approvals Hub', pos: 'Point of Sale', products: 'Inventory', inventory: 'Inventory',
  sales: 'Sales History', reports: 'Reports', suppliers: 'Suppliers', users: 'User Management', auditLog: 'Audit Log',
  staffDashboard: 'Dashboard', receiving: 'Stock Receiving / Adjustments', suppliersView: 'Supplier Directory', alerts: 'Low-Stock Alerts',
  purchaseOrders: 'Purchase Orders',
};

function goTo(page) {
  if (page === 'products') {
    page = 'inventory';
  }
  if (page === 'suppliersView') {
    page = 'suppliers';
  }
  if (currentUser && currentUser.role === 'staff' && page === 'dashboard') {
    page = 'staffDashboard';
  }
  if (currentUser && currentUser.role === 'admin' && page === 'staffDashboard') {
    page = 'dashboard';
  }
  const roleAllowedPages = {
    admin: ['dashboard', 'approvals', 'inventory', 'alerts', 'purchaseOrders', 'suppliers', 'reports', 'auditLog', 'users', 'pos', 'sales'],
    cashier: ['pos', 'inventory', 'sales'],
    staff: ['staffDashboard', 'inventory', 'alerts', 'purchaseOrders', 'receiving', 'suppliers', 'reports']
  };

  const userRole = (currentUser && currentUser.role) || 'unauthenticated';
  const allowed = roleAllowedPages[userRole] || [];

  if (!allowed.includes(page)) {
    const pageLabel = PAGE_TITLES[page] || page;
    if (typeof logAudit === 'function') {
      logAudit(
        'UNAUTHORIZED_ACCESS',
        pageLabel,
        `Unauthorized navigation attempt to ${pageLabel} by ${(currentUser && currentUser.name) || 'Unauthenticated User'} (${userRole})`,
        {
          entityName: pageLabel,
          fieldChanged: 'Module Navigation Access',
          oldValue: `Role: ${userRole}`,
          newValue: 'Access Blocked',
          reason: `Attempted to access unauthorized module "${pageLabel}"`
        }
      );
    }
    showToast(`Access denied: Your role (${userRole}) is not authorized to access ${pageLabel}.`, 'error');
    return;
  }
  if (window.innerWidth <= 768) {
    const shellEl = document.querySelector('.shell');
    if (shellEl && shellEl.classList.contains('mobile-open')) {
      shellEl.classList.remove('mobile-open');
    }
  }
  currentPage = page;
  renderApp();
}

/**
 * Direct navigation to a specific tab within the Reports module.
 * Preserves all existing filters, date ranges, presets, and reporting functionality.
 */
function goToReportsTab(tab) {
  if (typeof reportActiveTab !== 'undefined') {
    reportActiveTab = tab;
  }
  if (tab === 'history' && typeof resetReportsSalesHistoryPagination === 'function') {
    resetReportsSalesHistoryPagination();
  }
  goTo('reports');
  if (typeof setReportTab === 'function') {
    setReportTab(tab);
  }
  if (typeof window !== 'undefined' && window.scrollTo) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/**
 * Direct route navigation helper to the Reports module's Sales History page.
 * Fulfills Admin Dashboard direct Sales History navigation without landing page redirect.
 */
function goToReportsSalesHistory() {
  goToReportsTab('history');
}

function renderPage() {
  document.getElementById('page-title').textContent = PAGE_TITLES[currentPage] || 'MRGR Color Center';
  const target = document.getElementById('page-content');
  if (!target) return;
  const renderers = {
    dashboard: (currentUser && currentUser.role === 'staff') ? (typeof staffDashboard === 'function' ? staffDashboard : () => '') : (typeof adminDashboard === 'function' ? adminDashboard : () => ''),
    approvals: (typeof approvalsPage === 'function' ? approvalsPage : adminDashboard),
    pos: typeof posPage === 'function' ? posPage : () => '',
    products: typeof inventoryPage === 'function' ? inventoryPage : () => '',
    inventory: typeof inventoryPage === 'function' ? inventoryPage : () => '',
    sales: typeof salesHistoryPage === 'function' ? salesHistoryPage : () => '',
    reports: typeof reportsPage === 'function' ? reportsPage : () => '',
    suppliers: typeof suppliersPage === 'function' ? suppliersPage : () => '',
    users: typeof usersPage === 'function' ? usersPage : () => '',
    auditLog: typeof auditLogPage === 'function' ? auditLogPage : () => '',
    staffDashboard: (currentUser && currentUser.role === 'admin') ? (typeof adminDashboard === 'function' ? adminDashboard : () => '') : (typeof staffDashboard === 'function' ? staffDashboard : () => ''),
    receiving: typeof receivingPage === 'function' ? receivingPage : () => '',
    suppliersView: typeof suppliersPage === 'function' ? suppliersPage : () => '',
    alerts: typeof alertsPage === 'function' ? alertsPage : () => '',
    purchaseOrders: typeof purchaseOrdersPage === 'function' ? purchaseOrdersPage : () => '',
  };
  const fn = renderers[currentPage] || ((currentUser && currentUser.role === 'staff') ? staffDashboard : adminDashboard);
  try {
    target.innerHTML = fn();
    if (currentPage === 'pos') renderPosProductList();
    if (currentPage === 'purchaseOrders') initPOPage();
    if (currentPage === 'dashboard' || currentPage === 'staffDashboard' || currentPage === 'alerts') LowStockService.syncUI();
    if (typeof updateNavBadges === 'function') updateNavBadges();
  } catch (err) {
    console.error('Error rendering page:', err);
    target.innerHTML = `
      <div class="panel" style="padding:48px 24px; text-align:center; max-width:600px; margin:30px auto; border:1px solid #F0C4BF; background:#FFF8F7; border-radius:10px;">
        <div style="font-size:36px; margin-bottom:12px;">⚠️</div>
        <h3 style="margin:0 0 8px; color:var(--danger,#C1443D);">Failed to Load ${escapeHtml(PAGE_TITLES[currentPage] || 'Page')}</h3>
        <p class="muted" style="margin:0 0 16px; font-size:13.5px;">A technical error occurred while displaying this section. The application shell remains active.</p>
        <div style="background:#fff; border:1px solid #F0ECE1; border-radius:6px; padding:10px 14px; font-family:monospace; font-size:12px; color:#A83232; text-align:left; margin-bottom:18px; overflow-x:auto;">
          ${escapeHtml(err.message || 'Unknown error')}
        </div>
        <div style="display:flex; justify-content:center; gap:10px;">
          <button class="btn secondary small" onclick="renderApp()">↻ Retry</button>
          <button class="btn small" onclick="goTo('dashboard')">Back to Dashboard</button>
        </div>
      </div>
    `;
  }
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
  const matchedByUsername = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  const user = matchedByUsername && matchedByUsername.password === password ? matchedByUsername : null;
  const errorSlot = document.getElementById('login-error-slot');
  if (!user) {
    logAudit(
      'LOGIN_FAILED',
      'Authentication',
      `Failed login attempt for username "${username || 'unknown'}" (Invalid credentials)`,
      {
        userOverride: {
          id: matchedByUsername ? matchedByUsername.id : '',
          name: matchedByUsername ? `${matchedByUsername.name} (@${username})` : (username || 'Unknown User'),
          role: matchedByUsername ? matchedByUsername.role : 'unauthenticated'
        },
        entityName: matchedByUsername ? `${matchedByUsername.name} (@${username})` : `Username: ${username || 'Unknown'}`,
        fieldChanged: 'User Authentication',
        oldValue: 'Signed Out',
        newValue: 'Login Failed (Incorrect Username or Password)',
        reason: 'Invalid username or password entered at login screen'
      }
    );
    errorSlot.innerHTML = `<div class="login-error">Incorrect username or password.</div>`;
    return false;
  }
  if (user.status !== 'active') {
    logAudit(
      'LOGIN_FAILED',
      'Authentication',
      `Blocked login attempt for deactivated account "${user.name}" (@${user.username})`,
      {
        userOverride: { id: user.id, name: user.name, role: user.role },
        entityName: `${user.name} (@${user.username})`,
        fieldChanged: 'User Authentication',
        oldValue: 'Account Status: Inactive',
        newValue: 'Login Blocked (Deactivated Account)',
        reason: 'Attempted to sign in with a deactivated user account'
      }
    );
    errorSlot.innerHTML = `<div class="login-error">This account has been deactivated. Contact the administrator.</div>`;
    return false;
  }
  currentUser = user;
  logAudit(
    'LOGIN',
    'Session',
    `${user.name} (@${user.username}) signed in as ${{ admin: 'Administrator', cashier: 'Cashier', staff: 'Inventory Staff' }[user.role] || user.role}`,
    {
      entityName: `${user.name} (@${user.username})`,
      fieldChanged: 'Session Status',
      oldValue: 'Signed Out',
      newValue: `Signed In (${{ admin: 'Administrator', cashier: 'Cashier', staff: 'Inventory Staff' }[user.role] || user.role})`
    }
  );
  if (typeof loadDB === 'function') {
    try { await loadDB(); } catch (e) { }
  }
  currentPage = defaultPageFor(user.role);
  cart = [];
  await storage.set(SESSION_KEY, JSON.stringify({ userId: user.id }));
  renderApp();
  return false;
}

function logout() {
  if (currentUser) {
    logAudit(
      'LOGOUT',
      'Session',
      `${currentUser.name} (@${currentUser.username}) signed out`,
      {
        entityName: `${currentUser.name} (@${currentUser.username})`,
        fieldChanged: 'Session Status',
        oldValue: `Signed In (${{ admin: 'Administrator', cashier: 'Cashier', staff: 'Inventory Staff' }[currentUser.role] || currentUser.role})`,
        newValue: 'Signed Out'
      }
    );
  }
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
  if (Array.isArray(p.sizesData) && p.sizesData.length > 0) {
    const v = p.sizesData.find(x => normalizeCanSize(x.containerSize) === s);
    if (v && v.minimumStock !== undefined && v.minimumStock !== null && v.minimumStock !== '') {
      return Math.max(0, Math.floor(Number(v.minimumStock) || 0));
    }
  }
  const map = (p.thresholdBySize && typeof p.thresholdBySize === 'object' && !Array.isArray(p.thresholdBySize)) ? p.thresholdBySize : null;
  if (map && map[s] !== undefined && map[s] !== null && map[s] !== '') {
    const v = Number(map[s]);
    return isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  }
  if (map && map[size] !== undefined && map[size] !== null && map[size] !== '') {
    const v = Number(map[size]);
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

/* Status badge for a container size: Good (green), Low Stock (amber), Out of Stock (red) */
function containerSizeStatusBadge(st) {
  if (st === 'out') {
    return `<span class="badge out" style="background:#FDE8E8; color:#9B1C1C; border:1px solid #F8B4B4; font-weight:700; padding:3px 10px; border-radius:12px; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#E02424;"></span>Out of Stock</span>`;
  }
  if (st === 'low') {
    return `<span class="badge low" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-weight:700; padding:3px 10px; border-radius:12px; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#D97706;"></span>Low Stock</span>`;
  }
  return `<span class="badge ok" style="background:#DEF7EC; color:#03543F; border:1px solid #BCF0DA; font-weight:700; padding:3px 10px; border-radius:12px; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#0E9F6E;"></span>Good</span>`;
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

/* A product has low stock if ANY individual container size is at or below its separate threshold,
   or if it is out of stock. Evaluates stock status independently for each product size. */
function productHasLowStock(p) {
  if (!p) return false;
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

/* Sizes (liters) of ONE product, ascending. Always includes any size that currently holds sealed or opened stock, or defines a threshold. */
function productSizes(p) {
  let base = sanitizeSizeList(p && p.sizes);
  if (!base.length) base = CAN_SIZES.slice();
  const extra = [];
  const c = p && p.canStock && !Array.isArray(p.canStock) && typeof p.canStock === 'object' ? p.canStock : {};
  Object.keys(c).forEach(k => { if ((Number(c[k]) || 0) > 0) extra.push(k); });
  const o = p && p.openedBySize && !Array.isArray(p.openedBySize) && typeof p.openedBySize === 'object' ? p.openedBySize : {};
  Object.keys(o).forEach(k => { if ((Number(o[k]) || 0) > 0) extra.push(k); });
  const t = p && p.thresholdBySize && !Array.isArray(p.thresholdBySize) && typeof p.thresholdBySize === 'object' ? p.thresholdBySize : {};
  Object.keys(t).forEach(k => { if ((Number(t[k]) || 0) > 0) extra.push(k); });
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
  if (!p) return 0;
  const s = normalizeCanSize(size);
  if (Array.isArray(p.sizesData) && p.sizesData.length > 0) {
    const v = p.sizesData.find(x => normalizeCanSize(x.containerSize) === s);
    if (v && v.sealedQuantity !== undefined && v.sealedQuantity !== null) {
      return Math.max(0, Math.floor(Number(v.sealedQuantity) || 0));
    }
  }
  const c = p && p.canStock && !Array.isArray(p.canStock) && typeof p.canStock === 'object' ? p.canStock : {};
  const val = c[s] !== undefined ? c[s] : c[size];
  return Math.max(0, Math.floor(Number(val) || 0));
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
  if (typeof syncProductVariants === 'function') {
    syncProductVariants(p);
  }
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

function productById(id) {
  if (!id || !db || !Array.isArray(db.products)) return null;
  return db.products.find(p => p.id === id || p.productId === id || p.product_id === id);
}

/* ============================================================
   PRODUCT ID & SIZE ID GENERATION AND LOOKUP HELPERS
   ============================================================ */
let _maxIssuedSizeNum = 0;

function nextProductId() {
  let max = 0;
  (db && Array.isArray(db.products) ? db.products : []).forEach(p => {
    const rawId = p.productId || p.product_id || p.id || '';
    if (rawId.startsWith('PRD-')) {
      const num = parseInt(rawId.replace('PRD-', ''), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  });
  return `PRD-${String(max + 1).padStart(3, '0')}`;
}

function nextSizeId() {
  let max = _maxIssuedSizeNum || 0;
  // Scan all products & sizesData
  (db && Array.isArray(db.products) ? db.products : []).forEach(p => {
    (p.sizesData || []).forEach(v => {
      const rawId = v.sizeId || '';
      if (rawId.startsWith('SZ-')) {
        const num = parseInt(rawId.replace('SZ-', ''), 10);
        if (!isNaN(num) && num > max) max = num;
      }
    });
  });
  // Scan top-level productSizes if available
  (db && Array.isArray(db.productSizes) ? db.productSizes : []).forEach(ps => {
    const rawId = ps.sizeId || '';
    if (rawId.startsWith('SZ-')) {
      const num = parseInt(rawId.replace('SZ-', ''), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  });
  // Scan movements
  (db && Array.isArray(db.movements) ? db.movements : []).forEach(m => {
    if (m.sizeId && m.sizeId.startsWith('SZ-')) {
      const num = parseInt(m.sizeId.replace('SZ-', ''), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  });
  _maxIssuedSizeNum = max + 1;
  return `SZ-${String(_maxIssuedSizeNum).padStart(3, '0')}`;
}

function nextInventoryId() {
  let max = 0;
  (db && Array.isArray(db.products) ? db.products : []).forEach(p => {
    (p.sizesData || []).forEach(v => {
      const rawId = v.inventoryId || '';
      if (rawId.startsWith('INV-')) {
        const num = parseInt(rawId.replace('INV-', ''), 10);
        if (!isNaN(num) && num > max) max = num;
      }
    });
  });
  (db && Array.isArray(db.inventory) ? db.inventory : []).forEach(inv => {
    const rawId = inv.inventoryId || '';
    if (rawId.startsWith('INV-')) {
      const num = parseInt(rawId.replace('INV-', ''), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  });
  return `INV-${String(max + 1).padStart(3, '0')}`;
}

function productSizeVariants(p) {
  if (!p) return [];
  if (Array.isArray(p.sizesData) && p.sizesData.length > 0) {
    return p.sizesData;
  }
  syncProductVariants(p);
  return p.sizesData || [];
}

function productSizeVariantBySize(p, containerSize) {
  if (!p) return null;
  const n = normalizeCanSize(containerSize);
  const variants = productSizeVariants(p);
  let match = variants.find(v => normalizeCanSize(v.containerSize) === n);
  if (!match) {
    syncProductVariants(p);
    match = (p.sizesData || []).find(v => normalizeCanSize(v.containerSize) === n);
  }
  return match || null;
}

function productSizeById(sizeId) {
  if (!sizeId || !db || !Array.isArray(db.products)) return null;
  for (const p of db.products) {
    const v = (p.sizesData || []).find(s => s.sizeId === sizeId);
    if (v) return { ...v, product: p };
  }
  if (Array.isArray(db.productSizes)) {
    const ps = db.productSizes.find(s => s.sizeId === sizeId);
    if (ps) return { ...ps, product: productById(ps.productId) };
  }
  return null;
}

function syncProductVariants(p) {
  if (!p) return;
  const prodId = p.productId || p.product_id || p.id;
  p.id = prodId;
  p.productId = prodId;
  p.product_id = prodId;
  p.name = p.productName || p.product_name || p.name;
  p.productName = p.name;
  p.product_name = p.name;
  p.category = p.category || p.type;
  p.type = p.type || p.category;

  if (!Array.isArray(p.sizesData)) p.sizesData = [];
  const currentNumericSizes = sanitizeSizeList(p.sizes || []);
  const extraNumericSizes = [];
  if (p.canStock && typeof p.canStock === 'object') {
    Object.keys(p.canStock).forEach(k => { if ((Number(p.canStock[k]) || 0) > 0) extraNumericSizes.push(Number(k)); });
  }
  const allNeededSizes = sanitizeSizeList([...currentNumericSizes, ...extraNumericSizes, ...p.sizesData.map(v => v.containerSize)]);
  if (!allNeededSizes.length) allNeededSizes.push(1);

  const price = Number(p.price) || 0;
  const canStock = (p.canStock && typeof p.canStock === 'object' && !Array.isArray(p.canStock)) ? p.canStock : {};
  const threshMap = (p.thresholdBySize && typeof p.thresholdBySize === 'object' && !Array.isArray(p.thresholdBySize)) ? p.thresholdBySize : {};
  const openedMap = (p.openedBySize && typeof p.openedBySize === 'object' && !Array.isArray(p.openedBySize)) ? p.openedBySize : {};

  // Ensure each needed size has a variant
  allNeededSizes.forEach(s => {
    let variant = p.sizesData.find(v => normalizeCanSize(v.containerSize) === s);
    if (!variant) {
      variant = {
        sizeId: nextSizeId(),
        productId: prodId,
        containerSize: s,
        pricePerLiter: price,
        pricePerCan: Number((price * s).toFixed(2)),
        minimumStock: threshMap[s] !== undefined ? Number(threshMap[s]) : (s >= 16 ? 1 : (s >= 4 ? 2 : 5)),
        sealedQuantity: Math.max(0, Math.floor(Number(canStock[s]) || 0)),
        openedQuantity: (Number(openedMap[s]) || 0) > 0 ? 1 : 0,
        remainingVolume: Math.max(0, Number((Number(openedMap[s]) || 0).toFixed(2))),
        isActive: true,
        inventoryId: nextInventoryId()
      };
      p.sizesData.push(variant);
    } else {
      // Sync values
      variant.productId = prodId;
      variant.containerSize = s;
      variant.pricePerLiter = variant.pricePerLiter !== undefined ? Number(variant.pricePerLiter) : price;
      variant.pricePerCan = variant.pricePerCan !== undefined ? Number(variant.pricePerCan) : Number((price * s).toFixed(2));
      if (threshMap[s] !== undefined) variant.minimumStock = Number(threshMap[s]);
      if (canStock[s] !== undefined) variant.sealedQuantity = Math.max(0, Math.floor(Number(canStock[s]) || 0));
      if (openedMap[s] !== undefined) {
        variant.remainingVolume = Math.max(0, Number((Number(openedMap[s]) || 0).toFixed(2)));
        variant.openedQuantity = variant.remainingVolume > 0 ? 1 : 0;
      }
    }
  });

  // Sort sizesData ascending by containerSize
  p.sizesData.sort((a, b) => Number(a.containerSize) - Number(b.containerSize));

  // Sync back to p.sizes, p.canStock, p.thresholdBySize, p.openedBySize
  p.sizes = p.sizesData.map(v => v.containerSize);
  p.sizesData.forEach(v => {
    const sStr = String(v.containerSize);
    canStock[sStr] = v.sealedQuantity;
    threshMap[sStr] = v.minimumStock;
    if (v.remainingVolume > 0) openedMap[sStr] = v.remainingVolume;
    else delete openedMap[sStr];
  });
  p.canStock = canStock;
  p.thresholdBySize = threshMap;
  p.openedBySize = openedMap;
}

function formatProductIdBadge(productId) {
  if (!productId) return '';
  return `<span class="badge prod-id-badge" style="background:#EBF5FB; color:#1B4F72; border:1px solid #AED6F1; font-family:'Space Grotesk',monospace; font-weight:700; font-size:11px; padding:2px 7px; border-radius:4px; display:inline-flex; align-items:center;" title="Product ID: ${escapeHtml(productId)}">${escapeHtml(productId)}</span>`;
}

function formatSizeIdBadge(sizeId) {
  return '';
}
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
function salesBetween(fromISO, toISO) {
  return db.sales.filter(s => {
    const d = s.date.slice(0, 10);
    if (fromISO && d < fromISO) return false;
    if (toISO && d > toISO) return false;
    return true;
  });
}
function movementsBetween(fromISO, toISO) {
  return db.movements.filter(m => {
    const d = m.date.slice(0, 10);
    if (fromISO && d < fromISO) return false;
    if (toISO && d > toISO) return false;
    return true;
  });
}
function purchaseOrdersBetween(fromISO, toISO) {
  return (db.purchaseOrders || []).filter(o => {
    const d = String(o.orderDate || '').slice(0, 10);
    if (fromISO && d < fromISO) return false;
    if (toISO && d > toISO) return false;
    return true;
  });
}
function sumSales(list) {
  return (list || []).reduce((t, s) => {
    if (!s) return t;
    const st = String(s.status || 'completed').trim().toLowerCase();
    if (st === 'voided' || st === 'void' || st === 'cancelled' || st === 'canceled') return t;
    const rawTotal = Number(s.total || 0);
    const refundTotal = Number(s.refundTotal || 0);
    const returns = Array.isArray(s.returns) ? s.returns : [];
    const effectiveRefund = (st === 'refunded' && refundTotal === 0 && returns.length === 0) ? rawTotal : refundTotal;
    return Number((t + Math.max(0, rawTotal - effectiveRefund)).toFixed(2));
  }, 0);
}

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
      id: m.id,
      productId: m.productId,
      sizeId: m.sizeId,
      containerSize: m.containerSize || sz.size,
      productName: m.productName,
      baseLabel: movementProductLabel(m),
      label: movementProductLabel(m) + sizeSuffix,
      qty: Number(m.qtyChange),
      size: sz.size,
      units: sz.units,
      openedLiters: sz.openedLiters,
      openedCanSize: sz.openedCanSize,
      balanceTrail: balanceTrail,
      note: noteStr,
      rawMovement: m
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
  const notes = (m.lines ? m.lines.map(l => l.note) : [m.note || '']).map(n => String(n || '').replace(/\s*\(SZ-\d+\)/gi, '').replace(/\s*\[(?:SZ|PRD)-\d+\]/gi, ''));
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
    .replace(/\s*\(SZ-\d+\)/gi, '')
    .replace(/\s*\[(?:SZ|PRD)-\d+\]/gi, '')
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
    return items.some(it => String(it.productId || it.product_id) === String(productId));
  });
}

/**
 * Returns any open purchase orders containing a specific container size / size ID of this product.
 */
function openPOsForProductSize(productId, size, sizeId = null) {
  const normSize = normalizeCanSize(size);
  return (db.purchaseOrders || []).filter(po => {
    if (po.status !== 'pending' && po.status !== 'ordered' && po.status !== 'partial') return false;
    const items = getPOItems(po);
    return items.some(it => {
      const matchProd = String(it.productId || it.product_id || '') === String(productId);
      if (!matchProd) return false;
      if (sizeId && (it.sizeId || it.size_id)) {
        if (String(it.sizeId || it.size_id) === String(sizeId)) return true;
      }
      if (it.size != null && normalizeCanSize(it.size) === normSize) return true;
      return false;
    });
  });
}

/**
 * True if product is currently on order in an open purchase order.
 */
function productHasOpenPO(productId) {
  return openPOsForProduct(productId).length > 0;
}

/**
 * True if a specific container size of a product is currently in an active open purchase order.
 */
function productSizeHasOpenPO(productId, size, sizeId = null) {
  return openPOsForProductSize(productId, size, sizeId).length > 0;
}

/**
 * Low stock products that do NOT yet have an open purchase order (truly need reordering).
 */
function lowStockProductsNeedingPO() {
  return lowStockProducts().filter(p => {
    const sizes = productSizes(p);
    return sizes.some(s => {
      const st = productSizeStatus(p, s);
      if (st !== 'low' && st !== 'out') return false;
      const variant = productSizeVariantBySize(p, s);
      return !productSizeHasOpenPO(p.id, s, variant ? variant.sizeId : null);
    });
  });
}

/**
 * Low stock products that already have a pending or ordered purchase order en route.
 */
function lowStockProductsOnOrder() {
  return lowStockProducts().filter(p => {
    const sizes = productSizes(p);
    return sizes.some(s => {
      const st = productSizeStatus(p, s);
      if (st !== 'low' && st !== 'out') return false;
      const variant = productSizeVariantBySize(p, s);
      return productSizeHasOpenPO(p.id, s, variant ? variant.sizeId : null);
    });
  });
}

function openPODetail(poId) {
  if (typeof poViewMode !== 'undefined') poViewMode = 'detail';
  if (typeof poDetailId !== 'undefined') poDetailId = poId;
  goTo('purchaseOrders');
}

/* ============================================================
   20. UNIFIED LOW-STOCK MONITORING & PURCHASE ORDER SELECTION SERVICE
   MRGR Color Center — Synchronized across Low-Stock Alerts & Dashboard Watchlist
   ============================================================ */

if (typeof window.generatePONumber !== 'function') {
  window.generatePONumber = function (offset = 0) {
    const now = new Date();
    const dateStr = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    let seqNum = (db && db.purchaseOrders ? db.purchaseOrders.length : 0) + 1 + offset;
    let poNum = `PO-${dateStr}-${String(seqNum).padStart(4, '0')}`;
    while ((db && db.purchaseOrders || []).some(o => o.poNumber === poNum)) {
      seqNum++;
      poNum = `PO-${dateStr}-${String(seqNum).padStart(4, '0')}`;
    }
    return poNum;
  };
}

if (typeof window.poUnitCost !== 'function') {
  window.poUnitCost = function (product, size) {
    const pricePerLiter = product && product.price ? Number(product.price) : 0;
    return Number((pricePerLiter * (Number(size) || 1)).toFixed(2));
  };
}

if (typeof window.poSuggestedQty !== 'function') {
  window.poSuggestedQty = function (p, size = 0) {
    if (!p) return 5;
    const s = size > 0 ? normalizeCanSize(size) : ((productSizes(p) || [])[0] || 1);
    const count = productCanCount(p, s);
    const thresh = productSizeThreshold(p, s);
    const minBatch = s >= 16 ? 1 : (s >= 4 ? 2 : 5);
    const needed = Math.max(minBatch, (thresh * 2) - count);
    return Math.min(1000, needed);
  };
}

function getAlertSizeKey(productId, size, sizeId = null) {
  return sizeId ? String(sizeId) : `${productId}__${normalizeCanSize(size)}`;
}

const LowStockService = {
  selectedKeys: new Set(),

  // 1. Core Stock & PO Detection
  getVariantStockStatus(p, size) {
    const s = normalizeCanSize(size);
    const count = productCanCount(p, s);
    const thresh = productSizeThreshold(p, s);
    if (count <= 0) return 'out'; // Out of Stock
    if (count <= thresh) return 'low'; // Low Stock
    return 'ok'; // In Stock
  },

  getVariantPOStatus(p, size, sizeId = null) {
    const s = normalizeCanSize(size);
    const openOrders = openPOsForProductSize(p.id, s, sizeId);
    if (openOrders.length > 0) {
      return {
        status: 'on_order',
        label: 'On Order',
        poNumber: openOrders[0].poNumber,
        orders: openOrders,
        primaryPO: openOrders[0]
      };
    }
    const stockSt = this.getVariantStockStatus(p, s);
    if (stockSt === 'low' || stockSt === 'out') {
      return {
        status: 'needs_po',
        label: 'Needs PO',
        orders: [],
        primaryPO: null
      };
    }
    return {
      status: 'none',
      label: 'None',
      orders: [],
      primaryPO: null
    };
  },

  isVariantEligible(p, size, sizeId = null) {
    if (!p || (p.status && p.status !== 'active')) return false;
    const s = normalizeCanSize(size);
    const variant = productSizeVariantBySize(p, s);
    if (variant && variant.isActive === false) return false;
    const stockSt = this.getVariantStockStatus(p, s);
    if (stockSt !== 'low' && stockSt !== 'out') return false;
    const poSt = this.getVariantPOStatus(p, s, sizeId || (variant ? variant.sizeId : null));
    if (poSt.status === 'on_order') return false; // Exclude sizes already on order!
    return true;
  },

  // 2. Consistent Status Badges
  renderStockBadge(st) {
    if (st === 'out') {
      return `<span class="badge out" style="background:#FDE8E8; color:#9B1C1C; border:1px solid #F8B4B4; font-weight:700; padding:3px 10px; border-radius:12px; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#E02424;"></span>Out of Stock</span>`;
    }
    if (st === 'low') {
      return `<span class="badge low" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-weight:700; padding:3px 10px; border-radius:12px; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#D97706;"></span>Low Stock</span>`;
    }
    return `<span class="badge ok" style="background:#DEF7EC; color:#03543F; border:1px solid #BCF0DA; font-weight:700; padding:3px 10px; border-radius:12px; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#0E9F6E;"></span>In Stock</span>`;
  },

  renderPOBadge(poSt) {
    if (poSt && poSt.status === 'on_order') {
      const poNum = poSt.poNumber || (poSt.primaryPO && poSt.primaryPO.poNumber) || 'PO';
      const poId = poSt.primaryPO ? poSt.primaryPO.id : '';
      return `<a href="#" onclick="openPODetail('${escapeAttr(poId)}'); return false;" class="badge onorder" style="background:#EBF5FB; color:#1B4F72; border:1px solid #AED6F1; font-weight:700; padding:3px 10px; border-radius:12px; font-size:11.5px; display:inline-flex; align-items:center; gap:4px; text-decoration:none;" title="Click to view Purchase Order ${escapeAttr(poNum)}">
        <span>🚚</span> On Order (${escapeHtml(poNum)})
      </a>`;
    }
    if (poSt && poSt.status === 'needs_po') {
      return `<span class="badge needspo" style="background:#FEF2F2; color:#991B1B; border:1px solid #FCA5A5; font-weight:700; padding:3px 10px; border-radius:12px; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;">
        <span>⚠️</span> Needs PO
      </span>`;
    }
    return `<span class="muted small" style="color:#94A3B8; font-size:11.5px;">—</span>`;
  },

  // 3. Centralized Restock Summary
  getRestockSummary() {
    const products = activeProducts();
    let totalLowSizes = 0;
    let needingPOSizes = 0;
    let onOrderSizes = 0;
    let criticalOutSizes = 0;
    let lowOnlySizes = 0;

    let totalLowProducts = 0;
    let needingPOProducts = 0;
    let onOrderProducts = 0;
    let criticalOutProducts = 0;
    let lowOnlyProducts = 0;

    products.forEach(p => {
      const sizes = productSizes(p);
      let prodHasLow = false;
      let prodHasNeedingPO = false;
      let prodHasOnOrder = false;
      let prodHasCriticalOut = false;

      sizes.forEach(s => {
        const variant = productSizeVariantBySize(p, s);
        const sizeId = variant ? variant.sizeId : null;
        const st = this.getVariantStockStatus(p, s);
        if (st === 'out') {
          prodHasCriticalOut = true;
          criticalOutSizes++;
        } else if (st === 'low') {
          lowOnlySizes++;
        }
        if (st === 'low' || st === 'out') {
          prodHasLow = true;
          totalLowSizes++;
          const poSt = this.getVariantPOStatus(p, s, sizeId);
          if (poSt.status === 'on_order') {
            prodHasOnOrder = true;
            onOrderSizes++;
          } else {
            prodHasNeedingPO = true;
            needingPOSizes++;
          }
        }
      });

      if (prodHasLow) totalLowProducts++;
      if (prodHasNeedingPO) needingPOProducts++;
      if (prodHasOnOrder) onOrderProducts++;
      if (prodHasCriticalOut) criticalOutProducts++;
      if (prodHasLow && !prodHasCriticalOut) lowOnlyProducts++;
    });

    const openPOs = (db && db.purchaseOrders ? db.purchaseOrders : []).filter(o => o.status === 'pending' || o.status === 'ordered' || o.status === 'partial');
    const openPOCount = openPOs.length;

    return {
      totalProducts: products.length,
      healthyProducts: Math.max(0, products.length - totalLowProducts),
      needingPOSizes,
      needsPOSizes: needingPOSizes,
      needingPOProducts,
      needsPOProducts: needingPOProducts,
      onOrderSizes,
      onOrderProducts,
      criticalOutSizes,
      criticalOutProducts,
      lowOnlySizes,
      lowOnlyProducts,
      totalLowSizes,
      totalLowProducts,
      totalProductsAffected: totalLowProducts,
      totalContainerSizesAffected: totalLowSizes,
      openPOCount
    };
  },

  // 4. Eligible Sizes Retrieval
  getProductEligibleSizes(p) {
    if (!p) return [];
    const sizes = productSizes(p);
    const eligible = [];
    sizes.forEach(s => {
      const variant = productSizeVariantBySize(p, s);
      const sizeId = variant ? variant.sizeId : null;
      if (this.isVariantEligible(p, s, sizeId)) {
        eligible.push({
          productId: p.id,
          size: s,
          sizeId: sizeId,
          key: getAlertSizeKey(p.id, s, sizeId),
          product: p,
          variant: variant
        });
      }
    });
    return eligible;
  },

  getAllEligibleSizes(productsList) {
    const result = [];
    (productsList || []).forEach(p => {
      result.push(...this.getProductEligibleSizes(p));
    });
    return result;
  },

  // 5. Hierarchical Selection System
  isSelected(productId, size, sizeId = null) {
    const key = getAlertSizeKey(productId, size, sizeId);
    return this.selectedKeys.has(key);
  },

  isKeySelected(key) {
    return this.selectedKeys.has(key);
  },

  toggleSize(productId, size, sizeId = null, forceState = null) {
    const p = productById(productId);
    if (!p) return;
    const s = normalizeCanSize(size);
    if (!this.isVariantEligible(p, s, sizeId)) return;
    const key = getAlertSizeKey(productId, s, sizeId);
    const shouldSelect = forceState !== null ? Boolean(forceState) : !this.selectedKeys.has(key);
    if (shouldSelect) {
      this.selectedKeys.add(key);
    } else {
      this.selectedKeys.delete(key);
    }
    this.syncUI();
  },

  toggleProduct(productId, forceState = null) {
    const p = productById(productId);
    if (!p) return;
    const eligible = this.getProductEligibleSizes(p);
    if (!eligible.length) return;

    const allSelected = eligible.every(e => this.selectedKeys.has(e.key));
    const shouldSelect = forceState !== null ? Boolean(forceState) : !allSelected;

    eligible.forEach(e => {
      if (shouldSelect) {
        this.selectedKeys.add(e.key);
      } else {
        this.selectedKeys.delete(e.key);
      }
    });
    this.syncUI();
  },

  getProductSelectionState(productId) {
    const p = productById(productId);
    if (!p) return 'unchecked';
    const eligible = this.getProductEligibleSizes(p);
    if (!eligible.length) return 'unchecked';
    const count = eligible.filter(e => this.selectedKeys.has(e.key)).length;
    if (count === 0) return 'unchecked';
    if (count === eligible.length) return 'checked';
    return 'indeterminate';
  },

  selectAll(eligibleList) {
    const pool = (Array.isArray(eligibleList) && eligibleList.length)
      ? eligibleList
      : (typeof getAlertsList === 'function' ? this.getAllEligibleSizes(getAlertsList()) : this.getAllEligibleSizes(lowStockProducts()));
    pool.forEach(e => {
      this.selectedKeys.add(e.key);
    });
    this.syncUI();
  },

  selectCurrentPage(pageEligibleList) {
    (pageEligibleList || []).forEach(e => {
      this.selectedKeys.add(e.key);
    });
    this.syncUI();
  },

  clear() {
    this.selectedKeys.clear();
    this.syncUI();
  },

  getSelectedSummary(referenceList = null) {
    const pool = referenceList ? referenceList : activeProducts();
    const eligible = this.getAllEligibleSizes(pool);
    const eligibleMap = new Map();
    eligible.forEach(e => eligibleMap.set(e.key, e));

    const selectedEligible = [];
    const selectedProdIds = new Set();

    this.selectedKeys.forEach(k => {
      if (eligibleMap.has(k)) {
        const item = eligibleMap.get(k);
        selectedEligible.push(item);
        selectedProdIds.add(item.productId);
      } else if (typeof productSizeById === 'function') {
        const v = productSizeById(k);
        if (v && v.product && (v.product.status === 'active' || !v.product.status)) {
          const s = normalizeCanSize(v.containerSize);
          if (this.isVariantEligible(v.product, s, v.sizeId)) {
            selectedEligible.push({
              productId: v.product.id,
              size: s,
              sizeId: v.sizeId,
              key: k,
              product: v.product,
              variant: v
            });
            selectedProdIds.add(v.product.id);
          }
        }
      }
    });

    return {
      sizeCount: selectedEligible.length,
      productCount: selectedProdIds.size,
      items: selectedEligible
    };
  },

  getSelectionCount(referenceList = null) {
    const s = this.getSelectedSummary(referenceList);
    return { prodCount: s.productCount, sizeCount: s.sizeCount, productCount: s.productCount };
  },

  syncUI() {
    const summary = this.getSelectedSummary();
    const count = summary.sizeCount;
    const prodCount = summary.productCount;
    const sizeWord = count === 1 ? '1 Size' : `${count} Sizes`;

    // 1. Alerts page badge & create PO button
    const alertsBadge = document.getElementById('alerts-po-badge');
    if (alertsBadge) alertsBadge.textContent = count;

    const alertsBtn = document.getElementById('btn-create-po-alerts');
    if (alertsBtn) {
      alertsBtn.innerHTML = `📋 Create Purchase Order (${sizeWord})`;
      alertsBtn.disabled = count === 0;
      if (count > 0) {
        alertsBtn.classList.add('btn-primary-highlight');
        alertsBtn.classList.remove('btn-disabled');
      } else {
        alertsBtn.classList.remove('btn-primary-highlight');
        alertsBtn.classList.add('btn-disabled');
      }
    }

    // 2. Selection summary labels (Alerts page only)
    const alertsSum = document.getElementById('alerts-selection-summary');
    if (alertsSum) {
      alertsSum.innerHTML = `Selected Products: <b>${prodCount}</b> &nbsp;|&nbsp; Selected Container Sizes: <b>${count}</b>`;
    }

    // 3. Alerts page size checkboxes & row highlighting
    document.querySelectorAll('.alert-size-chk').forEach(chk => {
      const isChecked = this.selectedKeys.has(chk.value);
      chk.checked = isChecked;
      const tr = chk.closest('tr');
      if (tr) {
        if (isChecked) tr.classList.add('row-selected');
        else tr.classList.remove('row-selected');
      }
    });

    // 4. Alerts page parent product checkboxes with indeterminate support
    document.querySelectorAll('.alert-prod-chk').forEach(chk => {
      const pid = chk.getAttribute('data-product-id') || chk.value;
      const st = this.getProductSelectionState(pid);
      if (st === 'checked') {
        chk.checked = true;
        chk.indeterminate = false;
      } else if (st === 'indeterminate') {
        chk.checked = false;
        chk.indeterminate = true;
      } else {
        chk.checked = false;
        chk.indeterminate = false;
      }
    });

    // 5. Alerts page master header checkbox
    const chkAllAlerts = document.getElementById('chk-all-alerts');
    if (chkAllAlerts && typeof getAlertsList === 'function') {
      const list = getAlertsList();
      const elSizes = this.getAllEligibleSizes(list);
      const selInList = elSizes.filter(e => this.selectedKeys.has(e.key)).length;
      if (elSizes.length > 0 && selInList === elSizes.length) {
        chkAllAlerts.checked = true;
        chkAllAlerts.indeterminate = false;
      } else if (selInList > 0 && selInList < elSizes.length) {
        chkAllAlerts.checked = false;
        chkAllAlerts.indeterminate = true;
      } else {
        chkAllAlerts.checked = false;
        chkAllAlerts.indeterminate = false;
      }
    }

    // 6. Floating quick action bar (Alerts page only)
    const bar = document.getElementById('alerts-floating-bar');
    if (bar) {
      if (count > 0) {
        bar.style.display = 'flex';
        const label = document.getElementById('alerts-floating-label');
        if (label) {
          label.textContent = `${count} container size${count === 1 ? '' : 's'} across ${prodCount} product${prodCount === 1 ? '' : 's'} selected for purchase order`;
        }
      } else {
        bar.style.display = 'none';
      }
    }
  },

  // 6. Unified Purchase Order Creation & Confirmation Service
  openPOCreationModal({ items = null, isSingle = false } = {}) {
    let targetItems = items;
    if (!targetItems) {
      const summary = this.getSelectedSummary();
      targetItems = summary.items;
    }

    if (!targetItems || !targetItems.length) {
      showToast('Please select at least one low-stock container size first.', 'error');
      return;
    }

    // 1. Re-validate each item against live database
    const validatedItems = [];
    const skippedItems = [];

    targetItems.forEach(it => {
      const p = productById(it.productId);
      if (!p || (p.status && p.status !== 'active')) {
        skippedItems.push(`Product "${it.productId}" is inactive or unavailable.`);
        return;
      }
      const s = normalizeCanSize(it.size);
      const variant = productSizeVariantBySize(p, s);
      const sizeId = variant ? variant.sizeId : it.sizeId;

      // Prevent duplicate active PO lines
      const openOrders = openPOsForProductSize(p.id, s, sizeId);
      if (openOrders.length > 0) {
        skippedItems.push(`<b>${escapeHtml(p.name)} (${fmtSize(s)})</b> already on order (${openOrders[0].poNumber}).`);
        return;
      }

      const st = this.getVariantStockStatus(p, s);
      if (st !== 'low' && st !== 'out') {
        skippedItems.push(`<b>${escapeHtml(p.name)} (${fmtSize(s)})</b> stock is now healthy (${productCanCount(p, s)} cans).`);
        return;
      }

      // Resolve supplier
      const suppliers = suppliersForProduct(p.id).filter(sup => sup.status === 'active');
      const supplier = suppliers[0] || (db.suppliers || []).find(sup => sup.status === 'active' && (sup.productIds || []).includes(p.id)) || (db.suppliers || []).find(sup => sup.status === 'active');
      if (!supplier) {
        skippedItems.push(`No active supplier found for "${escapeHtml(p.name)}".`);
        return;
      }

      const suggestedQty = poSuggestedQty(p, s);
      const unitCost = poUnitCost(p, s);

      validatedItems.push({
        productId: p.id,
        product_id: p.productId || p.id,
        productName: p.name,
        brand: p.brand,
        color: p.color || '-',
        colorHex: getProductHex(p),
        size: s,
        sizeId: sizeId,
        key: getAlertSizeKey(p.id, s, sizeId),
        stock: productCanCount(p, s),
        threshold: productSizeThreshold(p, s),
        suggestedQty: Math.max(1, suggestedQty),
        unitCost: unitCost,
        supplier: supplier
      });
    });

    if (skippedItems.length > 0) {
      console.warn('Low-Stock PO Creation Validation Warnings:', skippedItems);
      if (!validatedItems.length) {
        showToast(`Cannot create purchase order:<br>${skippedItems.join('<br>')}`, 'error');
        return;
      }
    }

    // 2. Group items by supplier
    const supplierGroups = new Map();
    validatedItems.forEach(it => {
      const supId = it.supplier.id;
      if (!supplierGroups.has(supId)) {
        supplierGroups.set(supId, {
          supplier: it.supplier,
          items: []
        });
      }
      supplierGroups.get(supId).items.push(it);
    });

    window._poModalGroups = Array.from(supplierGroups.values());

    // 3. Render Confirmation Dialog
    const groups = window._poModalGroups;
    let grandTotal = 0;
    groups.forEach(g => {
      g.items.forEach(it => {
        grandTotal += it.suggestedQty * it.unitCost;
      });
    });

    const bodyHtml = `
      <div style="font-size:13px; color:var(--ink-soft); margin-bottom:14px; line-height:1.5;">
        ${skippedItems.length ? `
          <div class="alert-banner warning" style="margin-bottom:12px; font-size:12px; padding:8px 12px; border-left:3px solid var(--mustard);">
            ⚠️ Some items were excluded: ${skippedItems.join(' · ')}
          </div>
        ` : ''}
        Review and confirm restock details for <b>${validatedItems.length} container size(s)</b> across <b>${groups.length} supplier order${groups.length === 1 ? '' : 's'}</b>. Quantities default to calculated suggested amounts and can be adjusted below.
      </div>

      <div style="display:flex; flex-direction:column; gap:16px; max-height:55vh; overflow-y:auto; padding-right:4px;">
        ${groups.map((g, gIdx) => {
      let groupSubtotal = 0;
      g.items.forEach(it => { groupSubtotal += it.suggestedQty * it.unitCost; });
      return `
            <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:var(--radius-sm); padding:14px;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px; border-bottom:1px solid var(--line); padding-bottom:8px;">
                <div>
                  <span style="font-weight:700; color:var(--teal-dark); font-size:14px;">🏢 Supplier: ${escapeHtml(g.supplier.name)}</span>
                  <span class="muted small" style="margin-left:8px;">(${g.items.length} item${g.items.length === 1 ? '' : 's'})</span>
                </div>
                <div style="font-size:12px; color:var(--ink-soft);">
                  ${g.supplier.contact ? `Contact: <b>${escapeHtml(g.supplier.contact)}</b>` : ''}
                  ${g.supplier.phone ? ` · Tel: ${escapeHtml(g.supplier.phone)}` : ''}
                </div>
              </div>

              <div class="table-scroll" style="overflow-x:auto;">
                <table class="table-grouped-product" style="width:100%; font-size:12px;">
                  <thead>
                    <tr style="background:#F2EDE4;">
                      <th style="text-align:left;">Product Name</th>
                      <th style="text-align:left;">Color Variant</th>
                      <th style="text-align:left;">Supplier</th>
                      <th style="text-align:center;">Container Size</th>
                      <th style="text-align:right;">Current Stock</th>
                      <th style="text-align:right;">Min Threshold</th>
                      <th style="text-align:center; width:110px;">Suggested Order Qty</th>
                      <th style="text-align:right; width:100px;">Estimated Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${g.items.map((it, itIdx) => {
        const lineTotal = it.suggestedQty * it.unitCost;
        return `
                        <tr style="border-bottom:1px solid #EFEAE0;">
                          <td style="font-weight:700; color:var(--ink);">
                            ${escapeHtml(it.productName)}
                            <div class="muted small" style="font-weight:400; font-size:11px;">${escapeHtml(it.brand)}</div>
                          </td>
                          <td>
                            <div style="display:inline-flex; align-items:center; gap:5px;">
                              <span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${it.colorHex}; border:1px solid rgba(0,0,0,0.2);"></span>
                              <span style="font-weight:600; font-size:11.5px;">${escapeHtml(it.color)}</span>
                              <code style="font-size:10px; color:var(--teal);">(${it.colorHex})</code>
                            </div>
                          </td>
                          <td style="color:var(--ink-soft); font-size:11.5px;">${escapeHtml(g.supplier.name)}</td>
                          <td style="text-align:center;">
                            <span class="badge" style="background:#FFF; border:1px solid #DDD; font-weight:700; padding:2px 7px;">${fmtSize(it.size)}</span>
                          </td>
                          <td style="text-align:right; font-weight:700; color:${it.stock <= 0 ? 'var(--danger)' : '#B45309'};">
                            ${it.stock} can${it.stock === 1 ? '' : 's'}
                          </td>
                          <td style="text-align:right; font-weight:600; color:var(--ink);">
                            ${it.threshold} can${it.threshold === 1 ? '' : 's'}
                          </td>
                          <td style="text-align:center;">
                            <input type="number"
                                   id="po-qty-${escapeAttr(it.key)}"
                                   class="po-modal-qty-input"
                                   min="1"
                                   max="1000"
                                   value="${it.suggestedQty}"
                                   data-gidx="${gIdx}"
                                   data-itidx="${itIdx}"
                                   data-key="${escapeAttr(it.key)}"
                                   data-unit-cost="${it.unitCost}"
                                   oninput="LowStockService.updateModalTotals()"
                                   style="width:75px; padding:4px 6px; text-align:right; font-weight:700; font-size:12.5px; border:1px solid var(--line); border-radius:4px; background:#fff;">
                          </td>
                          <td style="text-align:right; font-weight:700; color:var(--teal-dark);" id="po-line-total-${escapeAttr(it.key)}">
                            ${peso(lineTotal)}
                          </td>
                        </tr>
                      `;
      }).join('')}
                  </tbody>
                </table>
              </div>

              <div style="display:flex; justify-content:flex-end; align-items:center; gap:8px; margin-top:8px; font-size:12.5px;">
                <span class="muted">Supplier Order Subtotal:</span>
                <b style="color:var(--teal-dark); font-size:13.5px;" id="po-group-subtotal-${gIdx}">${peso(groupSubtotal)}</b>
              </div>
            </div>
          `;
    }).join('')}

        <div class="field" style="margin-top:4px;">
          <label style="font-weight:600; font-size:12px; margin-bottom:4px; display:block;">Order Notes / Instructions (Optional)</label>
          <textarea id="po-confirm-notes" rows="2" style="width:100%; font-size:12px; padding:6px 10px; border:1px solid var(--line); border-radius:var(--radius-sm);" placeholder="Add notes for this restock order..."></textarea>
        </div>
      </div>
    `;

    const footHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:12px;">
        <div style="font-size:13px;">
          <span class="muted">Total Order Amount:</span>
          <b style="font-size:16px; color:var(--teal); margin-left:4px;" id="po-confirm-grand-total">${peso(grandTotal)}</b>
          <span class="muted small" style="margin-left:6px;">(${groups.length} PO${groups.length === 1 ? '' : 's'}, ${validatedItems.length} Sizes)</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
          <button type="button" class="btn primary" id="btn-submit-po-confirm" onclick="LowStockService.executePOCreation()" style="background:#1F6F6B; color:#fff; font-weight:700; box-shadow:0 2px 6px rgba(31,111,107,0.3);">
            ✓ Confirm &amp; Create Purchase Order${groups.length > 1 ? 's' : ''} &rarr;
          </button>
        </div>
      </div>
    `;

    openModal('📋 Confirm Purchase Order Creation', bodyHtml, footHtml, 'modal-lg');
  },

  updateModalTotals() {
    const groups = window._poModalGroups || [];
    let grandTotal = 0;
    groups.forEach((g, gIdx) => {
      let groupSubtotal = 0;
      g.items.forEach((it, itIdx) => {
        const input = document.getElementById(`po-qty-${it.key}`);
        let q = input ? parseInt(input.value, 10) : it.suggestedQty;
        if (isNaN(q) || q < 1) q = 1;
        it.suggestedQty = q;
        const lineTotal = q * it.unitCost;
        groupSubtotal += lineTotal;
        const lineEl = document.getElementById(`po-line-total-${it.key}`);
        if (lineEl) lineEl.textContent = peso(lineTotal);
      });
      grandTotal += groupSubtotal;
      const subEl = document.getElementById(`po-group-subtotal-${gIdx}`);
      if (subEl) subEl.textContent = peso(groupSubtotal);
    });
    const grandEl = document.getElementById('po-confirm-grand-total');
    if (grandEl) grandEl.textContent = peso(grandTotal);
  },

  async executePOCreation() {
    const btn = document.getElementById('btn-submit-po-confirm');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving Purchase Order(s)...';
    }

    const groups = window._poModalGroups || [];
    if (!groups.length) {
      closeModal();
      return;
    }

    const notesEl = document.getElementById('po-confirm-notes');
    const customNotes = notesEl ? notesEl.value.trim() : '';

    const isAdmin = currentUser && currentUser.role === 'admin';
    const status = isAdmin ? 'ordered' : 'pending';
    const creatorName = (currentUser && currentUser.name) || (currentUser && currentUser.username) || 'Staff';

    const createdPOs = [];
    let seqOffset = 0;

    for (const g of groups) {
      const items = [];
      let totalAmount = 0;

      for (const it of g.items) {
        const input = document.getElementById(`po-qty-${it.key}`);
        let q = input ? parseInt(input.value, 10) : it.suggestedQty;
        if (isNaN(q) || q < 1) q = 1;
        if (q > 1000) q = 1000;

        const lineCost = Number((q * it.unitCost).toFixed(2));
        totalAmount += lineCost;

        items.push({
          productId: it.product_id,
          product_id: it.product_id,
          sizeId: it.sizeId || null,
          size_id: it.sizeId || null,
          productName: it.productName,
          brand: it.brand,
          color: it.color,
          size: it.size,
          qty: q,
          pricePerLiter: it.unitCost / (it.size || 1),
          unitCost: it.unitCost
        });
      }

      if (!items.length) continue;

      const poNum = window.generatePONumber(seqOffset++);
      const poNotes = customNotes
        ? `${customNotes} · Restock order for ${items.length} size(s)`
        : `Low-stock restock order for ${items.length} container size(s)`;

      const po = {
        id: uid('po'),
        poNumber: poNum,
        supplierId: g.supplier.id,
        supplierName: g.supplier.name,
        orderDate: nowISO(),
        expectedDate: null, // Offline system
        status: status,
        totalAmount: Number(totalAmount.toFixed(2)),
        items: items,
        itemsJson: JSON.stringify(items),
        notes: poNotes,
        createdBy: creatorName,
        receivedAt: null
      };

      if (!db.purchaseOrders) db.purchaseOrders = [];
      db.purchaseOrders.push(po);
      createdPOs.push(po);

      // Audit Logging
      if (typeof logAudit === 'function') {
        const itemSummary = items.map(it => `${it.productName} (${it.qty} × ${fmtSize(it.size)})`).join(', ');
        logAudit(
          isAdmin ? 'PO_CREATE' : 'PO_SUBMIT',
          'Purchase Order',
          `${isAdmin ? 'Created & approved' : 'Submitted'} Purchase Order ${po.poNumber} for ${g.supplier.name} (${items.length} size${items.length === 1 ? '' : 's'}, Total: ${peso(po.totalAmount)})`,
          {
            entityName: po.poNumber,
            fieldChanged: 'Purchase Order Status',
            oldValue: 'None',
            newValue: isAdmin ? `Approved / Ordered (${peso(po.totalAmount)})` : `Submitted / Pending Approval (${peso(po.totalAmount)})`,
            referenceNo: po.poNumber,
            reason: poNotes || `Order for ${g.supplier.name}: ${itemSummary}`
          }
        );
      }
    }

    try {
      // Physical stock is NOT increased here. Physical stock increases only upon receiving.
      await saveDB();

      // Clear completed selections
      this.clear();
      closeModal();

      const poNumbers = createdPOs.map(o => o.poNumber).join(', ');
      showToast(
        isAdmin
          ? `Purchase Order ${poNumbers} created and marked as Ordered.`
          : `Purchase Order ${poNumbers} submitted for Administrator approval.`,
        'ok'
      );

      // Refresh UI immediately
      if (typeof renderPage === 'function') {
        renderPage();
      } else if (typeof renderApp === 'function') {
        renderApp();
      }

      return { success: true, count: createdPOs.length, createdPOs };
    } catch (err) {
      console.error('PO Creation failed:', err);
      showToast('Could not save purchase order to database.', 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Confirm & Create Purchase Order';
      }
      return { success: false, error: err.message };
    }
  },

  createPOForSingleSize(productId, size, sizeId = null) {
    const p = productById(productId);
    if (!p) {
      showToast('Product not found.', 'error');
      return;
    }
    const s = normalizeCanSize(size);
    const variant = productSizeVariantBySize(p, s);
    const actualSizeId = sizeId || (variant ? variant.sizeId : null);

    const openOrders = openPOsForProductSize(p.id, s, actualSizeId);
    if (openOrders.length > 0) {
      showToast(`Cannot create purchase order: <b>${escapeHtml(p.name)} (${fmtSize(s)})</b> is already on order in ${openOrders[0].poNumber}.`, 'error');
      return;
    }

    const st = this.getVariantStockStatus(p, s);
    if (st !== 'low' && st !== 'out') {
      showToast(`Stock for ${escapeHtml(p.name)} (${fmtSize(s)}) is healthy. Restocking not required.`, 'ok');
      return;
    }

    const item = {
      productId: p.id,
      size: s,
      sizeId: actualSizeId,
      key: getAlertSizeKey(p.id, s, actualSizeId),
      product: p,
      variant: variant
    };

    this.openPOCreationModal({ items: [item], isSingle: true });
  },

  createPOFromSelected(options = {}) {
    this.openPOCreationModal(options);
  }
};

window.LowStockService = LowStockService;

// Delegate getRestockSummary to LowStockService
function getRestockSummary() {
  return LowStockService.getRestockSummary();
}

/**
 * Movements recorded today based on client local time and Manila date string.
 */
function getMovementsToday() {
  const today = todayISO();
  return (db.movements || []).filter(m => {
    if (!m || !m.date) return false;
    const mDateStr = toLocalISODate(new Date(m.date));
    return mDateStr === today || (typeof m.date === 'string' && m.date.slice(0, 10) === today);
  });
}

function getMovementsTodaySummary() {
  const todayMoves = getMovementsToday();
  let receiving = 0;
  let sale = 0;
  let adjustment = 0;
  let other = 0;
  todayMoves.forEach(m => {
    const t = String(m.type || '').toLowerCase();
    if (t === 'receiving') receiving++;
    else if (t === 'sale') sale++;
    else if (t === 'adjustment') adjustment++;
    else other++;
  });
  return {
    total: todayMoves.length,
    receiving,
    sale,
    adjustment,
    other,
    movements: todayMoves
  };
}

/**
 * Extracts reference number (OR, PO, ADJ, or Receipt) from a movement.
 */
function extractMovementReference(m) {
  if (!m) return null;
  const notes = m.lines ? m.lines.map(l => l.note).filter(Boolean) : [m.note].filter(Boolean);
  const combined = notes.join(' ') + ' ' + (m.note || '');

  const orMatch = combined.match(/\b(OR-\d+(?:-\d+)?)\b/i);
  if (orMatch) {
    return { type: 'or', ref: orMatch[1].toUpperCase() };
  }

  const poMatch = combined.match(/\b(PO-\d+(?:-\d+)?)\b/i);
  if (poMatch) {
    return { type: 'po', ref: poMatch[1].toUpperCase() };
  }

  const adjMatch = combined.match(/\b(ADJ-\d+(?:-\d+)?)\b/i);
  if (adjMatch) {
    return { type: 'adj', ref: adjMatch[1].toUpperCase() };
  }

  const recMatch = combined.match(/Receipt:\s*(\S+)/i);
  if (recMatch) {
    return { type: 'rec', ref: recMatch[1] };
  }

  return null;
}

/**
 * Extracts stock balance transition (Previous → Current) from movement notes.
 */
function extractMovementBalance(noteStr) {
  if (!noteStr) return null;
  const str = String(noteStr);
  const canMatch = str.match(/(\d+(?:\.\d+)?L\s+Cans:\s*(\d+)\s*(?:→|->)\s*(\d+))/i);
  const stockMatch = str.match(/Stock:\s*([\d.]+L?)\s*(?:→|->)\s*([\d.]+L?)/i);
  const openMatch = str.match(/Opened(?:\s*Stock)?:\s*([\d.]+L?)\s*(?:→|->)\s*([\d.]+L?)/i);

  if (!canMatch && !stockMatch && !openMatch) {
    return null;
  }

  let cansHtml = '';
  let prevCans = null;
  let currCans = null;
  if (canMatch) {
    prevCans = parseInt(canMatch[2], 10);
    currCans = parseInt(canMatch[3], 10);
    cansHtml = `<div class="balance-primary"><b>${prevCans}</b> <span class="balance-arrow">→</span> <b>${currCans}</b> <small>cans</small></div>`;
  }

  let litersHtml = '';
  let prevL = null;
  let currL = null;
  if (stockMatch) {
    prevL = stockMatch[1].replace(/L/i, '') + ' L';
    currL = stockMatch[2].replace(/L/i, '') + ' L';
    litersHtml = `<div class="balance-secondary">${prevL} → ${currL}</div>`;
  } else if (openMatch) {
    prevL = openMatch[1].replace(/L/i, '') + ' L';
    currL = openMatch[2].replace(/L/i, '') + ' L';
    litersHtml = `<div class="balance-secondary">Opened: ${prevL} → ${currL}</div>`;
  }

  return {
    hasData: true,
    prevCans,
    currCans,
    prevL,
    currL,
    html: `<div class="balance-cell-content">${cansHtml || litersHtml}${cansHtml && litersHtml ? litersHtml : ''}</div>`
  };
}

