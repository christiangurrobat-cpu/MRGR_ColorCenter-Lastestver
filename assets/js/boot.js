/* ============================================================
   20. BOOT
   ============================================================ */
async function init() {
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
    try { await fetch('api/auth.php?action=logout', { method: 'POST' }); } catch (e) { }
    try {
      const cleanPath = window.location.pathname.replace(/\/login\.php$/i, '/') || '/';
      window.history.replaceState({}, document.title, cleanPath);
    } catch (e) { }
    sessionResolved = true;
  }

  // 1. Verify authenticated session via backend auth endpoint FIRST
  if (!sessionResolved) {
    try {
      const authRes = await fetch('api/auth.php?action=session');
      if (authRes.ok) {
        const authData = await authRes.json();
        if (authData && authData.authenticated && authData.user && authData.user.status === 'active') {
          currentUser = authData.user;
          await storage.set(SESSION_KEY, JSON.stringify({ userId: currentUser.id, username: currentUser.username, role: currentUser.role }));
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
        currentUser = { id: savedUser.userId, username: savedUser.username, role: savedUser.role };
      }
    } catch (e) {
      try { localStorage.removeItem(SESSION_KEY); } catch (error) { }
    }
  }

  // 3. Load DB with authenticated session context
  await loadDB();

  // 4. Restore current module, route, subpage, and state (or save deep-link if unauthenticated)
  if (currentUser) {
    if (typeof restoreAuthenticatedRouteOnBoot === 'function') {
      restoreAuthenticatedRouteOnBoot(initialRoute);
    } else {
      currentPage = defaultPageFor(currentUser.role);
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
}
init();
