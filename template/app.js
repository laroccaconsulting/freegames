import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { applyTheme, watchSystemTheme, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled } from './core/sound.js';
import { registerServiceWorker } from './core/pwa.js';

const store = makeStore('{{SLUG}}');
const settings = makeSettings(store, { theme: 'auto', sound: true });

applyTheme(settings.get('theme'));
watchSystemTheme(() => settings.get('theme'));
setSoundEnabled(settings.get('sound'));
settings.onChange((key, value) => {
  if (key === 'theme') applyTheme(value);
  if (key === 'sound') setSoundEnabled(value);
});

let count = store.get('count', 0);
const countEl = document.getElementById('count');
const render = () => (countEl.textContent = `Tapped ${count} times`);
render();

document.getElementById('play').addEventListener('click', () => {
  count++;
  store.set('count', count);
  sounds.place();
  render();
});

document.getElementById('settings-btn').addEventListener('click', () => {
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'),
        segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], settings.get('theme'), (v) => settings.set('theme', v))),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    ),
  });
});

registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});
