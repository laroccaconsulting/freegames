// Dialogs, toasts, and theme handling shared by every game.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// Opens a modal dialog. Resolves with the value of the chosen action, or
// null when dismissed (Escape, backdrop tap, close button).
export function openDialog({ title, body, actions = [], className = '', dismissible = true }) {
  return new Promise((resolve) => {
    const dialog = el('dialog', { class: `dialog ${className}` });
    const close = (value) => {
      dialog.classList.add('closing');
      const done = () => {
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
      else setTimeout(done, 160);
    };
    const header = el(
      'header',
      { class: 'dialog-header' },
      el('h2', {}, title),
      dismissible && el('button', { class: 'icon-btn dialog-close', 'aria-label': 'Close', onclick: () => close(null) }, '✕'),
    );
    const content = el('div', { class: 'dialog-body' });
    if (typeof body === 'string') content.innerHTML = body;
    else if (body) content.append(body);
    const footer =
      actions.length > 0 &&
      el(
        'footer',
        { class: 'dialog-actions' },
        actions.map((a) =>
          el('button', { class: `btn ${a.primary ? 'btn-primary' : ''}`, onclick: () => close(a.value) }, a.label),
        ),
      );
    dialog.append(el('div', { class: 'dialog-panel' }, header, content, footer));
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (dismissible) close(null);
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog && dismissible) close(null);
    });
    dialog.closeWith = close;
    document.body.append(dialog);
    dialog.showModal();
    const primary = dialog.querySelector('.btn-primary');
    (primary || dialog.querySelector('.dialog-close'))?.focus({ preventScroll: true });
  });
}

let toastTimer = null;
export function toast(message, { duration = 2600, action } = {}) {
  let host = document.querySelector('.toast');
  if (!host) {
    host = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  host.replaceChildren(el('span', {}, message));
  if (action) {
    host.append(
      el('button', {
        class: 'toast-action',
        onclick: () => {
          host.classList.remove('show');
          action.onClick();
        },
      }, action.label),
    );
  }
  host.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove('show'), action ? duration * 3 : duration);
}

// theme: 'auto' | 'light' | 'dark'
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
  requestAnimationFrame(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const color = getComputedStyle(document.body).getPropertyValue('--chrome-bg').trim();
    if (meta && color) meta.setAttribute('content', color);
  });
}

export function watchSystemTheme(getTheme) {
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(getTheme()));
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// A segmented control (radio group) for settings dialogs.
export function segmented(name, options, current, onChange) {
  return el(
    'div',
    { class: 'segmented', role: 'radiogroup' },
    options.map(([value, label]) =>
      el(
        'label',
        {},
        el('input', {
          type: 'radio',
          name,
          value,
          checked: String(value) === String(current),
          onchange: () => onChange(value),
        }),
        el('span', {}, label),
      ),
    ),
  );
}

export function toggle(label, checked, onChange, hint) {
  return el(
    'label',
    { class: 'toggle-row' },
    el('span', { class: 'toggle-text' }, label, hint && el('small', {}, hint)),
    el('input', { type: 'checkbox', role: 'switch', checked, onchange: (e) => onChange(e.target.checked) }),
  );
}
