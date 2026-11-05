/* ============================================================
   16. USER MANAGEMENT (admin only)
   ============================================================ */
const USER_ROLE_LABELS = { admin: 'Administrator', cashier: 'Cashier', staff: 'Inventory Staff' };
function formatUserRoleLabel(role) {
  return USER_ROLE_LABELS[role] || role || 'User';
}

function usersPage() {
  if (!currentUser || currentUser.role !== 'admin') {
    logAudit(
      'UNAUTHORIZED_ACCESS',
      'User Management',
      `Unauthorized attempt to access User Management module by ${(currentUser && currentUser.name) || 'Unauthenticated User'}`,
      {
        entityName: 'User Management Module',
        fieldChanged: 'Access Control Check',
        oldValue: `Role: ${(currentUser && currentUser.role) || 'none'}`,
        newValue: 'Access Denied (Admin Required)',
        reason: 'Insufficient role permissions'
      }
    );
    return `
      <div class="panel" style="padding:40px; text-align:center;">
        <h3>Access Restricted</h3>
        <p class="muted">Only Administrators have permission to manage user accounts.</p>
      </div>`;
  }
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
          <td><span class="badge role-${u.role}">${escapeHtml(formatUserRoleLabel(u.role))}</span></td>
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
  if (!currentUser || currentUser.role !== 'admin') {
    logAudit(
      'UNAUTHORIZED_ACCESS',
      'User Management',
      `Unauthorized attempt to open User Edit Modal by ${(currentUser && currentUser.name) || 'User'}`,
      {
        entityName: 'User Management',
        fieldChanged: 'Access Control Check',
        oldValue: `Role: ${(currentUser && currentUser.role) || 'none'}`,
        newValue: 'Blocked (Admin Required)',
        reason: 'Non-admin user attempted to open user modal'
      }
    );
    showToast('Permission denied: Only administrators can manage users.', 'error');
    return;
  }
  const u = id ? db.users.find(x => x.id === id) : null;
  openModal(u ? 'Edit User' : 'Add User', `
<form id="user-form" onsubmit="return submitUser(event, ${u ? `'${u.id}'` : 'null'})">
  <div class="form-grid">
    <div class="field"><label>Full Name</label><input id="uf-name" value="${u ? escapeHtml(u.name) : ''}" required></div>
    <div class="field"><label>Username</label><input id="uf-username" value="${u ? escapeHtml(u.username) : ''}" required></div>
    <div class="field"><label>${u ? 'New Password (leave blank to keep current)' : 'Password'}</label><input id="uf-password" type="password" autocomplete="new-password" ${u ? '' : 'required'}></div>
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
  if (!currentUser || currentUser.role !== 'admin') {
    logAudit(
      'UNAUTHORIZED_ACCESS',
      'User Management',
      `Unauthorized attempt to save user account by ${(currentUser && currentUser.name) || 'User'}`,
      {
        entityName: 'User Management',
        fieldChanged: 'Access Control Check',
        oldValue: `Role: ${(currentUser && currentUser.role) || 'none'}`,
        newValue: 'Blocked (Admin Required)',
        reason: 'Non-admin user attempted to create/update user'
      }
    );
    showToast('Permission denied: Only administrators can manage users.', 'error');
    return false;
  }
  const username = document.getElementById('uf-username').value.trim();
  const dupe = db.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.id !== id);
  if (dupe) { showToast('That username is already taken.', 'error'); return false; }
  const password = document.getElementById('uf-password').value;
  const data = { name: document.getElementById('uf-name').value.trim(), username, role: document.getElementById('uf-role').value };
  if (id) {
    const u = db.users.find(x => x.id === id);
    if (!u) { showToast('User not found.', 'error'); return false; }
    const oldName = u.name;
    const oldUsername = u.username;
    const oldRole = u.role;
    const roleChanged = oldRole !== data.role;
    const profileChanged = oldName !== data.name || oldUsername !== data.username;
    const passwordChanged = Boolean(password && password.trim().length > 0);

    Object.assign(u, data);
    if (passwordChanged) u.password = password;
    if (currentUser && currentUser.id === id) {
      Object.assign(currentUser, u);
    }

    if (roleChanged) {
      logAudit(
        'USER_ROLE_CHANGE',
        `${u.name} (@${u.username})`,
        `Role changed for ${u.name} (@${u.username}) from ${formatUserRoleLabel(oldRole)} to ${formatUserRoleLabel(u.role)}`,
        {
          entityName: `${u.name} (@${u.username})`,
          fieldChanged: 'User Role',
          oldValue: `${formatUserRoleLabel(oldRole)} (${oldRole})`,
          newValue: `${formatUserRoleLabel(u.role)} (${u.role})`,
          reason: 'Administrator role assignment update'
        }
      );
    }

    if (passwordChanged) {
      logAudit(
        'PASSWORD_CHANGE',
        `${u.name} (@${u.username})`,
        `Password updated for user ${u.name} (@${u.username}) by ${(currentUser && currentUser.name) || 'Administrator'}`,
        {
          entityName: `${u.name} (@${u.username})`,
          fieldChanged: 'Account Password',
          oldValue: '•••••••• (Previous Credential)',
          newValue: '•••••••• (Updated Credential)',
          reason: 'Password reset / update via User Management'
        }
      );
    }

    if (profileChanged || (!roleChanged && !passwordChanged)) {
      const changes = [];
      if (oldName !== data.name) changes.push({ field: 'Full Name', oldValue: oldName, newValue: data.name });
      if (oldUsername !== data.username) changes.push({ field: 'Username', oldValue: oldUsername, newValue: data.username });
      if (roleChanged) changes.push({ field: 'Role', oldValue: formatUserRoleLabel(oldRole), newValue: formatUserRoleLabel(data.role) });
      logAudit(
        'USER_UPDATE',
        `${u.name} (@${u.username})`,
        `Updated user account ${u.name} (@${u.username}, ${formatUserRoleLabel(u.role)})${changes.length ? ' — ' + changes.map(c => `${c.field}: "${c.oldValue}" → "${c.newValue}"`).join(', ') : ''}`,
        {
          entityName: `${u.name} (@${u.username})`,
          fieldChanged: changes.length === 1 ? changes[0].field : 'User Profile',
          oldValue: changes.length === 1 ? changes[0].oldValue : `Name: ${oldName}, Username: @${oldUsername}`,
          newValue: changes.length === 1 ? changes[0].newValue : `Name: ${u.name}, Username: @${u.username}`,
          meta: { changes }
        }
      );
    }
    showToast('User updated.');
  } else {
    const newUser = { id: uid('u'), status: 'active', password, ...data };
    db.users.push(newUser);
    logAudit(
      'USER_CREATE',
      `${data.name} (@${data.username})`,
      `Created new user account for ${data.name} (@${data.username}) with role ${formatUserRoleLabel(data.role)}`,
      {
        entityName: `${data.name} (@${data.username})`,
        fieldChanged: 'New User Account',
        oldValue: 'None (New Account)',
        newValue: `${data.name} · @${data.username} · Role: ${formatUserRoleLabel(data.role)} · Status: Active`,
        reason: 'New staff/user account registration'
      }
    );
    showToast('User added.');
  }
  await saveDB();
  closeModal();
  renderApp();
  return false;
}
async function toggleUserStatus(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    logAudit(
      'UNAUTHORIZED_ACCESS',
      'User Management',
      `Unauthorized attempt to change user status by ${(currentUser && currentUser.name) || 'User'}`,
      {
        entityName: 'User Management',
        fieldChanged: 'Access Control Check',
        oldValue: `Role: ${(currentUser && currentUser.role) || 'none'}`,
        newValue: 'Blocked (Admin Required)',
        reason: 'Non-admin user attempted to activate/deactivate account'
      }
    );
    showToast('Permission denied: Only administrators can change user status.', 'error');
    return;
  }
  const u = db.users.find(x => x.id === id);
  if (!u) return;
  if (currentUser && u.id === currentUser.id) {
    showToast('You cannot deactivate your own account.', 'error');
    return;
  }
  const prevStatus = u.status === 'active' ? 'Active' : 'Inactive';
  u.status = u.status === 'active' ? 'inactive' : 'active';
  const newStatus = u.status === 'active' ? 'Active' : 'Inactive';
  const actionCode = u.status === 'active' ? 'USER_REACTIVATE' : 'USER_DEACTIVATE';
  logAudit(
    actionCode,
    `${u.name} (@${u.username})`,
    `User account ${u.name} (@${u.username}, ${formatUserRoleLabel(u.role)}) ${u.status === 'active' ? 'reactivated' : 'deactivated'} (Status: ${prevStatus} → ${newStatus})`,
    {
      entityName: `${u.name} (@${u.username})`,
      fieldChanged: 'Account Status',
      oldValue: prevStatus,
      newValue: newStatus,
      reason: u.status === 'active' ? 'Administrator reactivated user account' : 'Administrator deactivated user account'
    }
  );
  await saveDB();
  renderPage();
  showToast(`User ${u.status === 'active' ? 'activated' : 'deactivated'}.`);
}
