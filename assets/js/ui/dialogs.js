export function initDialogs() {
  document.addEventListener('click', e => {
    const close = e.target.closest('[data-close]');
    if (close) close.closest('dialog')?.close();
    else if (e.target instanceof HTMLDialogElement && e.target.classList.contains('dialog')) {
      const r = e.target.getBoundingClientRect();
      const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (outside) e.target.close();
    }
  });
}

export function confirmDialog({ title, text, ok = 'Confirmer', danger = false }) {
  const dialog = document.getElementById('confirm-dialog');
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-text').textContent = text;
  const okBtn = document.getElementById('confirm-ok');
  okBtn.textContent = ok;
  okBtn.className = `btn ${danger ? 'btn--danger-ghost' : 'btn--primary'}`;
  dialog.returnValue = '';
  dialog.showModal();
  okBtn.focus();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}
