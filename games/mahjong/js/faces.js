// Tile faces drawn as SVG (60 × 80 units), with a large index in the corner
// so tiles read at a glance on a phone.

const DOT_POS = {
  1: [[30, 40]],
  2: [[30, 22], [30, 58]],
  3: [[16, 18], [30, 40], [44, 62]],
  4: [[18, 22], [42, 22], [18, 58], [42, 58]],
  5: [[18, 20], [42, 20], [30, 40], [18, 60], [42, 60]],
  6: [[19, 18], [41, 18], [19, 40], [41, 40], [19, 62], [41, 62]],
  7: [[14, 16], [30, 22], [46, 28], [19, 48], [41, 48], [19, 64], [41, 64]],
  8: [[19, 14], [41, 14], [19, 31], [41, 31], [19, 48], [41, 48], [19, 65], [41, 65]],
  9: [[15, 18], [30, 18], [45, 18], [15, 40], [30, 40], [45, 40], [15, 62], [30, 62], [45, 62]],
};
const DOT_COLORS = ['#1f5fbf', '#c9302c', '#2e8540'];

function dots(n) {
  const r = n === 1 ? 14 : n <= 4 ? 9 : n <= 6 ? 8 : 7;
  return DOT_POS[n].map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${DOT_COLORS[(k + n) % 3]}"/><circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="#fff" opacity=".85"/>`).join('');
}

function bamboo(n) {
  if (n === 1) return '<g transform="translate(30 42)"><ellipse rx="12" ry="16" fill="#2e8540"/><path d="M-6 -20 L0 -30 L6 -20" fill="#c9302c"/><circle cx="-4" cy="-6" r="3" fill="#fff"/></g>';
  const cols = n <= 3 ? n : n <= 6 ? Math.ceil(n / 2) : 3;
  const rowsN = Math.ceil(n / cols);
  const out = [];
  let k = 0;
  for (let r = 0; r < rowsN; r++)
    for (let c = 0; c < cols && k < n; c++, k++) {
      const x = 30 + (c - (cols - 1) / 2) * 15;
      const y = 40 + (r - (rowsN - 1) / 2) * (60 / rowsN);
      const h = 52 / rowsN;
      const color = n === 9 && c === 1 ? '#c9302c' : '#2e8540';
      out.push(`<rect x="${x - 3.5}" y="${y - h / 2}" width="7" height="${h}" rx="3" fill="${color}"/><rect x="${x - 4.5}" y="${y - 1.5}" width="9" height="3" rx="1.5" fill="${color}"/>`);
    }
  return out.join('');
}

const CJK = "'Noto Sans CJK SC','Noto Sans SC','PingFang SC','Hiragino Sans','Microsoft YaHei','Yu Gothic',sans-serif";
const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

function text(t, { size = 30, y = 50, color = '#1d1b16', font = CJK } = {}) {
  return `<text x="30" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="${font}" font-weight="700" font-size="${size}" fill="${color}">${t}</text>`;
}

const FLOWERS = ['#e5483b', '#f2a23c', '#9a5ad8', '#ec6fb0'];
function flower(k) {
  const c = FLOWERS[k];
  const petals = [0, 72, 144, 216, 288].map((a) => `<ellipse cx="30" cy="28" rx="7" ry="12" fill="${c}" transform="rotate(${a} 30 40)"/>`).join('');
  return `${petals}<circle cx="30" cy="40" r="6" fill="#ffcf3d"/><path d="M30 52 Q28 62 30 70" stroke="#2e8540" stroke-width="3" fill="none"/>`;
}
function season(k) {
  if (k === 0) return '<circle cx="30" cy="40" r="11" fill="#f2c230"/>' + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="29" y="18" width="2.5" height="8" fill="#f2c230" transform="rotate(${a} 30 40)"/>`).join('');
  if (k === 1) return '<path d="M30 18 C46 26 46 50 30 64 C14 50 14 26 30 18 Z" fill="#2e8540"/><path d="M30 20 V62" stroke="#fff" stroke-width="2"/>';
  if (k === 2) return '<path d="M18 30 C24 18 36 18 42 30 C48 42 40 58 30 62 C20 58 12 42 18 30 Z" fill="#e0782a"/><path d="M30 22 V60 M30 38 L40 30 M30 46 L20 38" stroke="#8a3f10" stroke-width="2" fill="none"/>';
  return [0, 60, 120].map((a) => `<rect x="28.5" y="20" width="3" height="40" rx="1.5" fill="#2f7de0" transform="rotate(${a} 30 40)"/>`).join('') + '<circle cx="30" cy="40" r="4" fill="#2f7de0"/>';
}

export function faceSvg(face) {
  const s = face[0];
  const n = Number(face.slice(1));
  let body = '';
  let index = '';
  if (s === 'd') [body, index] = [dots(n), n];
  else if (s === 'b') [body, index] = [bamboo(n), n];
  else if (s === 'c') [body, index] = [text(NUMERALS[n - 1], { size: 24, y: 30 }) + text('萬', { size: 26, y: 58, color: '#c9302c' }), n];
  else if (s === 'w') [body, index] = [text({ E: '東', S: '南', W: '西', N: '北' }[face[1]], { size: 34 }), face[1]];
  else if (face === 'rR') [body, index] = [text('中', { size: 36, color: '#c9302c' }), ''];
  else if (face === 'rG') [body, index] = [text('發', { size: 34, color: '#2e8540' }), ''];
  else if (face === 'rW') [body, index] = ['<rect x="14" y="16" width="32" height="48" rx="4" fill="none" stroke="#1f5fbf" stroke-width="4"/><rect x="20" y="22" width="20" height="36" rx="2" fill="none" stroke="#1f5fbf" stroke-width="2"/>', ''];
  else if (s === 'f') [body, index] = [flower(n - 1), ''];
  else if (s === 's') [body, index] = [season(n - 1), ''];
  const idx = index ? `<text x="5" y="13" font-family="system-ui,sans-serif" font-weight="800" font-size="12" fill="#6b665c">${index}</text>` : '';
  return `<svg viewBox="0 0 60 80" aria-hidden="true">${body}${idx}</svg>`;
}

export function faceName(face) {
  const s = face[0];
  const n = face.slice(1);
  if (s === 'd') return `${n} of dots`;
  if (s === 'b') return `${n} of bamboo`;
  if (s === 'c') return `${n} of characters`;
  if (s === 'w') return `${{ E: 'East', S: 'South', W: 'West', N: 'North' }[n]} wind`;
  if (s === 'r') return `${{ R: 'Red', G: 'Green', W: 'White' }[n]} dragon`;
  if (s === 'f') return 'Flower';
  return 'Season';
}
