const DURATION = { info: 4000, success: 4000, error: 7000 };

export function toast(message, type = 'info', { action } = {}) {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast__action';
    button.textContent = action.label;
    button.addEventListener('click', () => { el.remove(); action.onClick(); });
    el.append(button);
  }
  root.append(el);
  while (root.children.length > 3) root.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }, (DURATION[type] || DURATION.info) * (action ? 2 : 1));
}
