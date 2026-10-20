// Dialogs, toasts, and theme handling shared by every game.
import { icon } from './icons.js';
import { setHallows, isHallowsSeason, readLook } from './hallows.js';

// Games fill exactly the visible window (see --app-height in base.css). The
// root's clientHeight is the layout viewport: what fits there never scrolls,
// and pinch-zoom does not change it. Some browsers draw bars over the page
// without shrinking it; the visual viewport (scaled back up while zoomed)
// still shows the true height then, so take the smaller.
function viewportHeight() {
  const root = document.documentElement.clientHeight;
  const vv = window.visualViewport;
  return vv ? Math.min(root, Math.round(vv.height * vv.scale)) : root;
}
function fitViewport() {
  document.documentElement.style.setProperty('--app-height', `${viewportHeight()}px`);
  if (viewportReport) viewportReport();
}
// A readout of what the device reports, for layout bugs on devices we can't test.
let viewportReport = null;
function showViewportReport() {
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:8px;top:40%;z-index:9999;margin:0;padding:8px 10px;font:12px/1.4 monospace;background:#000c;color:#fff;border-radius:8px;pointer-events:none';
  document.body.append(box);
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;height:100dvh;width:0;visibility:hidden';
  document.body.append(probe);
  const inset = (side) => {
    probe.style.paddingTop = `env(safe-area-inset-${side}, 0px)`;
    return getComputedStyle(probe).paddingTop;
  };
  viewportReport = () => {
    const vv = window.visualViewport;
    const se = document.scrollingElement;
    box.textContent = [
      `screen     ${screen.width}x${screen.height} @${devicePixelRatio}`,
      `inner      ${innerWidth}x${innerHeight}`,
      `client     ${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`,
      `visual     ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} scale ${vv.scale.toFixed(2)}` : 'none'}`,
      `100dvh     ${probe.offsetHeight}`,
      `app-height ${getComputedStyle(document.documentElement).getPropertyValue('--app-height')}`,
      `page       ${se.scrollWidth}x${se.scrollHeight}`,
      `safe t/b   ${inset('top')} / ${inset('bottom')}`,
      `standalone ${matchMedia('(display-mode: standalone)').matches}`,
    ].join('\n');
  };
  viewportReport();
  setInterval(viewportReport, 1000);
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  fitViewport();
  addEventListener('resize', fitViewport);
  addEventListener('orientationchange', fitViewport);
  addEventListener('pageshow', fitViewport);
  window.visualViewport?.addEventListener('resize', fitViewport);
  // ?viewport turns the report on for this site (the installed app too, which
  // shares storage with the browser); ?viewport=off turns it off.
  const flag = new URLSearchParams(location.search).get('viewport');
  try {
    if (flag === 'off') localStorage.removeItem('viewport-report');
    else if (flag != null) localStorage.setItem('viewport-report', '1');
    if (localStorage.getItem('viewport-report')) addEventListener('DOMContentLoaded', showViewportReport);
  } catch {
    if (flag != null && flag !== 'off') addEventListener('DOMContentLoaded', showViewportReport);
  }
}

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
      dismissible && el('button', { class: 'icon-btn dialog-close', 'aria-label': 'Close', onclick: () => close(null) }, icon('close', { size: 18 })),
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
// position: 'top' keeps a notice clear of thumbs on phones; duration 0 keeps
// it up until hideToast() or the next toast.
export function toast(message, { duration = 2600, action, position = 'bottom' } = {}) {
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
  host.classList.toggle('toast-top', position === 'top');
  host.classList.add('show');
  clearTimeout(toastTimer);
  if (duration) toastTimer = setTimeout(() => host.classList.remove('show'), action ? duration * 3 : duration);
}

export function hideToast() {
  clearTimeout(toastTimer);
  document.querySelector('.toast')?.classList.remove('show');
}

// theme: 'auto' | 'light' | 'dark' | 'hallows' (the autumn night theme)
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
  setHallows(theme === 'hallows');
  requestAnimationFrame(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const color = getComputedStyle(document.body).getPropertyValue('--chrome-bg').trim();
    if (meta && color) meta.setAttribute('content', color);
  });
}

// In autumn, tells players who picked another theme (once a year) that the
// Hallows theme is here. `apply` switches to it. Skipped when the player has
// already chosen a look for every game on the games list.
export function offerHallows(store, current, apply) {
  const year = new Date().getFullYear();
  if (!isHallowsSeason() || current === 'hallows' || readLook() || store.get('hallowsOffered') === year) return;
  store.set('hallowsOffered', year);
  setTimeout(() => toast('The autumn Hallows theme is here', { duration: 4000, action: { label: 'Try it', onClick: apply } }), 1200);
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
