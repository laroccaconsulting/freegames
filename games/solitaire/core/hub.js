// A way back to the games list. When a game is opened from the hub (the
// folder above it), a back button is added to the top bar. It stays for
// the rest of the visit, reloads included. A game installed on its own, or
// hosted on its own domain, shows nothing.

const KEY = 'freegames:hub';

function hubUrl() {
  const parent = new URL('../', location.href).href;
  try {
    if (document.referrer && new URL(document.referrer).href.split(/[?#]/)[0] === parent) sessionStorage.setItem(KEY, parent);
    return sessionStorage.getItem(KEY) === parent ? parent : null;
  } catch {
    return document.referrer.split(/[?#]/)[0] === parent ? parent : null;
  }
}

export function addHubLink() {
  const href = hubUrl();
  const bar = document.querySelector('.topbar');
  if (!href || !bar || bar.querySelector('.hub-link')) return;
  const link = document.createElement('a');
  link.className = 'hub-link';
  link.href = href;
  link.setAttribute('aria-label', 'All games');
  link.title = 'All games';
  link.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>';
  bar.prepend(link);
}
