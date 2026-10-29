// Gera os ícones do app (PNG) a partir do monograma vetorial em assets/brand.
// Uso: node scripts/generate-icons.mjs
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const mark = (opts = {}) => {
  const { bg = '#0E0E10', frame = true, glyph = 'url(#g)', scale = 1, rx = 15 } = opts;
  const t = (64 - 64 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#E6E7EA"/><stop offset="1" stop-color="#9A9CA4"/></linearGradient></defs>
  ${bg ? `<rect x="0" y="0" width="64" height="64" rx="${rx}" fill="${bg}"/>` : ''}
  ${frame ? `<rect x="1" y="1" width="62" height="62" rx="${rx}" fill="none" stroke="#2C2C31" stroke-width="2"/>` : ''}
  <g transform="translate(${t} ${t}) scale(${scale})">
    <path d="M14.5 50.5V19.5H20L41 44V19.5H38L43.75 12L49.5 19.5H46.5V50.5H41L20 26V50.5Z" fill="${glyph}"/>
  </g>
</svg>`;
};

const render = (svg, size, out) => {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(out, png);
  console.log('ok', out, size);
};

writeFileSync('assets/brand/northline-mark.svg', mark());
// ícone quadrado (as lojas aplicam a máscara de cantos)
render(mark({ rx: 0, frame: false, bg: '#09090A', scale: 0.78 }), 1024, 'assets/images/icon.png');
render(mark({ frame: false, bg: null, scale: 1 }), 512, 'assets/images/splash-icon.png');
render(mark({ rx: 14 }), 196, 'assets/images/favicon.png');
// Android adaptativo: primeiro plano com margem de segurança, fundo sólido e versão monocromática
render(mark({ bg: null, frame: false, scale: 0.6 }), 1024, 'assets/images/android-icon-foreground.png');
render(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#09090A"/></svg>`, 1024, 'assets/images/android-icon-background.png');
render(mark({ bg: null, frame: false, scale: 0.6, glyph: '#FFFFFF' }), 1024, 'assets/images/android-icon-monochrome.png');
