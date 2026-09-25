import { makeStore } from './core/storage.js';
import { makeSettings } from './core/settings.js';
import { themeFor, onLookChange } from './core/hallows.js';
import { applyTheme, watchSystemTheme, offerHallows, openDialog, segmented, toggle, el, toast } from './core/ui.js';
import { sounds, setSoundEnabled } from './core/sound.js';
import { addHubLink } from './core/hub.js';
import { registerServiceWorker } from './core/pwa.js';
import { makeAchievements } from './core/achievements.js';
import ACHIEVEMENTS from './achievements.js';

const store = makeStore('{{SLUG}}');
// Every game has: themes (auto/light/dark plus the seasonal looks from
// core/hallows.js, which follow the games list's choice), achievements
// (achievements.js), a way back to the games list and offline support.
// See "Every game has" in PLAN.md.
const settings = makeSettings(store, { theme: null, sound: true });
const ach = makeAchievements('{{SLUG}}', ACHIEVEMENTS);
const themeId = () => themeFor(settings.get('theme'), settings.get('themeAt'), 'auto');
const pickTheme = (id) => {
  settings.set('themeAt', Date.now());
  settings.set('theme', id);
};

applyTheme(themeId());
watchSystemTheme(() => themeId());
setSoundEnabled(settings.get('sound'));
offerHallows(store, themeId(), () => pickTheme('hallows'));
onLookChange(() => applyTheme(themeId()));
settings.onChange((key) => {
  if (key === 'theme' || key === 'themeAt') applyTheme(themeId());
  if (key === 'sound') setSoundEnabled(settings.get('sound'));
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
  ach.unlock('first-tap');
  ach.add('taps-10');
});

document.getElementById('settings-btn').addEventListener('click', () => {
  openDialog({
    title: 'Settings',
    body: el(
      'div',
      {},
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Theme'),
        segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['hallows', 'Hallows']], themeId(), pickTheme)),
      toggle('Sounds', settings.get('sound'), (v) => settings.set('sound', v)),
    ),
  });
});

addHubLink();

registerServiceWorker({
  onUpdateReady: () => toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } }),
});
