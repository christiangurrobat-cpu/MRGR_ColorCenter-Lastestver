/* ============================================================
   16. USER MANAGEMENT (admin only)
   ============================================================ */
function usersPage() {
  return `
  <div class="panel">
<div class="panel-head row"><h3>Users</h3><div class="spacer"></div><button class="btn small" onclick="openUserModal()">+ Add User</button></div>
<div class="panel-body tight table-scroll">
  <table>
    <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
    <tbody>
      ${db.users.map(u => `
        <tr>
          <td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.username)}</td>
          <td><span class="badge role-${u.role}">${{ admin: 'Administrator', cashier: 'Cashier', staff: 'Inventory Staff' }[u.role] || escapeHtml(u.role || 'User')}</span></td>
          <td>${u.status === 'active' ? '<span class="badge ok">Active</span>' : '<span class="badge inactive">Inactive</span>'}</td>
          <td class="row">
            <button class="btn ghost small" onclick="openUserModal('${u.id}')">Edit</button>
            ${u.id !== currentUser.id ? `<button class="btn ghost small" onclick="toggleUserStatus('${u.id}')">${u.status === 'active' ? 'Deactivate' : 'Activate'}</button>` : `<span class="small muted">(you)</span>`}
          </td>
        </tr>`).join('')}
    </tbody>
  </table>
</div>
  </div>`;
}
function openUserModal(id) {
  const u = id ? db.users.find(x => x.id === id) : null;
  openModal(u ? 'Edit User' : 'Add User', `
<form id="user-form" onsubmit="return submitUser(event, ${u ? `'${u.id}'` : 'null'})">
  <div class="form-grid">
    <div class="field"><label>Full Name</label><input id="uf-name" value="${u ? escapeHtml(u.name) : ''}" required></div>
    <div class="field"><label>Username</label><input id="uf-username" value="${u ? escapeHtml(u.username) : ''}" required></div>
    <div class="field"><label>${u ? 'New Password (leave blank to keep current)' : 'Password'}</label><input id="uf-password" type="text" ${u ? '' : 'required'}></div>
    <div class="field"><label>Role</label>
      <select id="uf-role">
        <option value="admin" ${u && u.role === 'admin' ? 'selected' : ''}>Administrator</option>
        <option value="cashier" ${u && u.role === 'cashier' ? 'selected' : ''}>Cashier</option>
        <option value="staff" ${u && u.role === 'staff' ? 'selected' : ''}>Inventory Staff</option>
      </select>
    </div>
  </div>
</form>`,
    `<button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" onclick="document.getElementById('user-form').requestSubmit()">Save User</button>`
  );
}
async function submitUser(e, id) {
  e.preventDefault();
  const username = document.getElementById('uf-username').value.trim();
  const dupe = db.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.id !== id);
  if (dupe) { showToast('That username is already taken.', 'error'); return false; }
  const password = document.getElementById('uf-password').value;
  const data = { name: document.getElementById('uf-name').value.trim(), username, role: document.getElementById('uf-role').value };
  if (id) {
    const u = db.users.find(x => x.id === id);
    if (!u) { showToast('User not found.', 'error'); return false; }
    Object.assign(u, data);
    if (password) u.password = password;
    if (currentUser && currentUser.id === id) {
      Object.assign(currentUser, u);
    }
    logAudit('USER_UPDATE', 'User', `Updated user ${data.username} (${data.role})${password ? ' - password changed' : ''}`);
    showToast('User updated.');
  } else {
    db.users.push({ id: uid('u'), status: 'active', password, ...data });
    logAudit('USER_CREATE', 'User', `Created user ${data.username} (${data.role})`);
    showToast('User added.');
  }
  await saveDB();
  closeModal();
  renderApp();
  return false;
}
async function toggleUserStatus(id) {
  const u = db.users.find(x => x.id === id);
  if (!u) return;
  if (currentUser && u.id === currentUser.id) {
    showToast('You cannot deactivate your own account.', 'error');
    return;
  }
  u.status = u.status === 'active' ? 'inactive' : 'active';
  logAudit('USER_STATUS', 'User', `User ${u.username} set to ${u.status}`);
  await saveDB();
  renderPage();
  showToast(`User ${u.status === 'active' ? 'activated' : 'deactivated'}.`);
}
