// Hallows: the autumn theme. A night sky behind the game with a moon, a
// castle on the hill with lit windows, floating candles, bats and falling
// leaves. Drawn in code (inline SVG + CSS), so it works offline and costs
// nothing to ship. Colours for dialogs and chrome live in base.css under
// :root[data-theme='hallows']; this file only draws the scenery.
//
// The hub page (site/) uses this file too: scripts/sync-core.mjs copies it.

// Autumn: September, October and the first week of November. New players
// get the theme by default then; anyone can pick it any time of year.
export function isHallowsSeason(date = new Date()) {
  const m = date.getMonth();
  return m === 8 || m === 9 || (m === 10 && date.getDate() <= 7);
}

const CSS = `
.hallows-scene{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;contain:strict}
.hallows-scene svg{position:absolute;display:block}
.hw-moon{position:absolute;top:calc(env(safe-area-inset-top,0px) + 15vh);right:8vw;width:clamp(56px,11vmin,110px);aspect-ratio:1;border-radius:50%;
  background:radial-gradient(circle at 36% 34%,#fffbea,#f6e7b8 45%,#e3c982 100%);
  box-shadow:0 0 40px 8px rgba(255,226,150,.28),0 0 120px 40px rgba(255,210,120,.12)}
.hw-moon::before,.hw-moon::after{content:'';position:absolute;border-radius:50%;background:rgba(170,140,80,.22)}
.hw-moon::before{width:22%;height:22%;left:56%;top:24%}
.hw-moon::after{width:14%;height:14%;left:30%;top:60%}
.hw-stars{inset:0;width:100%;height:70%}
.hw-stars .tw{animation:hw-twinkle 4s ease-in-out infinite alternate}
.hw-stars .tw2{animation-delay:-2s}
.hw-land{left:0;right:0;bottom:0;width:100%;height:min(26vh,240px)}
.hw-mist{position:absolute;left:-10%;right:-10%;bottom:0;height:24vh;background:linear-gradient(transparent,rgba(120,100,170,.16) 60%,rgba(60,40,90,.3));filter:blur(6px)}
.hw-candle{position:absolute;width:10px;height:44px;animation:hw-bob 7s ease-in-out infinite alternate}
.hw-candle i{position:absolute;left:1px;right:1px;bottom:0;height:30px;border-radius:2px 2px 3px 3px;background:linear-gradient(90deg,#d9cfb6,#fbf5e6 45%,#cfc3a6)}
.hw-candle b{position:absolute;left:50%;bottom:30px;width:8px;height:13px;margin-left:-4px;border-radius:50% 50% 45% 45%/65% 65% 35% 35%;
  background:radial-gradient(circle at 50% 70%,#fff8d8,#ffcf5a 45%,#ff8a1f 80%);box-shadow:0 0 12px 4px rgba(255,190,80,.55),0 0 36px 12px rgba(255,170,60,.18);
  transform-origin:50% 100%;animation:hw-flicker 1.6s ease-in-out infinite alternate}
.hw-bat{position:absolute;left:0;width:34px;height:18px;color:#0b0714;animation:hw-fly 26s linear infinite}
.hw-bat svg{width:100%;height:100%;animation:hw-flap .32s ease-in-out infinite alternate;transform-origin:50% 40%}
.hw-leaf{position:absolute;top:-40px;width:18px;height:18px;animation:hw-fall 17s linear infinite}
.hw-leaf svg{width:100%;height:100%;animation:hw-sway 3.2s ease-in-out infinite alternate}
@keyframes hw-twinkle{from{opacity:.25}to{opacity:1}}
@keyframes hw-bob{from{transform:translateY(-6px) rotate(-2deg)}to{transform:translateY(8px) rotate(2deg)}}
@keyframes hw-flicker{0%{transform:scale(1,1) rotate(-3deg)}50%{transform:scale(.9,1.12) rotate(2deg)}100%{transform:scale(1.05,.94) rotate(-1deg)}}
@keyframes hw-flap{from{transform:scaleY(1)}to{transform:scaleY(.35)}}
@keyframes hw-fly{0%{transform:translate(-60px,var(--y0))}50%{transform:translate(50vw,var(--y1))}100%{transform:translate(calc(100vw + 60px),var(--y0))}}
@keyframes hw-fall{from{transform:translate(0,0) rotate(0)}to{transform:translate(var(--dx),calc(100vh + 80px)) rotate(540deg)}}
@keyframes hw-sway{from{transform:translateX(-14px) rotate(-25deg)}to{transform:translateX(14px) rotate(25deg)}}
body.no-effects .hallows-scene *{animation-play-state:paused}
@media (prefers-reduced-motion:reduce){.hw-bat,.hw-leaf{display:none}}
@media (max-height:520px){.hw-candle{display:none}}
`;

// A tiny seeded RNG so the stars and trees land in the same place every visit.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function stars() {
  const rand = rng(7);
  let dots = '';
  for (let i = 0; i < 90; i++) {
    const x = (rand() * 1000).toFixed(1);
    const y = (rand() * 600).toFixed(1);
    const r = (0.6 + rand() * rand() * 1.8).toFixed(2);
    const cls = i % 5 === 0 ? 'tw' : i % 5 === 1 ? 'tw tw2' : '';
    dots += `<circle cx="${x}" cy="${y}" r="${r}"${cls ? ` class="${cls}"` : ''}/>`;
  }
  return `<svg class="hw-stars" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" fill="#fff6dc">${dots}</svg>`;
}

// Hills, a line of pines, and a many-towered castle with lit windows.
function land() {
  const rand = rng(21);
  let pines = '';
  for (let x = -10; x < 1210; x += 14 + rand() * 18) {
    if (x > 470 && x < 900) continue; // leave the castle clear
    const base = 236 - Math.sin(x / 190) * 18 + rand() * 6;
    const h = 30 + rand() * 42;
    const w = 10 + rand() * 8;
    pines += `M${(x - w).toFixed(1)} ${base.toFixed(1)}L${x.toFixed(1)} ${(base - h).toFixed(1)}L${(x + w).toFixed(1)} ${base.toFixed(1)}Z`;
  }
  const tower = (x, y, w, h, roof) => `M${x} ${y + h}V${y}H${x + w}V${y + h}ZM${x - 5} ${y}L${x + w / 2} ${y - roof}L${x + w + 5} ${y}Z`;
  const castle =
    'M500 232V176h300v56Z' + // curtain wall
    Array.from({ length: 15 }, (_, i) => `M${506 + i * 20} 176v-8h10v8Z`).join('') +
    tower(512, 150, 22, 82, 44) +
    tower(560, 128, 34, 104, 60) +
    tower(612, 108, 84, 124, 76) +
    tower(706, 70, 30, 162, 84) +
    tower(750, 118, 40, 114, 62) +
    tower(806, 146, 24, 86, 46) +
    tower(846, 168, 18, 64, 34) +
    'M640 232v-40a14 14 0 0 1 28 0v40Z'; // gate arch (drawn lit below)
  const windows = [
    [520, 170], [572, 148], [584, 176], [626, 132], [650, 124], [676, 134], [632, 170], [682, 172],
    [715, 96], [715, 130], [722, 170], [762, 140], [776, 170], [813, 164], [852, 186], [540, 196], [790, 200], [598, 200],
  ]
    .map(([x, y], i) => `<rect x="${x}" y="${y}" width="${i % 3 ? 5 : 6}" height="${i % 3 ? 8 : 10}" rx="2.5"/>`)
    .join('');
  return `<svg class="hw-land" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
<defs><linearGradient id="hw-hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1230"/><stop offset="1" stop-color="#07040f"/></linearGradient>
<filter id="hw-glow" x="-2" y="-2" width="5" height="5"><feGaussianBlur stdDeviation="3"/></filter></defs>
<path fill="#140e26" opacity=".85" d="M0 300V214Q180 170 380 196T760 180T1200 168V300Z"/>
<path fill="#0d0819" d="${pines}"/>
<path fill="#0d0819" d="${castle}"/>
<g fill="#ffc861" filter="url(#hw-glow)" opacity=".9">${windows}<path d="M644 232v-38a10 10 0 0 1 20 0v38Z"/></g>
<g fill="#ffe29a">${windows}</g>
<path fill="url(#hw-hill)" d="M0 300V238Q150 214 330 228T640 230T930 224T1200 216V300Z"/>
</svg>`;
}

const BAT = '<svg viewBox="0 0 34 18" fill="currentColor"><path d="M17 5l-1.6-3-.8 3.4C12 5 9 3 5 1c2 3 2 5 1.2 8C4 8 2 8 0 9c3 1 5 3 6 6 2-2 4-2 6-1 1-2 3-3 5-3s4 1 5 3c2-1 4-1 6 1 1-3 3-5 6-6-2-1-4-1-6.2 0C33 6 31 4 29 1c-4 2-7 4-9.6 4.4L18.6 2z"/></svg>';
const LEAF = (c) => `<svg viewBox="-10 -10 20 20" fill="${c}"><path d="M0-10l1.5 4 2.5-1.8-.5 4.2 5.3-1.4-1.8 3.4 2.2 2.2-4.6 1.4.6 2.4-4-.8L1 10H-1l-.2-6.2-4 .8.6-2.4-4.6-1.4 2.2-2.2-1.8-3.4 5.3 1.4-.5-4.2L-1.5-6z"/></svg>`;

function build() {
  const scene = document.createElement('div');
  scene.className = 'hallows-scene';
  scene.setAttribute('aria-hidden', 'true');
  const candles = [
    [7, 11, 0], [23, 19, -2.5], [39, 9, -4], [61, 16, -1.2], [77, 8, -5.5], [91, 20, -3],
  ]
    .map(([x, y, d]) => `<div class="hw-candle${x > 15 && x < 85 ? ' hw-mid' : ''}" style="left:${x}%;top:calc(${y}% + env(safe-area-inset-top,0px));animation-delay:${d}s"><i></i><b style="animation-delay:${d / 3}s"></b></div>`)
    .join('');
  const bats = [
    [0, '18vh', '9vh', 1],
    [-9, '30vh', '22vh', 0.7],
    [-17, '12vh', '26vh', 0.85],
  ]
    .map(([d, y0, y1, s]) => `<div class="hw-bat" style="animation-delay:${d}s;--y0:${y0};--y1:${y1};scale:${s}">${BAT}</div>`)
    .join('');
  const leaves = [
    [6, 0, '8vw', '#e0762b'], [24, -6, '-6vw', '#c0392b'], [41, -11, '10vw', '#e8b04a'],
    [58, -3, '-9vw', '#b5541c'], [74, -14, '7vw', '#d98a1f'], [91, -8, '-12vw', '#a8321f'],
  ]
    .map(([x, d, dx, c], i) => `<div class="hw-leaf" style="left:${x}%;animation-delay:${d}s;animation-duration:${15 + i * 1.7}s;--dx:${dx}">${LEAF(c)}</div>`)
    .join('');
  scene.innerHTML = `${stars()}<div class="hw-moon"></div>${land()}<div class="hw-mist"></div>${candles}${bats}${leaves}`;
  return scene;
}

// Shows or hides the scenery. Safe to call repeatedly.
export function setHallows(on) {
  const existing = document.querySelector('.hallows-scene');
  if (!on) {
    existing?.remove();
    return;
  }
  if (existing) return;
  if (!document.getElementById('hallows-css')) {
    const style = document.createElement('style');
    style.id = 'hallows-css';
    style.textContent = CSS;
    document.head.append(style);
  }
  document.body.prepend(build());
}
