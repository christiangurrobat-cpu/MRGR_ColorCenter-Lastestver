/* ============================================================
   20. BOOT
   ============================================================ */
async function init() {
  await loadDB();
  try {
    const session = await storage.get(SESSION_KEY);
    const savedUser = session ? JSON.parse(session) : null;
    const user = savedUser && db.users.find(u => u.id === savedUser.userId && u.status === 'active');
    if (user) {
      currentUser = user;
      currentPage = defaultPageFor(user.role);
    } else if (savedUser) {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (e) {
    try { localStorage.removeItem(SESSION_KEY); } catch (error) { }
  }
  renderApp();
}
init();
