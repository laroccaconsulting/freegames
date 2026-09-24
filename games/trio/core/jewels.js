// Glossy jewel shapes drawn in code, shared by the tile and gem games.
// Every shape is distinct by outline, so colour is never the only cue.

const TAU = Math.PI * 2;

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

// A jewel centred at (0, 0) with radius r: light top-left, deep edge and a
// white glint. `flat` draws plain colour (for calm, high-contrast themes).
export function drawJewel(ctx, shape, color, r, flat = false) {
  shapePath(ctx, shape, r);
  if (flat) {
    ctx.fillStyle = color;
    ctx.fill();
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
}
