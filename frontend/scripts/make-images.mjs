// Generates original SVG placeholder illustrations (no third-party photos).
// Run: npm run assets
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'img');
mkdirSync(out, { recursive: true });

const W = 1200;
const H = 900;

const THEMES = {
  'playa-el-tecolote': {
    sky: ['#7dd3fc', '#fde7c2'],
    alt: ['#fdba74', '#fde68a'],
    sea: ['#22b8cf', '#0e7490'],
    land: '#d9b97a',
    hills: ['#8aa6a3', '#6b8785'],
    extra: 'palm',
  },
  balandra: {
    sky: ['#93c5fd', '#fff1d6'],
    alt: ['#fca5a5', '#fde68a'],
    sea: ['#5eead4', '#0d9488'],
    land: '#ead8a8',
    hills: ['#b08968', '#8c6a4f'],
    extra: 'rock',
  },
  'cabo-pulmo': {
    sky: ['#60a5fa', '#bae6fd'],
    alt: ['#fb923c', '#fde68a'],
    sea: ['#0ea5e9', '#0c4a6e'],
    land: '#e5d3a1',
    hills: ['#a8836a', '#7c5e4a'],
    extra: 'fish',
  },
  'espiritu-santo': {
    sky: ['#38bdf8', '#e0f2fe'],
    alt: ['#f97316', '#fed7aa'],
    sea: ['#06b6d4', '#155e75'],
    land: '#d6b98a',
    hills: ['#b45f3c', '#8f4529'],
    extra: 'islands',
  },
  'todos-santos': {
    sky: ['#a5b4fc', '#ffe8cc'],
    alt: ['#f472b6', '#fed7aa'],
    sea: ['#c08457', '#8a5a36'],
    land: '#c08457',
    hills: ['#8b7d6b', '#6d6154'],
    extra: 'town',
  },
  'bahia-concepcion': {
    sky: ['#7dd3fc', '#fff7d6'],
    alt: ['#fbbf24', '#fecaca'],
    sea: ['#2dd4bf', '#0f766e'],
    land: '#e8d5a0',
    hills: ['#a16f4a', '#7a5233'],
    extra: 'palm',
  },
  'playa-los-cerritos': {
    sky: ['#bae6fd', '#ffedd5'],
    alt: ['#fb7185', '#fde68a'],
    sea: ['#38bdf8', '#1d4ed8'],
    land: '#e2cf9c',
    hills: ['#6b8f71', '#4f7358'],
    extra: 'surf',
  },
  'laguna-san-ignacio': {
    sky: ['#cbd5e1', '#f1f5f9'],
    alt: ['#fdba74', '#e2e8f0'],
    sea: ['#64a6bd', '#2f6a85'],
    land: '#d4c4a0',
    hills: ['#94a3b8', '#64748b'],
    extra: 'whale',
  },
  evento: {
    sky: ['#93c5fd', '#fde68a'],
    alt: ['#f9a8d4', '#fde68a'],
    sea: ['#34d399', '#047857'],
    land: '#e5d3a1',
    hills: ['#86a79b', '#5f8478'],
    extra: 'palm',
  },
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const hash = (str) => [...str].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);
const f = (n) => Math.round(n * 10) / 10;

function hillPath(r, base, amp, steps = 7) {
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push([(i * W) / steps, base - amp * (0.25 + r() * 0.75)]);
  let d = `M0 ${base} L${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`;
  }
  d += ` L${W} ${f(pts.at(-1)[1])} L${W} ${base} Z`;
  return d;
}

function palm(x, y, s = 1) {
  const fronds = [-70, -35, 0, 35, 70, 105, -105]
    .map((a) => `<ellipse cx="0" cy="-60" rx="14" ry="70" transform="rotate(${a})" fill="#15803d"/>`)
    .join('');
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 C14 -120 -6 -230 10 -330" stroke="#7c4a1e" stroke-width="16" fill="none" stroke-linecap="round"/><g transform="translate(10 -330)">${fronds}</g></g>`;
}
const boat = (x, y) =>
  `<g transform="translate(${x} ${y})"><path d="M-70 0 H70 L50 28 H-50Z" fill="#fff"/><path d="M0 -4 V-110 L58 -4Z" fill="#f8fafc"/><path d="M-6 -4 V-80 L-46 -4Z" fill="#e2e8f0"/></g>`;

function extra(kind, r, h, v) {
  switch (kind) {
    case 'palm':
      return palm(150 + v * 40, H - 20, 1.1) + palm(300 + v * 30, H, 0.7);
    case 'rock':
      return `<g transform="translate(${760 - v * 80} ${h + 70})"><path d="M-22 0 Q-14 -60 -20 -90 H20 Q14 -60 22 0Z" fill="#7a5c40"/><ellipse cx="0" cy="-96" rx="100" ry="42" fill="#8b6b4a"/><ellipse cx="0" cy="-104" rx="80" ry="26" fill="#a3825d"/></g>`;
    case 'fish': {
      let s = '';
      for (let i = 0; i < 16; i++) {
        const x = 200 + r() * 800;
        const y = h + 80 + r() * 300;
        const c = ['#fde047', '#fb923c', '#f9fafb'][i % 3];
        s += `<g transform="translate(${f(x)} ${f(y)})" opacity=".9"><ellipse rx="26" ry="12" fill="${c}"/><path d="M22 0 L42 -12 V12Z" fill="${c}"/><circle cx="-12" cy="-3" r="2.5" fill="#0f172a"/></g>`;
      }
      return (
        s +
        `<path d="M0 ${H} V${H - 60} Q60 ${H - 120} 120 ${H - 50} Q200 ${H - 140} 280 ${H - 40} Q340 ${H - 100} 420 ${H - 50} V${H}Z" fill="#f43f5e" opacity=".75"/>`
      );
    }
    case 'islands':
      return (
        `<path d="M-20 ${h + 8} Q120 ${h - 120} 300 ${h - 60} Q420 ${h - 150} 560 ${h - 40} L620 ${h + 8}Z" fill="#9a4a2c"/>` +
        boat(820 + v * 40, h + 120)
      );
    case 'town': {
      let s = `<rect y="${h}" width="${W}" height="${H - h}" fill="#c08457"/>`;
      const cols = ['#fde68a', '#fca5a5', '#fff7ed', '#a7f3d0', '#bfdbfe'];
      for (let i = 0; i < 9; i++) {
        const w = 90 + r() * 50;
        const hh = 90 + r() * 80;
        const x = 30 + i * 128;
        s += `<rect x="${x}" y="${f(h - hh + 60)}" width="${f(w)}" height="${f(hh + 60)}" fill="${cols[i % 5]}"/><rect x="${x + 14}" y="${f(h - hh + 90)}" width="22" height="34" fill="#7c4a1e" opacity=".6"/><path d="M${x - 6} ${f(h - hh + 60)} H${f(x + w + 6)}" stroke="#b45309" stroke-width="10"/>`;
      }
      return (
        s +
        `<rect x="590" y="${h - 190}" width="60" height="250" fill="#fff7ed"/><path d="M580 ${h - 190} L620 ${h - 250} L660 ${h - 190}Z" fill="#b45309"/>` +
        palm(1060, H, 0.8)
      );
    }
    case 'surf':
      return (
        `<g transform="translate(${700 + v * 60} ${h + 110})"><path d="M-110 20 Q-30 -100 40 -30 Q70 0 110 20 Z" fill="#fff" opacity=".85"/><path d="M-20 -20 L10 -90 L22 -20Z" fill="#fb923c"/></g>` +
        palm(130, H, 0.9)
      );
    case 'whale':
      return (
        `<g transform="translate(${720 - v * 100} ${h + 90})"><path d="M-90 0 C-40 -40 -10 -80 0 -130 C10 -80 40 -40 90 0 C45 -12 12 -6 0 14 C-12 -6 -45 -12 -90 0Z" fill="#334155"/><path d="M-130 30 Q0 50 130 30" stroke="#fff" stroke-width="5" fill="none" opacity=".7"/></g>` +
        boat(260, h + 150)
      );
    default:
      return '';
  }
}

function svg(slug, v) {
  const t = THEMES[slug];
  const r = rng(hash(slug) + v * 977);
  const h = Math.floor(400 + v * 30 + r() * 30);
  const sky = v === 1 ? t.alt : t.sky;
  const sunX = 200 + r() * 800;
  const waves = Array.from({ length: 5 }, (_, i) => {
    const y = h + 40 + i * 70 + r() * 20;
    const x = r() * 700;
    return `<path d="M${f(x)} ${f(y)} q40 -16 80 0 t80 0 t80 0 t80 0" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".45"/>`;
  }).join('');
  const isTown = t.extra === 'town';
  const sea = isTown ? '' : `<rect y="${h}" width="${W}" height="${H - h}" fill="url(#sea)"/>${waves}`;
  const land = isTown
    ? ''
    : `<path d="M0 ${H} V${H - 120 - v * 20} Q300 ${H - 220} 520 ${H - 90} Q620 ${H - 50} 700 ${H}Z" fill="${t.land}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.sea[0]}"/><stop offset="1" stop-color="${t.sea[1]}"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<circle cx="${f(sunX)}" cy="${f(h - 220 - r() * 80)}" r="${v === 1 ? 90 : 62}" fill="#fff7d6" opacity=".9"/>
<path d="${hillPath(r, h, 170)}" fill="${t.hills[0]}" opacity=".85"/>
<path d="${hillPath(r, h + 6, 110)}" fill="${t.hills[1]}"/>
${sea}${land}${extra(t.extra, r, h, v)}
</svg>
`;
}

for (const slug of Object.keys(THEMES)) {
  const variants = slug === 'evento' ? [0] : [0, 1, 2];
  for (const v of variants) writeFileSync(join(out, `${slug}-${v + 1}.svg`), svg(slug, v));
}
console.log('Images generated in', out);
