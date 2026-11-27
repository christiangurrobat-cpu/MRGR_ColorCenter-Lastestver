/* ============================================================
   20. BOOT
   ============================================================ */
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  if (typeof AbortController === 'undefined') {
    return fetch(url, options);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function renderBootErrorScreen(message) {
  const root = document.getElementById('app');
  if (!root) return;
  const safeMsg = (typeof escapeHtml === 'function')
    ? escapeHtml(message || 'Unable to connect to local database or initialize system.')
    : String(message || 'Unable to initialize system.').replace(/[<>&"]/g, '');
  root.innerHTML = `
    <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; background:#F6F3EC; font-family:Inter,system-ui,sans-serif;">
      <div style="max-width:440px; width:100%; background:#fff; border:1px solid #E2DDD2; border-radius:12px; padding:28px; text-align:center; box-shadow:0 6px 24px rgba(0,0,0,0.06);">
        <div style="font-size:34px; margin-bottom:10px;">⚠️</div>
        <h2 style="margin:0 0 8px 0; font-size:18px; color:#1E293B;">System Startup Interrupted</h2>
        <p style="margin:0 0 18px 0; font-size:13px; color:#64748B; line-height:1.5;">${safeMsg}</p>
        <div style="display:flex; gap:10px; justify-content:center;">
          <button type="button" onclick="window.location.reload()" style="padding:10px 18px; border:none; border-radius:8px; background:#1F6F6B; color:#fff; font-weight:600; cursor:pointer;">↻ Retry Loading</button>
          <button type="button" onclick="window.location.href='?login=1'" style="padding:10px 18px; border:1px solid #CBD5E1; border-radius:8px; background:#fff; color:#334155; font-weight:600; cursor:pointer;">Go to Login</button>
        </div>
      </div>
    </div>
  `;
}

async function init() {
  try {
    let sessionResolved = false;
    const initialRoute = (typeof parseRouteFromLocation === 'function') ? parseRouteFromLocation() : null;

    // 0. If launched via start-app.vbs (?login=1) or /login.php, force default to Login Screen
    const urlParams = new URLSearchParams(window.location.search);
    const isForcedLogin = urlParams.has('login') || /\/login\.php$/i.test(window.location.pathname);
    if (isForcedLogin) {
      currentUser = null;
      currentPage = null;
      if (typeof clearNavStateStorage === 'function') clearNavStateStorage();
      if (typeof resetAllModuleNavigationStates === 'function') resetAllModuleNavigationStates();
      try { localStorage.removeItem(SESSION_KEY); } catch (e) { }
      try { localStorage.removeItem(DB_KEY); } catch (e) { }
      try { await fetchWithTimeout('api/auth.php?action=logout', { method: 'POST' }, 5000); } catch (e) { }
      try {
        const cleanPath = window.location.pathname.replace(/\/login\.php$/i, '/') || '/';
        window.history.replaceState({}, document.title, cleanPath);
      } catch (e) { }
      sessionResolved = true;
    }

    // 1. Verify authenticated session via backend auth endpoint FIRST
    if (!sessionResolved) {
      try {
        const authRes = await fetchWithTimeout('api/auth.php?action=session', {}, 8000);
        if (authRes.ok) {
          const authData = await authRes.json();
          if (authData && authData.authenticated && authData.user && authData.user.status === 'active') {
            currentUser = authData.user;
            await storage.set(SESSION_KEY, JSON.stringify({ userId: currentUser.id, username: currentUser.username, name: currentUser.name, role: currentUser.role }));
            sessionResolved = true;
          } else if (authData && authData.authenticated === false) {
            currentUser = null;
            try { localStorage.removeItem(SESSION_KEY); } catch (e) { }
            try { localStorage.removeItem(DB_KEY); } catch (e) { }
            sessionResolved = true;
          }
        }
      } catch (e) {
        console.warn('Backend session verification unavailable (offline mode)', e);
      }
    }

    // 2. Fallback to cached local session if offline
    if (!sessionResolved) {
      try {
        const session = await storage.get(SESSION_KEY);
        const savedUser = session ? JSON.parse(session) : null;
        if (savedUser) {
          currentUser = { id: savedUser.userId, username: savedUser.username, name: savedUser.name || savedUser.username || 'User', role: savedUser.role };
        }
      } catch (e) {
        try { localStorage.removeItem(SESSION_KEY); } catch (error) { }
      }
    }

    // 3. Load DB only when authenticated (avoids unauthenticated 401 fetch/save on login screen)
    if (currentUser) {
      await loadDB();
    }

    // 4. Restore current module, route, subpage, and state (or save deep-link if unauthenticated)
    if (currentUser) {
      if (typeof restoreAuthenticatedRouteOnBoot === 'function') {
        restoreAuthenticatedRouteOnBoot(initialRoute);
      } else {
        currentPage = defaultPageFor(currentUser.role);
      }
      if (currentPage === 'pos' && typeof posLoadBatchStatus === 'function') {
        try { await posLoadBatchStatus(false); } catch (e) { console.warn('Initial POS batch load failed:', e); }
      }
    } else if (!isForcedLogin && initialRoute && initialRoute.hasExplicitPage) {
      try {
        sessionStorage.setItem(PENDING_AUTH_ROUTE_KEY, JSON.stringify({
          rawPage: initialRoute.rawPage,
          search: window.location.search || ''
        }));
      } catch (e) { }
    }

    renderApp();
  } catch (err) {
    console.error('Fatal boot error:', err);
    renderBootErrorScreen((err && err.message) ? err.message : 'Unexpected startup error. Make sure the local PHP server and MariaDB are running.');
  }
}
init();
