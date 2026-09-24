// The classic win celebration: cards leap off the foundations and bounce
// across the screen, leaving trails. Tap anywhere to skip.

import { SUIT_PATHS } from './art.js';
import { RANK_LABELS, isRed } from './cards.js';

function drawCard(card, w, h, fourColor) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const r = w * 0.08;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0.5, 0.5, w - 1, h - 1, r);
  else ctx.rect(0.5, 0.5, w - 1, h - 1);
  ctx.fillStyle = '#fffdf8';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.stroke();
  const colors = fourColor ? ['#1c1c22', '#c62d3a', '#1d8a3e', '#1f63c6'] : ['#1c1c22', '#c62d3a', '#1c1c22', '#c62d3a'];
  ctx.fillStyle = isRed(card.suit) && !fourColor ? colors[1] : colors[card.suit];
  ctx.font = `800 ${w * 0.3}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(RANK_LABELS[card.rank], w * 0.08, h * 0.05);
  const path = new Path2D(SUIT_PATHS[card.suit]);
  const drawSuit = (x, y, size) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 100, size / 100);
    ctx.fill(path);
    ctx.restore();
  };
  drawSuit(w * 0.66, h * 0.05, w * 0.26);
  drawSuit(w * 0.22, h * 0.36, w * 0.56);
  return canvas;
}

export function celebrate({ foundations, cardWidth, cardHeight, fourColor }) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.className = 'celebration';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    document.body.append(canvas);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Launch order: the top card of each foundation in turn.
    const queue = [];
    const stacks = foundations.map((f) => ({ ...f, cards: [...f.cards] }));
    while (stacks.some((s) => s.cards.length)) {
      for (const s of stacks) if (s.cards.length) queue.push({ card: s.cards.pop(), x: s.x, y: s.y });
    }
    const images = new Map();
    const image = (card) => {
      if (!images.has(card.id)) images.set(card.id, drawCard(card, cardWidth, cardHeight, fourColor));
      return images.get(card.id);
    };

    let active = null;
    let frame = 0;
    let done = false;
    const gravity = 0.55 * (H / 800 + 0.5);
    const finish = () => {
      if (done) return;
      done = true;
      canvas.classList.add('fade');
      setTimeout(() => canvas.remove(), 400);
      resolve();
    };
    canvas.addEventListener('pointerdown', finish);

    const tick = () => {
      if (done) return;
      if (!active || active.x < -cardWidth || active.x > W) {
        const next = queue.shift();
        if (!next) return finish();
        const speed = 3 + Math.random() * 5;
        active = {
          ...next,
          img: image(next.card),
          vx: (Math.random() < 0.5 ? -1 : 1) * speed,
          vy: -Math.random() * 10,
        };
      }
      // Several physics steps per frame keeps the trail dense.
      for (let i = 0; i < 2; i++) {
        active.vy += gravity / 2;
        active.x += active.vx / 2;
        active.y += active.vy / 2;
        if (active.y + cardHeight > H) {
          active.y = H - cardHeight;
          active.vy = -active.vy * (0.72 + Math.random() * 0.1);
        }
        ctx.drawImage(active.img, active.x, active.y, cardWidth, cardHeight);
      }
      frame++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // Safety net so it can never trap the player.
    setTimeout(finish, 40000);
  });
}
