/* ============================================================
   19. MODAL SYSTEM
   ============================================================ */
function openModal(title, bodyHtml, footHtml, size) {
  document.getElementById('modal-root').innerHTML = `
<div class="modal-backdrop" onclick="if(event.target===this) closeModal()">
  <div class="modal-box ${size || ''}">
    <div class="modal-header"><h3>${title}</h3><button onclick="closeModal()">&times;</button></div>
    <div class="modal-body">${bodyHtml}</div>
    <div class="modal-foot">${footHtml || `<button class="btn secondary" onclick="closeModal()">Close</button>`}</div>
  </div>
</div>`;
  if (document.getElementById('mv-type')) toggleMovementFields();
}
function closeModal() {
  if (typeof posConfirmPromiseResolve === 'function') {
    const fn = posConfirmPromiseResolve;
    posConfirmPromiseResolve = null;
    fn(false);
  }
  document.getElementById('modal-root').innerHTML = '';
}

/**
 * Modern in-app Confirmation Dialog (replaces native browser confirm/localhost says)
 * @param {Object} options
 * @param {string} options.title - Dialog heading
 * @param {string} options.message - Body text / HTML
 * @param {string} [options.icon='⚠️'] - Icon or emoji
 * @param {string} [options.confirmText='Confirm'] - Confirmation button label
 * @param {string} [options.cancelText='Cancel'] - Cancel button label
 * @param {boolean} [options.danger=false] - If true, confirmation button is red/destructive
 * @returns {Promise<boolean>} Resolves true if confirmed, false if cancelled/closed
 */
function showConfirmDialog({
  title = 'Confirmation',
  message = 'Are you sure you want to proceed?',
  icon = '⚠️',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false
} = {}) {
  return new Promise((resolve) => {
    const existing = document.querySelector('.app-confirm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'app-confirm-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(20,17,13,0.55); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; animation:modalFade 0.15s ease-out;';

    overlay.innerHTML = `
      <div class="app-confirm-box" style="background:var(--surface,#fff); border-radius:var(--radius-lg,14px); padding:28px 24px; max-width:440px; width:100%; box-shadow:0 20px 40px rgba(0,0,0,0.22); animation:modalPop 0.18s cubic-bezier(0.16,1,0.3,1); text-align:center;">
        <div style="font-size:38px; line-height:1; margin-bottom:12px;">${icon}</div>
        <h3 style="font-size:18px; font-weight:700; margin:0 0 10px; color:var(--ink,#1F2937);">${escapeHtml(title)}</h3>
        <div style="font-size:13.5px; color:var(--ink-soft,#4B5563); line-height:1.6; margin-bottom:22px;">${message}</div>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button type="button" class="btn secondary" id="app-confirm-cancel-btn" style="min-width:115px; padding:9px 16px;">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn ${danger ? 'danger' : ''}" id="app-confirm-ok-btn" style="min-width:125px; padding:9px 18px; ${danger ? 'background:#DC2626; color:#fff; border-color:#DC2626;' : 'background:#1F6F6B; color:#fff;'}">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    function cleanup(result) {
      window.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(result);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(false);
      } else if (e.key === 'Enter') {
        const okBtn = overlay.querySelector('#app-confirm-ok-btn');
        if (okBtn && document.activeElement !== overlay.querySelector('#app-confirm-cancel-btn')) {
          e.preventDefault();
          cleanup(true);
        }
      }
    }

    overlay.querySelector('#app-confirm-cancel-btn').onclick = () => cleanup(false);
    overlay.querySelector('#app-confirm-ok-btn').onclick = () => cleanup(true);
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(false);
    };

    window.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);

    const focusTarget = danger
      ? overlay.querySelector('#app-confirm-cancel-btn')
      : overlay.querySelector('#app-confirm-ok-btn');
    if (focusTarget) setTimeout(() => focusTarget.focus(), 30);
  });
}
