// Aftermath v2 UI: result receipt, the yellow carbon-copy "hakediş belgesi" (UI-SPEC 5-result, DESIGN §8 contract complete).
// Steel header + consequence, paper slip (perforated, -1.2°), meta grid, dotted-leader rows, parts chips, signature and
// stamp (ERKEN TESLİM / ZAMANINDA violet, GECİKTİ red). Rows stagger 120 ms, the stamp slams; "Ödemeyi al" flies coins.
import { h, icon, svgEl, keyed, button } from './dom.js';
import { ITEM_ICON } from './panel-city.js';

const SVGNS = 'http://www.w3.org/2000/svg';

function stampSvg(text, kind) {
  const color = kind === 'late' ? 'var(--kirmizi-istampa)' : 'var(--istampa)';
  const date = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const w = text.length > 10 ? 186 : 160;
  const svg = svgEl('svg', { class: `stamp stamp--${kind}`, width: w, height: 74, viewBox: `0 0 ${w} 74`, 'aria-label': text, role: 'img' });
  const g = svgEl('g', { filter: 'url(#ui-ink)', fill: 'none', stroke: color });
  g.appendChild(svgEl('rect', { x: 3, y: 3, width: w - 6, height: 68, rx: 8, 'stroke-width': 3.2 }));
  g.appendChild(svgEl('rect', { x: 8.5, y: 8.5, width: w - 17, height: 57, rx: 5, 'stroke-width': 1.3 }));
  const t = svgEl('text', { x: w / 2, y: 38, 'text-anchor': 'middle', fill: color, stroke: 'none', 'font-family': 'Big Shoulders Display, Arial Narrow, sans-serif', 'font-weight': 900, 'font-size': 29, 'letter-spacing': '.5' });
  t.textContent = text;
  g.appendChild(t);
  g.appendChild(svgEl('path', { d: `M18 46h${w - 36}`, 'stroke-width': 1.3 }));
  const t2 = svgEl('text', { x: w / 2, y: 59.5, 'text-anchor': 'middle', fill: color, stroke: 'none', 'font-family': 'Archivo, sans-serif', 'font-weight': 700, 'font-size': 9, 'letter-spacing': 1 });
  t2.textContent = `FEN İŞLERİ   ${date}`;
  g.appendChild(t2);
  svg.appendChild(g);
  return svg;
}

function inkDefs() {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = '<defs><filter id="ui-ink" x="-5%" y="-5%" width="110%" height="110%">'
    + '<feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" result="n"/>'
    + '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.55" result="holes"/>'
    + '<feComposite in="SourceGraphic" in2="holes" operator="in" result="cut"/>'
    + '<feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="3" result="w"/>'
    + '<feDisplacementMap in="cut" in2="w" scale="2.4"/></filter></defs>';
  return svg;
}

function signature() {
  const svg = svgEl('svg', { class: 'r-sig', width: 96, height: 34, viewBox: '0 0 96 34', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: '.85' });
  svg.appendChild(svgEl('path', { d: 'M4 24c6-14 10-18 12-14s-6 16-2 15 8-17 13-16-2 13 2 13 6-9 9-9 1 7 4 7 6-6 9-6 2 5 5 4 7-5 11-6 9 0 14-2' }));
  svg.appendChild(svgEl('path', { d: 'M30 29c14-2 34-3 52-5' }));
  return svg;
}

export function createReceipt(ctx) {
  const { game } = ctx;
  const el = h('div.sheet-slot.sheet-receipt.off');
  const box = h('div.receipt');
  el.append(inkDefs(), box);
  ctx.L.sheet.appendChild(el);

  return {
    el,
    update(s) {
      const rc = game.receipt(s);
      if (!rc) return;
      const res = s.result;
      const r = keyed(box, `r${res.no}|${rc.stampKind}`, () => {
        const money = rc.rows.filter((x) => x.label !== 'Süre' && x.label !== 'Güven');
        const lines = h('div.r-lines');
        money.forEach((row, i) => {
          const minus = /^-/.test(row.value);
          lines.appendChild(h(`div.r-line${minus ? '.minus' : i > 0 ? '.plus' : ''}`, { style: `--i:${i}` },
            h('span', { text: row.label }), h('i.lead'), h('span.amt.num', { text: row.value })));
        });
        const parts = h('div.r-parts', { style: `--i:${money.length + 1}` }, h('span.r-parts__k', { text: 'Parçalar' }));
        for (const p of rc.parts) parts.appendChild(h('span.part', icon(ITEM_ICON[p.item] || 'g-crate', 14), h('span.num', { text: p.text })));
        if (!rc.parts.length) parts.appendChild(h('span.r-none', { text: 'Parça çıkmadı' }));
        const btn = button({ icon: 'g-lira', iconSize: 20, onTap: (e, b) => {
          const out = ctx.act('collectPayment', null, b);
          if (out.ok) ctx.fx.coinsFrom(b, 'in', 6);
        } });
        btn.classList.add('block', 'receipt__btn');
        const nParts = rc.parts.reduce((a, p) => a + p.n, 0);
        box.append(
          h('div.receipt__head', h('div.receipt__title', { text: rc.title }), h('div.receipt__sub', { text: rc.consequence })),
          h('article.slip.paper',
            h('div.r-top', icon('g-municipal', 28),
              h('div.r-org', 'Körfezkent Belediyesi', h('span', { text: 'Fen İşleri Müdürlüğü' })),
              h('div.r-no', 'Hakediş no', h('b.num', { text: `2026/${String(res.no).padStart(2, '0')}` }))),
            h('div.r-title', { text: 'Hakediş belgesi' }),
            h('dl.r-meta',
              h('div', h('dt', { text: 'Yüklenici' }), h('dd', { text: 'Aftermath Temizlik A.Ş.' })),
              h('div', h('dt', { text: 'İş' }), h('dd', { text: 'Enkaz ve leş kaldırma' })),
              h('div', h('dt', { text: 'Söz verilen süre' }), h('dd.num', { text: game.fmtTime(res.deadline) })),
              h('div', h('dt', { text: 'Teslim süresi' }), h('dd.num', { text: game.fmtTime(res.elapsed) }))),
            lines,
            h('div.r-total', { style: `--i:${money.length}` }, h('span', { text: 'Ödenecek tutar' }), h('b.num', { text: game.fmtMoneyExact(rc.totalValue) })),
            parts,
            h('div.r-sign', h('div', h('span', { text: 'Kontrol mühendisi' }), h('b', { text: 'Nevin Aksoy' })), signature(), stampSvg(rc.stamp, rc.stampKind))),
          h('div.receipt__after',
            h('div.gains',
              h('div.gain.glass', icon('g-trust', 24, rc.trustText.startsWith('-') ? 'c-yangin' : 'c-temiz'), h('div', h('b.num', { text: rc.trustText }), h('span', { text: rc.trustText.startsWith('-') ? 'İhalede geri düşürür' : 'İhalede öne geçirir' }))),
              h('div.gain.glass', icon('g-crate', 24, 'c-sinyal'), h('div', h('b.num', { text: `${nParts} parça` }), h('span', { text: 'Depoya kaldırıldı' })))),
            btn));
        box.style.setProperty('--n', String(money.length + 2));
        return { btn };
      });
      r.btn.set({ label: rc.button, sub: game.fmtMoneyExact(rc.totalValue), primary: ctx.primaryOK(), key: 'collectPayment' });
    },
  };
}
