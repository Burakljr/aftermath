// Aftermath v2 UI: news archive list (newest first), shown inside the settings sheet.
import { h, clear } from './dom.js';

export function renderNews(container, list) {
  const key = list.join('|');
  if (container.__k === key) return;
  container.__k = key;
  clear(container);
  if (!list.length) {
    container.appendChild(h('p.grey-note', { text: 'Henüz haber yok. Körfez Haber ilk saldırıda yayına girer.' }));
    return;
  }
  list.forEach((t, i) => container.appendChild(h('div.news-item', h('span.news-item__no.num', { text: String(list.length - i) }), h('p', { text: t }))));
}
