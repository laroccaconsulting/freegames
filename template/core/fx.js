// Particles for pours, finished tubes and wins. Drawn on the game canvas in
// CSS pixels. Styles come from the theme (sparks, stars, confetti, petals).

const TAU = Math.PI * 2;
const MAX = 900;

export class Particles {
  constructor() {
    this.list = [];
    this.flash = 0; // full-screen flash, 0–1
  }

  get active() {
    return this.list.length > 0 || this.flash > 0.01;
  }

  clear() {
    this.list.length = 0;
    this.flash = 0;
  }

  add(p) {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push({ life: 1, age: 0, rot: 0, spin: 0, gravity: 900, drag: 1.2, size: 3, ...p });
  }

  // A burst in one colour from a point, styled by the theme.
  burst(x, y, color, style, { count = 36, speed = 420, spread = TAU, angle = -Math.PI / 2, palette } = {}) {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * (0.35 + Math.random() * 0.75);
      const c = palette ? palette[i % palette.length] : color;
      const base = { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: c, life: 0.7 + Math.random() * 0.7 };
      if (style === 'confetti')
        this.add({ ...base, kind: 'confetti', size: 4 + Math.random() * 4, spin: (Math.random() - 0.5) * 18, gravity: 700, drag: 2.2, life: base.life + 0.6 });
      else if (style === 'petals')
        this.add({ ...base, kind: 'petal', size: 4 + Math.random() * 3, spin: (Math.random() - 0.5) * 6, gravity: 260, drag: 3, life: base.life + 0.8 });
      else if (style === 'stars')
        this.add({ ...base, kind: 'star', size: 3 + Math.random() * 4, spin: (Math.random() - 0.5) * 8, gravity: 420, drag: 1.8 });
      else this.add({ ...base, kind: 'spark', size: 1.5 + Math.random() * 2.5, gravity: 620, drag: 1.1 });
    }
  }

  ring(x, y, color, radius = 60, width = 4) {
    this.add({ kind: 'ring', x, y, vx: 0, vy: 0, gravity: 0, color, size: radius, width, life: 0.55 });
  }

  // Liquid droplets splashing where a stream lands.
  splash(x, y, color, count = 2) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 60 + Math.random() * 120;
      this.add({ kind: 'drop', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, size: 1.2 + Math.random() * 1.8, gravity: 900, drag: 0.5, life: 0.35 });
    }
  }

  // Floating text such as "×3" or "Perfect!".
  text(x, y, value, color, size = 28) {
    this.add({ kind: 'text', x, y, vx: 0, vy: -60, gravity: 0, drag: 1.5, color, size, value, life: 1.1 });
  }

  // Fountains from the bottom corners, like a jackpot.
  fountain(width, height, palette, style, amount = 1) {
    const n = Math.round(90 * amount);
    const speed = 900 + height * 0.9;
    this.burst(0, height * 0.9, null, style, { count: n, speed, spread: 0.5, angle: -Math.PI / 2.6, palette });
    this.burst(width, height * 0.9, null, style, { count: n, speed, spread: 0.5, angle: -Math.PI + Math.PI / 2.6, palette });
  }

  // A shower falling from the top of the screen.
  rain(width, palette, style, count = 90) {
    for (let i = 0; i < count; i++) {
      const color = palette[i % palette.length];
      const kind = style === 'sparks' ? 'star' : style === 'petals' ? 'petal' : style === 'stars' ? 'star' : 'confetti';
      this.add({
        kind, color, x: Math.random() * width, y: -20 - Math.random() * 260,
        vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 160,
        gravity: 160, drag: 0.4, size: 3 + Math.random() * 4, spin: (Math.random() - 0.5) * 10, life: 2.4 + Math.random(),
      });
    }
  }

  step(dt) {
    this.flash = Math.max(0, this.flash - dt * 2.5);
    const list = this.list;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      list[w++] = p;
    }
    list.length = w;
  }

  draw(ctx, { additive, width, height, flashColor = '#fff' }) {
    ctx.save();
    if (additive) ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      const t = p.age / p.life;
      const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      switch (p.kind) {
        case 'spark': {
          // A streak along the direction of travel.
          const len = Math.min(18, Math.hypot(p.vx, p.vy) * 0.025) + p.size;
          const a = Math.atan2(p.vy, p.vx);
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
          ctx.stroke();
          break;
        }
        case 'star':
          drawStar(ctx, p.x, p.y, p.size * (1 + 0.3 * Math.sin(p.age * 20)), p.rot);
          break;
        case 'confetti':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.cos(p.rot * 1.7));
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        case 'petal':
          ctx.save();
          ctx.translate(p.x + Math.sin(p.age * 5 + p.size) * 6, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size / 2.2, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
        case 'ring':
          ctx.lineWidth = p.width * (1 - t);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.3 + t * 1.2), 0, TAU);
          ctx.stroke();
          break;
        case 'drop':
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
          break;
        case 'text':
          ctx.globalCompositeOperation = 'source-over';
          ctx.font = `800 ${p.size * (1 + 0.25 * Math.max(0, 1 - t * 5))}px ui-rounded, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.strokeText(p.value, p.x, p.y);
          ctx.fillText(p.value, p.x, p.y);
          if (additive) ctx.globalCompositeOperation = 'lighter';
          break;
      }
    }
    if (this.flash > 0.01) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = this.flash * 0.35;
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }
}

export function drawStar(ctx, x, y, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rad = i % 2 ? r * 0.38 : r;
    const a = rot + (i * Math.PI) / 4;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}
