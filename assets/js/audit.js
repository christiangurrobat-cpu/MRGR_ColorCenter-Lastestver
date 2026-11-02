/* ============================================================
   AUDIT LOG (admin) — records who did what, viewable by admins
   ============================================================ */
let auditFilters = { action: '', user: '', from: '', to: '', q: '' };
let auditRows = [];

function logAudit(action, entity, details) {
  try {
    const u = currentUser || {};
    fetch('api/audit.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: u.id || '', userName: u.name || '', userRole: u.role || '', action, entity: entity || '', details: details || '' }),
    }).catch(() => { });
  } catch (e) { }
}

const AUDIT_ACTIONS = ['LOGIN','LOGOUT','SALE','USER_CREATE','USER_UPDATE','USER_STATUS','PRODUCT_CREATE','PRODUCT_UPDATE','PRODUCT_STATUS','SUPPLIER_CREATE','SUPPLIER_UPDATE','SUPPLIER_STATUS','PO_APPROVE','PO_CANCEL'];

function auditActClass(a) {
  if (a === 'LOGIN' || a === 'LOGOUT') return 'auth';
  if (a.endsWith('_CREATE')) return 'create';
  if (a.endsWith('_UPDATE')) return 'update';
  if (a.endsWith('_STATUS')) return 'status';
  if (a === 'PO_CANCEL') return 'cancel';
  if (a === 'SALE') return 'sale';
  if (a === 'PO_APPROVE') return 'approve';
  return '';
}

function thisMonthStartISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function formatAuditDateReadable(iso) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAuditDateSummary() {
  const f = auditFilters.from;
  const t = auditFilters.to;
  if (!f && !t) return 'Date filter: <strong>All Time</strong>';
  if (f && t && f === t) return `Date filter: <strong>${formatAuditDateReadable(f)}</strong>`;
  if (f && t) return `Date filter: <strong>${formatAuditDateReadable(f)} – ${formatAuditDateReadable(t)}</strong>`;
  if (f) return `Date filter: <strong>From ${formatAuditDateReadable(f)}</strong>`;
  if (t) return `Date filter: <strong>Until ${formatAuditDateReadable(t)}</strong>`;
  return '';
}

function getAuditDatePreset() {
  const f = auditFilters.from || '';
  const t = auditFilters.to || '';
  if (!f && !t) return 'all';
  const today = todayISO();
  const yest = daysAgoISO(1);
  const d7 = daysAgoISO(6);
  const d30 = daysAgoISO(29);
  const mStart = thisMonthStartISO();

  if (f === today && t === today) return 'today';
  if (f === yest && t === yest) return 'yesterday';
  if (f === d7 && t === today) return '7d';
  if (f === d30 && t === today) return '30d';
  if (f === mStart && t === today) return 'month';
  return 'custom';
}

function updateAuditDatePresetsUI() {
  const activePreset = getAuditDatePreset();
  document.querySelectorAll('.audit-date-btn').forEach(btn => {
    const p = btn.getAttribute('data-preset');
    if (p === activePreset) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  const summaryEl = document.getElementById('audit-date-summary');
  if (summaryEl) {
    summaryEl.innerHTML = formatAuditDateSummary();
  }
  const clearBtn = document.getElementById('audit-clear-date-btn');
  if (clearBtn) {
    clearBtn.style.display = (auditFilters.from || auditFilters.to) ? 'inline-flex' : 'none';
  }
}

function syncAuditDateInputs() {
  const fromEl = document.getElementById('al-from');
  const toEl = document.getElementById('al-to');
  if (fromEl) {
    fromEl.value = auditFilters.from || '';
    fromEl.max = auditFilters.to || '';
  }
  if (toEl) {
    toEl.value = auditFilters.to || '';
    toEl.min = auditFilters.from || '';
  }
  updateAuditDatePresetsUI();
}

function setAuditDatePreset(preset) {
  const today = todayISO();
  if (preset === 'today') {
    auditFilters.from = today;
    auditFilters.to = today;
  } else if (preset === 'yesterday') {
    const yest = daysAgoISO(1);
    auditFilters.from = yest;
    auditFilters.to = yest;
  } else if (preset === '7d') {
    auditFilters.from = daysAgoISO(6);
    auditFilters.to = today;
  } else if (preset === '30d') {
    auditFilters.from = daysAgoISO(29);
    auditFilters.to = today;
  } else if (preset === 'month') {
    auditFilters.from = thisMonthStartISO();
    auditFilters.to = today;
  } else if (preset === 'all') {
    auditFilters.from = '';
    auditFilters.to = '';
  }
  syncAuditDateInputs();
  loadAuditLogs();
}

function onAuditDateChange() {
  const fromEl = document.getElementById('al-from');
  const toEl = document.getElementById('al-to');
  let f = fromEl ? fromEl.value : '';
  let t = toEl ? toEl.value : '';
  if (f && t && f > t) {
    const tmp = f;
    f = t;
    t = tmp;
    if (fromEl) fromEl.value = f;
    if (toEl) toEl.value = t;
  }
  auditFilters.from = f;
  auditFilters.to = t;
  if (fromEl) fromEl.max = t || '';
  if (toEl) toEl.min = f || '';
  updateAuditDatePresetsUI();
  loadAuditLogs();
}

function clearAuditDates() {
  setAuditDatePreset('all');
}

function resetAllAuditFilters() {
  auditFilters = { action: '', user: '', from: '', to: '', q: '' };
  renderPage();
}

function auditLogPage() {
  loadAuditLogs();
  const f = auditFilters;
  const activePreset = getAuditDatePreset();
  const hasDates = Boolean(f.from || f.to);
  return `
<div class="audit-stats" id="audit-stats"></div>
<div class="panel" style="padding:0; overflow:hidden;">
  <div class="panel-head row wrap" style="padding:14px 16px 0; gap:8px;">
    <div>
      <h3 style="margin:0;">Audit Log</h3>
      <span class="muted small">Track user actions, logins, sales, and system events</span>
    </div>
    <div class="spacer"></div>
    <div class="row" style="gap:6px;">
      <button type="button" class="btn ghost small" onclick="exportAuditCsv()">⬇ Export CSV</button>
      <button type="button" class="btn secondary small" onclick="loadAuditLogs()">↻ Refresh</button>
    </div>
  </div>

  <div class="audit-filter-box">
    <!-- Primary Filter Row: Search, User, Action, Reset -->
    <div class="audit-filter-primary">
      <input id="al-q" class="audit-search" placeholder="🔍 Search details, entities…" value="${escapeHtml(f.q)}" oninput="debouncedAuditFilter()">
      <input id="al-user" class="audit-user-input" placeholder="👤 Filter by user" value="${escapeHtml(f.user)}" oninput="debouncedAuditFilter()">
      <select id="al-action" class="audit-action-select" onchange="setAuditFilter()">
        <option value="">⚡ All actions</option>
        ${AUDIT_ACTIONS.map(a => `<option value="${a}" ${f.action === a ? 'selected' : ''}>${a.replace(/_/g, ' ')}</option>`).join('')}
      </select>
      <button type="button" class="btn ghost small" onclick="resetAllAuditFilters()" title="Reset all search and filter fields">Reset All</button>
    </div>

    <!-- Second Row: Dedicated Date Range Bar & Quick Presets -->
    <div class="audit-date-bar">
      <div class="audit-date-group">
        <label class="audit-date-label">📅 Date Range:</label>
        <div class="audit-date-field" title="Start date">
          <span class="field-tag">From</span>
          <input id="al-from" type="date" value="${f.from}" max="${f.to || ''}" onchange="onAuditDateChange()">
        </div>
        <span class="audit-date-sep">to</span>
        <div class="audit-date-field" title="End date">
          <span class="field-tag">To</span>
          <input id="al-to" type="date" value="${f.to}" min="${f.from || ''}" onchange="onAuditDateChange()">
        </div>
        <button type="button" id="audit-clear-date-btn" class="audit-clear-date-btn" onclick="clearAuditDates()" title="Clear date range" style="display:${hasDates ? 'inline-flex' : 'none'};">✕</button>
      </div>

      <div class="audit-date-shortcuts">
        <button type="button" class="audit-date-btn ${activePreset === 'today' ? 'active' : ''}" data-preset="today" onclick="setAuditDatePreset('today')" title="Events logged today">Today</button>
        <button type="button" class="audit-date-btn ${activePreset === 'yesterday' ? 'active' : ''}" data-preset="yesterday" onclick="setAuditDatePreset('yesterday')" title="Events logged yesterday">Yesterday</button>
        <button type="button" class="audit-date-btn ${activePreset === '7d' ? 'active' : ''}" data-preset="7d" onclick="setAuditDatePreset('7d')" title="Last 7 days">7D</button>
        <button type="button" class="audit-date-btn ${activePreset === '30d' ? 'active' : ''}" data-preset="30d" onclick="setAuditDatePreset('30d')" title="Last 30 days">30D</button>
        <button type="button" class="audit-date-btn ${activePreset === 'month' ? 'active' : ''}" data-preset="month" onclick="setAuditDatePreset('month')" title="This month to date">This Month</button>
        <button type="button" class="audit-date-btn ${activePreset === 'all' ? 'active' : ''}" data-preset="all" onclick="setAuditDatePreset('all')" title="Show all recorded history">All</button>
      </div>

      <div class="audit-date-info" id="audit-date-summary">
        ${formatAuditDateSummary()}
      </div>
    </div>
  </div>

  <div class="audit-table-wrap"><table>
    <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
    <tbody id="audit-body"><tr><td colspan="5" class="audit-empty">Loading...</td></tr></tbody>
  </table></div>
</div>`;
}

let auditTimer = null;
function debouncedAuditFilter() { clearTimeout(auditTimer); auditTimer = setTimeout(setAuditFilter, 300); }

function setAuditFilter() {
  const v = id => (document.getElementById(id) || {}).value || '';
  auditFilters.q = v('al-q').trim();
  auditFilters.user = v('al-user').trim();
  auditFilters.action = v('al-action');
  loadAuditLogs();
}

function exportAuditCsv() {
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const csv = ['Time,User,Role,Action,Entity,Details'].concat(auditRows.map(l => [l.created_at, l.user_name, l.user_role, l.action, l.entity, l.details].map(q).join(','))).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  let filename = 'audit-log';
  if (auditFilters.from && auditFilters.to) {
    filename += `_${auditFilters.from}_to_${auditFilters.to}`;
  } else if (auditFilters.from) {
    filename += `_from_${auditFilters.from}`;
  } else if (auditFilters.to) {
    filename += `_to_${auditFilters.to}`;
  }
  a.download = `${filename}.csv`;
  a.click();
}

async function loadAuditLogs() {
  const qs = new URLSearchParams(Object.entries(auditFilters).filter(([, v]) => v)).toString();
  let rows = [];
  try {
    const r = await fetch('api/audit.php?' + qs);
    rows = (await r.json()).logs || [];
  } catch (e) { }
  auditRows = rows;
  const body = document.getElementById('audit-body');
  if (!body) return;
  const todayCount = rows.filter(l => String(l.created_at).slice(0, 10) === new Date().toLocaleDateString('sv')).length;
  const users = new Set(rows.map(l => l.user_name).filter(Boolean)).size;
  const stats = document.getElementById('audit-stats');
  if (stats) stats.innerHTML = `
    <div class="audit-stat"><b>${rows.length}</b><span>Entries shown</span></div>
    <div class="audit-stat"><b>${todayCount}</b><span>Today</span></div>
    <div class="audit-stat"><b>${users}</b><span>Active users</span></div>
    <div class="audit-stat"><b>${rows.filter(l => l.action === 'SALE').length}</b><span>Sales logged</span></div>`;

  updateAuditDatePresetsUI();

  body.innerHTML = rows.length ? rows.map(l => {
    const d = new Date(String(l.created_at).replace(' ', 'T'));
    const nm = l.user_name || 'Unknown';
    return `<tr>
<td class="audit-time">${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}<small>${d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small></td>
<td><div class="audit-user"><span class="audit-avatar">${escapeHtml(nm.charAt(0).toUpperCase())}</span><div>${escapeHtml(nm)}<div class="small muted">${escapeHtml(l.user_role || '')}</div></div></div></td>
<td><span class="audit-act ${auditActClass(l.action)}">${escapeHtml(l.action.replace(/_/g, ' '))}</span></td>
<td>${escapeHtml(l.entity || '')}</td><td>${escapeHtml(l.details || '')}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="audit-empty">📭 No audit entries found.</td></tr>';
}

/* Wrap existing handlers so sales are audited without touching their code. */
(function () {
  const origSale = window.completeSale;
  if (typeof origSale === 'function') {
    window.completeSale = async function () {
      const before = (db.sales || []).length;
      const r = await origSale.apply(this, arguments);
      const sales = db.sales || [];
      if (sales.length > before) {
        const s = sales[sales.length - 1] || sales[0];
        logAudit('SALE', 'Sale', `Completed sale ${s.receiptNo || s.id || ''} total ${s.total}`);
      }
      return r;
    };
  }
})();
