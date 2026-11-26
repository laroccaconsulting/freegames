// Glossy jewel shapes drawn in code, shared by the tile and gem games.
// Every shape is distinct by outline, so colour is never the only cue.

const TAU = Math.PI * 2;

// A left–right symmetric outline from its right half, listed from top centre
// to bottom centre. Each point is [x, y] (a line) or [cx, cy, x, y] (a curve),
// in units of r. The left half is the same path mirrored and reversed.
function mirrored(ctx, r, pts) {
  const end = (p) => (p.length === 2 ? p : p.slice(2));
  ctx.moveTo(pts[0][0] * r, pts[0][1] * r);
  for (const p of pts.slice(1)) {
    if (p.length === 2) ctx.lineTo(p[0] * r, p[1] * r);
    else ctx.quadraticCurveTo(p[0] * r, p[1] * r, p[2] * r, p[3] * r);
  }
  for (let i = pts.length - 1; i > 0; i--) {
    const [x, y] = end(pts[i - 1]);
    const p = pts[i];
    if (p.length === 2) ctx.lineTo(-x * r, y * r);
    else ctx.quadraticCurveTo(-p[0] * r, p[1] * r, -x * r, y * r);
  }
  ctx.closePath();
}

const circleAt = (ctx, x, y, rad) => {
  ctx.moveTo(x + rad, y);
  ctx.arc(x, y, rad, 0, TAU);
};

export function shapePath(ctx, shape, r) {
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(0, 0, r * 0.85, 0, TAU);
      break;
    case 'square':
      ctx.roundRect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56, r * 0.2);
      break;
    case 'triangle':
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.98, r * 0.78);
      ctx.lineTo(-r * 0.98, r * 0.78);
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.85, -r * 0.2);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.85, -r * 0.2);
      ctx.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 ? r * 0.45 : r;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      break;
    case 'heart':
      ctx.moveTo(0, r * 0.9);
      ctx.bezierCurveTo(-r * 1.3, 0, -r * 0.8, -r * 1.05, 0, -r * 0.45);
      ctx.bezierCurveTo(r * 0.8, -r * 1.05, r * 1.3, 0, 0, r * 0.9);
      break;
    case 'drop':
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.3, -r * 0.4, r * 0.85, 0, r * 0.75, r * 0.35);
      ctx.arc(0, r * 0.3, r * 0.75, 0.07, Math.PI - 0.07);
      ctx.bezierCurveTo(-r * 0.85, 0, -r * 0.3, -r * 0.4, 0, -r);
      break;
    case 'moon':
      ctx.arc(0, 0, r * 0.9, Math.PI * 0.25, Math.PI * 1.75);
      ctx.arc(r * 0.45, 0, r * 0.68, Math.PI * 1.62, Math.PI * 0.38, true);
      ctx.closePath();
      break;
    case 'clover':
      for (let i = 0; i < 4; i++) {
        const a = (i * TAU) / 4 - Math.PI / 4;
        ctx.moveTo(Math.cos(a) * r * 0.45 + r * 0.42, Math.sin(a) * r * 0.45);
        ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.42, 0, TAU);
      }
      break;
    case 'bolt':
      ctx.moveTo(r * 0.2, -r);
      ctx.lineTo(-r * 0.6, r * 0.15);
      ctx.lineTo(-r * 0.05, r * 0.15);
      ctx.lineTo(-r * 0.25, r);
      ctx.lineTo(r * 0.6, -r * 0.2);
      ctx.lineTo(r * 0.05, -r * 0.2);
      ctx.closePath();
      break;
    case 'crown':
      ctx.moveTo(-r * 0.9, r * 0.6);
      ctx.lineTo(-r * 0.95, -r * 0.55);
      ctx.lineTo(-r * 0.45, -r * 0.05);
      ctx.lineTo(0, -r * 0.8);
      ctx.lineTo(r * 0.45, -r * 0.05);
      ctx.lineTo(r * 0.95, -r * 0.55);
      ctx.lineTo(r * 0.9, r * 0.6);
      ctx.closePath();
      break;
    case 'hex':
      for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos((i * TAU) / 6) * r * 0.9, Math.sin((i * TAU) / 6) * r * 0.9);
      ctx.closePath();
      break;
    // Autumn and wizardry (the Hallows themes).
    case 'hat':
      ctx.moveTo(r * 0.98, r * 0.6);
      ctx.ellipse(0, r * 0.6, r * 0.98, r * 0.24, 0, 0, TAU);
      ctx.moveTo(-r * 0.52, r * 0.6);
      ctx.lineTo(-r * 0.14, -r * 0.3);
      ctx.quadraticCurveTo(r * 0.02, -r * 0.92, r * 0.62, -r * 0.98);
      ctx.quadraticCurveTo(r * 0.22, -r * 0.66, r * 0.22, -r * 0.2);
      ctx.lineTo(r * 0.52, r * 0.6);
      ctx.closePath();
      break;
    case 'pumpkin':
      ctx.moveTo(r * 0.52, r * 0.1);
      ctx.ellipse(0, r * 0.1, r * 0.52, r * 0.74, 0, 0, TAU);
      ctx.moveTo(r * 0.02, r * 0.14);
      ctx.ellipse(-r * 0.46, r * 0.14, r * 0.48, r * 0.66, 0, 0, TAU);
      ctx.moveTo(r * 0.94, r * 0.14);
      ctx.ellipse(r * 0.46, r * 0.14, r * 0.48, r * 0.66, 0, 0, TAU);
      ctx.moveTo(-r * 0.1, -r * 0.55);
      ctx.lineTo(-r * 0.06, -r * 0.95);
      ctx.quadraticCurveTo(r * 0.2, -r * 1.0, r * 0.3, -r * 0.82);
      ctx.lineTo(r * 0.1, -r * 0.55);
      ctx.closePath();
      break;
    case 'bat':
      mirrored(ctx, r, [
        [0, -0.18], [0.1, -0.48], [0.2, -0.22], [0.55, -0.28, 0.98, -0.52],
        [0.9, -0.1, 0.92, 0.22], [0.76, 0.02, 0.62, 0.2], [0.5, 0.0, 0.36, 0.24],
        [0.24, 0.1, 0.14, 0.34], [0, 0.44],
      ]);
      break;
    case 'potion':
      circleAt(ctx, 0, r * 0.32, r * 0.64);
      ctx.moveTo(-r * 0.17, -r * 0.2);
      ctx.lineTo(-r * 0.17, -r * 0.72);
      ctx.lineTo(-r * 0.26, -r * 0.72);
      ctx.lineTo(-r * 0.26, -r * 0.84);
      ctx.lineTo(-r * 0.14, -r * 0.84);
      ctx.lineTo(-r * 0.14, -r * 1.0);
      ctx.lineTo(r * 0.14, -r * 1.0);
      ctx.lineTo(r * 0.14, -r * 0.84);
      ctx.lineTo(r * 0.26, -r * 0.84);
      ctx.lineTo(r * 0.26, -r * 0.72);
      ctx.lineTo(r * 0.17, -r * 0.72);
      ctx.lineTo(r * 0.17, -r * 0.2);
      ctx.closePath();
      break;
    case 'candle':
      mirrored(ctx, r, [
        [0, -1.0], [0.14, -0.78, 0.15, -0.6], [0.12, -0.46, 0.04, -0.42], [0.04, -0.34],
        [0.32, -0.34], [0.32, 0.1], [0.36, 0.1, 0.36, 0.3], [0.32, 0.3], [0.32, 0.72],
        [0.62, 0.72], [0.66, 0.92], [0, 0.92],
      ]);
      break;
    case 'leaf':
      mirrored(ctx, r, [
        [0, -1.0], [0.15, -0.6], [0.4, -0.78], [0.35, -0.36], [0.88, -0.5], [0.7, -0.16],
        [0.92, 0.06], [0.46, 0.2], [0.52, 0.44], [0.12, 0.36], [0.06, 0.98], [0, 0.98],
      ]);
      break;
    case 'orb':
      circleAt(ctx, 0, -r * 0.14, r * 0.72);
      ctx.moveTo(-r * 0.48, r * 0.96);
      ctx.lineTo(-r * 0.3, r * 0.52);
      ctx.lineTo(r * 0.3, r * 0.52);
      ctx.lineTo(r * 0.48, r * 0.96);
      ctx.closePath();
      break;
    case 'key':
      circleAt(ctx, 0, -r * 0.56, r * 0.4);
      ctx.moveTo(r * 0.17, -r * 0.56);
      ctx.arc(0, -r * 0.56, r * 0.17, 0, TAU, true);
      ctx.rect(-r * 0.1, -r * 0.2, r * 0.2, r * 1.18);
      ctx.rect(r * 0.08, r * 0.5, r * 0.3, r * 0.14);
      ctx.rect(r * 0.08, r * 0.76, r * 0.24, r * 0.14);
      break;
    case 'owl':
      mirrored(ctx, r, [
        [0, -0.6], [0.24, -0.62, 0.42, -0.74], [0.6, -0.98], [0.66, -0.52],
        [0.9, -0.05, 0.66, 0.62], [0.42, 0.98, 0, 0.98],
      ]);
      break;
    case 'cauldron':
      mirrored(ctx, r, [
        [0, -0.44], [0.88, -0.44], [0.88, -0.24], [0.72, -0.24], [1.0, 0.24, 0.58, 0.66],
        [0.64, 0.94], [0.42, 0.94], [0.36, 0.76], [0, 0.8],
      ]);
      circleAt(ctx, -r * 0.22, -r * 0.62, r * 0.13);
      circleAt(ctx, r * 0.16, -r * 0.8, r * 0.1);
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i * TAU) / 5 - Math.PI / 2;
        ctx.moveTo(Math.cos(a) * r * 0.5 + r * 0.42, Math.sin(a) * r * 0.5);
        ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.42, 0, TAU);
      }
      break;
  }
}

export const shade = (hex, t) => {
  const v = parseInt(hex.slice(1), 16);
  const c = (s) => {
    const x = (v >> s) & 255;
    return Math.round(t < 0 ? x * (1 + t) : x + (255 - x) * t);
  };
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

// Inner markings that make a silhouette read at a glance (the pumpkin's
// ribs, the owl's eyes, the candle's flame…), drawn over the filled shape.
const DETAILS = {
  hat(ctx, r) {
    ctx.fillStyle = '#ffcf5a';
    ctx.beginPath();
    ctx.moveTo(-r * 0.46, r * 0.46);
    ctx.lineTo(-r * 0.39, r * 0.3);
    ctx.lineTo(r * 0.39, r * 0.3);
    ctx.lineTo(r * 0.46, r * 0.46);
    ctx.closePath();
    ctx.fill();
  },
  pumpkin(ctx, r, dark) {
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.lineCap = 'round';
    for (const x of [-0.3, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(x * r * 0.4, -r * 0.5);
      ctx.quadraticCurveTo(x * r * 1.5, r * 0.15, x * r * 0.5, r * 0.78);
      ctx.stroke();
    }
    ctx.strokeStyle = '#3f7a2a';
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath();
    ctx.moveTo(-r * 0.02, -r * 0.62);
    ctx.lineTo(r * 0.02, -r * 0.9);
    ctx.stroke();
  },
  bat(ctx, r) {
    ctx.fillStyle = '#ffcf5a';
    for (const x of [-0.07, 0.07]) {
      ctx.beginPath();
      ctx.arc(x * r, -r * 0.1, r * 0.045, 0, TAU);
      ctx.fill();
    }
  },
  potion(ctx, r) {
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(-r * 0.62, r * 0.18);
    ctx.quadraticCurveTo(-r * 0.3, r * 0.06, 0, r * 0.18);
    ctx.quadraticCurveTo(r * 0.3, r * 0.3, r * 0.62, r * 0.18);
    ctx.lineTo(r * 0.62, r * 0.1);
    ctx.arc(0, r * 0.32, r * 0.64, -0.35, Math.PI + 0.35, true);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a0703c';
    ctx.fillRect(-r * 0.14, -r * 1.0, r * 0.28, r * 0.16);
  },
  candle(ctx, r) {
    ctx.save();
    ctx.shadowColor = '#ffb300';
    ctx.shadowBlur = r * 0.5;
    ctx.fillStyle = '#ffc629';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.96);
    ctx.quadraticCurveTo(r * 0.14, -r * 0.72, r * 0.11, -r * 0.6);
    ctx.quadraticCurveTo(r * 0.08, -r * 0.48, 0, -r * 0.47);
    ctx.quadraticCurveTo(-r * 0.08, -r * 0.48, -r * 0.11, -r * 0.6);
    ctx.quadraticCurveTo(-r * 0.14, -r * 0.72, 0, -r * 0.96);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(-r * 0.62, r * 0.72, r * 1.24, r * 0.2);
  },
  leaf(ctx, r, dark) {
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, r * 0.9);
    ctx.lineTo(0, -r * 0.7);
    for (const s of [-1, 1]) {
      ctx.moveTo(0, r * 0.25);
      ctx.lineTo(s * r * 0.6, -r * 0.3);
      ctx.moveTo(0, r * 0.3);
      ctx.lineTo(s * r * 0.55, r * 0.2);
    }
    ctx.stroke();
  },
  orb(ctx, r) {
    ctx.fillStyle = '#6b4a2b';
    ctx.beginPath();
    ctx.moveTo(-r * 0.48, r * 0.96);
    ctx.lineTo(-r * 0.3, r * 0.56);
    ctx.lineTo(r * 0.3, r * 0.56);
    ctx.lineTo(r * 0.48, r * 0.96);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath();
    ctx.arc(0, -r * 0.14, r * 0.4, 0.3, 1.9);
    ctx.stroke();
  },
  owl(ctx, r, dark) {
    for (const x of [-0.26, 0.26]) {
      ctx.fillStyle = '#fff4d6';
      ctx.beginPath();
      ctx.arc(x * r, -r * 0.28, r * 0.22, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1b1320';
      ctx.beginPath();
      ctx.arc(x * r, -r * 0.26, r * 0.1, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#ffb020';
    ctx.beginPath();
    ctx.moveTo(-r * 0.08, -r * 0.08);
    ctx.lineTo(r * 0.08, -r * 0.08);
    ctx.lineTo(0, r * 0.1);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath();
    for (const [x, y] of [[-0.2, 0.36], [0.2, 0.36], [0, 0.56]]) {
      ctx.moveTo((x - 0.1) * r, y * r);
      ctx.lineTo(x * r, (y + 0.08) * r);
      ctx.lineTo((x + 0.1) * r, y * r);
    }
    ctx.stroke();
  },
  cauldron(ctx, r) {
    ctx.fillStyle = '#7dde3c';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.44, r * 0.74, r * 0.1, 0, 0, TAU);
    ctx.fill();
  },
  key(ctx, r, dark) {
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath();
    ctx.arc(0, -r * 0.56, r * 0.29, 0, TAU);
    ctx.stroke();
  },
};

// A jewel centred at (0, 0) with radius r: light top-left, deep edge and a
// white glint. `flat` draws plain colour (for calm, high-contrast themes).
export function drawJewel(ctx, shape, color, r, flat = false) {
  shapePath(ctx, shape, r);
  if (flat) {
    ctx.fillStyle = color;
    ctx.fill();
    DETAILS[shape]?.(ctx, r, 'rgba(0,0,0,0.35)');
    return;
  }
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, shade(color, 0.55));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, -0.45));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.strokeStyle = shade(color, -0.5);
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.5, r * 0.42, r * 0.2, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  DETAILS[shape]?.(ctx, r, shade(color, -0.5));
}
