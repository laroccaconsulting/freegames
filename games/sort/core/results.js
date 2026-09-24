// The end-of-puzzle card: numbers roll in on fruit-machine reels, then the
// rating stamps down. Shared by the puzzle-golf games. Uses the DOM.
import { el, openDialog, toast } from './ui.js';
import { shareText } from './golf.js';

function reel(value) {
  const digits = String(value).split('');
  const strips = digits.map((d, i) => {
    const strip = el('span', { class: 'strip' });
    for (let k = 0; k < 30; k++) strip.append(el('span', {}, k % 10));
    strip.dataset.stop = 20 + Number(d);
    strip.style.setProperty('--spin', `${0.9 + i * 0.35}s`);
    return strip;
  });
  const node = el('span', { class: 'reel', 'aria-label': String(value) }, strips);
  node.spin = () => strips.forEach((s) => (s.style.transform = `translateY(${-s.dataset.stop * 1.15}em)`));
  node.duration = 0.9 + (digits.length - 1) * 0.35;
  return node;
}

// Opens the card and resolves with the chosen action's value.
//   rating   { emoji, label, tier } from golf.rating()
//   reels    [{ label, value }] (usually yours and par)
//   share    () => { text, url }, or null for no share button
//   sounds   { tick(), stamp(tier) } optional
export function showResults({ title, rating, reels, squares, notes = [], share, actions, sounds = {}, reduced = false }) {
  const stamp = el('div', { class: 'stamp' }, el('span', { class: 'emoji' }, rating.emoji), el('span', { class: 'label' }, rating.label));
  const spinners = reels.map((r) => ({ ...r, node: reel(r.value) }));
  const shareBtn =
    share &&
    el('button', {
      class: 'btn share-btn',
      onclick: async () => {
        const { text, url } = share();
        const how = await shareText(text, url);
        if (how === 'copied') toast('Result copied — paste it anywhere');
        else if (how === 'failed') toast('Could not share on this device');
      },
    }, '📤 Share result');
  const body = el('div', {},
    stamp,
    el('div', { class: 'reels' }, spinners.map((r) => el('div', { class: 'reel-box' }, el('small', {}, r.label), r.node))),
    squares && el('p', { class: 'squares' }, squares),
    notes,
    shareBtn,
  );
  const done = openDialog({ title, body, actions, className: 'results' });

  const spinFor = Math.max(...spinners.map((r, i) => r.node.duration + i * 0.2)) * 1000;
  if (reduced) {
    spinners.forEach((r) => r.node.spin());
    stamp.classList.add('show');
  } else {
    spinners.forEach((r, i) => setTimeout(() => r.node.spin(), 60 + i * 200));
    let t = 0;
    const tick = () => {
      t += 70 + t * 0.12;
      if (t < spinFor - 120) {
        sounds.tick?.();
        setTimeout(tick, 70 + t * 0.12);
      }
    };
    setTimeout(tick, 80);
    setTimeout(() => {
      stamp.classList.add('show');
      setTimeout(() => sounds.stamp?.(rating.tier), 180);
    }, spinFor + 80);
  }
  return done;
}

export const note = (text, win = false) => el('p', { class: `result-note ${win ? 'win' : ''}` }, text);
