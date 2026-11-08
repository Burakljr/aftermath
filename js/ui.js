// Aftermath — arayüz: üst bilgi çubuğu, sekmeler, paneller, pencereler, bildirimler
import { game, wipe } from './state.js';
import { on } from './bus.js';
import * as sim from './sim.js';
import { ITEMS, ITEM_KEYS, RECIPES, CREWS, CREW_TYPES, WORK, UPGRADES, SECTORS, BAL, RIVAL } from './data.js';
import { fmt, fmt1, fmtTime } from './util.js';
import { play, prefs, setPref } from './audio.js';

export const ui = { tab: 'city', selected: null, key: '' };

let panel;
let modalRoot;
let toastBox;
let tickerEl;
let hintEl;
let hud = {};
const queue = [];
let current = null;
let tenderSel = { bid: 1, speed: 1 };
let tenderResult = null;
let lastNewsT = -1;

const stars = (n) => '★'.repeat(n) + '☆'.repeat(BAL.sectorMax - n);
const pct = (v, max) => (max > 0 ? (v / max) * 100 : 0);

/* ---------------- Kurulum ---------------- */

export function initUI() {
  panel = document.getElementById('panel');
  modalRoot = document.getElementById('modal-root');
  toastBox = document.getElementById('toasts');
  tickerEl = document.getElementById('ticker');
  hintEl = document.getElementById('hint');
  hud = {
    money: document.querySelector('#hud-money b'),
    rep: document.querySelector('#hud-rep b'),
    income: document.querySelector('#hud-income b'),
    pill: document.getElementById('status-pill'),
    status: document.getElementById('status-text'),
    tabs: [...document.querySelectorAll('#tabs button')],
  };
  document.addEventListener('click', onClick);
  on('toast', ({ text, kind }) => showToast(text, kind));
  on('modal', (m) => queueModal(m));
  on('phase', () => { ui.key = ''; });
  on('news', updateTicker);
  updateTicker();
}

export function select(i) {
  ui.selected = ui.selected === i ? null : i;
  if (ui.tab !== 'city') setTab('city');
  ui.key = '';
  updateUI();
}

function setTab(t) {
  ui.tab = t;
  for (const b of hud.tabs) b.classList.toggle('active', b.dataset.tab === t);
  ui.key = '';
  panel.scrollTop = 0;
}

/* ---------------- Tıklamalar ---------------- */

function onClick(e) {
  const tabBtn = e.target.closest('#tabs button');
  if (tabBtn) {
    play('tab');
    setTab(tabBtn.dataset.tab);
    updateUI();
    return;
  }
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const s = game.s;
  const { a, v } = el.dataset;
  const n = Number(el.dataset.n);
  if (a !== 'm-submit') play('click');
  switch (a) {
    case 'snd':
      if (v === 'any') {
        const next = !(prefs.sfx || prefs.music);
        setPref('sfx', next);
        setPref('music', next);
      } else {
        setPref(v, !prefs[v]);
      }
      updateSoundButtons();
      return;
    case 'crew+': sim.assignCrew(s, n, v, 1); break;
    case 'crew-': sim.assignCrew(s, n, v, -1); break;
    case 'auto': sim.autoAssign(s); break;
    case 'skip': sim.skipWait(s); break;
    case 'sec-up': sim.upgradeSector(s, n); break;
    case 'select': select(n); return;
    case 'sell1': sim.sell(s, v, 1); break;
    case 'sellall': sim.sell(s, v, s.inv[v]); break;
    case 'job': sim.startJob(s, v); break;
    case 'autojob':
      s.autoJobs[v] = !s.autoJobs[v];
      if (s.autoJobs[v]) sim.startJob(s, v, true);
      break;
    case 'hire': sim.hire(s, v); break;
    case 'upg': sim.buyUpgrade(s, v); break;
    case 'reset': queueModal({ type: 'reset' }); break;
    case 'open-tender': queueModal({ type: 'tender' }); break;
    case 'm-intro':
      s.flags.introSeen = true;
      closeModal();
      break;
    case 'm-close': closeModal(); break;
    case 'm-bid': tenderSel.bid = Number(v); renderModal(); return;
    case 'm-speed': tenderSel.speed = Number(v); renderModal(); return;
    case 'm-submit':
      tenderResult = sim.resolveTender(s, tenderSel.bid, tenderSel.speed);
      if (tenderResult) play(tenderResult.win ? 'win' : 'lose');
      if (tenderResult && tenderResult.win && s.attack) {
        ui.selected = s.attack.chain[0];
        setTab('city');
      }
      renderModal();
      return;
    case 'm-buyer':
      sim.resolveBuyer(s, v === 'yes');
      closeModal();
      break;
    case 'm-reset':
      wipe();
      location.reload();
      return;
  }
  ui.key = '';
  updateUI();
}

/* ---------------- Güncelleme döngüsü ---------------- */

export function updateUI() {
  const s = game.s;
  hud.money.textContent = fmt(s.money);
  hud.rep.textContent = Math.round(s.rep);
  hud.income.textContent = `+${fmt1(sim.incomePerSec(s))}/sn`;
  updateStatus(s);
  const hint = hintText(s);
  if (hintEl.textContent !== hint) hintEl.textContent = hint;
  updateTabDots(s);

  const key = panelKey(s);
  if (key !== ui.key) {
    ui.key = key;
    panel.innerHTML = build(s);
    lastNewsT = -1;
  }
  update(s);
}

function updateStatus(s) {
  let pill = 'SAKİN';
  let cls = 'calm';
  let text = '';
  switch (s.phase) {
    case 'calm':
      text = `Sonraki saldırı ${fmtTime(s.timer)}`;
      break;
    case 'attack':
      pill = 'SALDIRI';
      cls = 'alert';
      text = 'Canavar şehirde!';
      break;
    case 'tender':
      pill = 'İHALE';
      cls = 'work';
      text = 'Belediye teklif bekliyor';
      break;
    case 'cleanup': {
      const c = s.contract;
      const left = c.deadline - c.elapsed;
      pill = 'TEMİZLİK';
      cls = 'work';
      text = left >= 0 ? `Kalan ${fmtTime(left)} · Öfke %${Math.round(c.anger)}` : `GECİKME +${fmtTime(-left)} · Öfke %${Math.round(c.anger)}`;
      break;
    }
    case 'rival':
      pill = 'RAKİP';
      cls = 'rival';
      text = `${RIVAL} temizliyor`;
      break;
  }
  if (hud.pill.textContent !== pill) hud.pill.textContent = pill;
  hud.pill.className = cls;
  if (hud.status.textContent !== text) hud.status.textContent = text;
}

function hintText(s) {
  if (current) return '';
  if (s.phase === 'cleanup') {
    const anyCrew = s.sectors.some((x) => x.crews.fire + x.crews.debris + x.crews.carve > 0);
    if (!anyCrew) return '👆 Bir bölgeye dokun ve ekip ata ya da ⚡ Otomatik’e bas.';
    if (sim.storageFree(s) <= 0) return '📦 Depo dolu! Parçalama durdu. Depo’dan sat ya da Fabrika’da işle.';
    if (s.sectors.some((x) => x.fire > 0 && x.crews.fire === 0) && sim.crewFree(s, 'fire') > 0) {
      return '🔥 Yangın olan bölgede ekipler %70 yavaş çalışır. Önce itfaiyeyi gönder!';
    }
    const idle = CREW_TYPES.find((t) => sim.crewFree(s, t) > 0 && s.sectors.some((x) => x[WORK[t]] > 0));
    if (idle) return `${CREWS[idle].icon} Boşta ekiplerin var! Yeni bir bölgeye ata ya da ⚡ Otomatik’e bas.`;
    return '';
  }
  if (s.phase === 'calm') {
    if (s.attackLevel === 0) return '🌆 Şehir sakin... şimdilik.';
    if (s.jobs.length === 0 && RECIPES.some((r) => sim.canStart(s, r))) return '💡 Parçaları Fabrika’da işlersen çok daha pahalıya satarsın.';
    if (s.stats.contracts === 1 && s.sectors.some((x) => x.level < 2)) return '🏗️ Bakım sözleşmelerine yatırım yap: sen yokken bile para kazandırır.';
    return '';
  }
  if (s.phase === 'rival') return `🟣 ${RIVAL} temizliyor. Bu arada ekip kirala, depoyu boşalt.`;
  return '';
}

function updateTabDots(s) {
  const depotFull = sim.storageUsed(s) >= sim.storageCap(s) * 0.85;
  const factoryIdle = s.jobs.length < sim.factorySlots(s) && RECIPES.some((r) => sim.canStart(s, r));
  for (const b of hud.tabs) {
    const dot = (b.dataset.tab === 'depot' && depotFull) || (b.dataset.tab === 'factory' && factoryIdle);
    b.classList.toggle('dot', dot);
  }
}

function updateTicker() {
  const s = game.s;
  const text = s && s.news[0] ? s.news[0].text : 'Aftermath Co. kuruldu. Şehir sakin... şimdilik.';
  tickerEl.innerHTML = '';
  const sp = document.createElement('span');
  sp.textContent = text;
  tickerEl.appendChild(sp);
}

/* ---------------- Panel: yapı ---------------- */

function panelKey(s) {
  const base = `${ui.tab}|${s.phase}|${ui.selected}`;
  if (ui.tab === 'factory') return `${base}|${sim.factorySlots(s)}|${RECIPES.map((r) => (s.autoJobs[r.id] ? 1 : 0)).join('')}`;
  if (ui.tab === 'depot') return `${base}|${s.dna > 0}`;
  if (ui.tab === 'city' && s.phase === 'cleanup' && ui.selected != null) return `${base}|${sim.sectorClean(s.sectors[ui.selected])}`;
  return base;
}

function build(s) {
  if (ui.tab === 'depot') return buildDepot(s);
  if (ui.tab === 'factory') return buildFactory(s);
  if (ui.tab === 'company') return buildCompany(s);
  return buildCity(s);
}

const bar = (label, cls, key) => `
  <div class="row"><span class="lbl">${label}</span><div class="bar grow ${cls}"><i data-w="${key}"></i></div><span class="num" data-k="${key}"></span></div>`;

function buildCity(s) {
  let h = '';
  if (s.phase === 'cleanup') {
    h += `<div class="card"><h3>📝 Temizlik sözleşmesi</h3>
      <div class="row"><div class="grow muted">Ödeme</div><b data-k="c-pay"></b></div>
      <div class="row"><div class="grow muted">Kalan süre</div><b data-k="c-time"></b></div>
      <div class="row"><span title="Halk öfkesi">😡</span><div class="bar grow anger"><i data-w="c-anger"></i></div><span class="num" data-k="c-anger"></span></div>
    </div>
    <div class="card"><div class="row pool">
      ${CREW_TYPES.map((t) => `<div class="chip">${CREWS[t].icon} <b data-k="pool-${t}"></b></div>`).join('')}
      <div class="grow"></div><button class="btn teal small" data-a="auto">⚡ Otomatik</button>
    </div></div>`;
    if (ui.selected == null) {
      h += '<div class="card center muted">👆 Haritada bir bölgeye dokun ve ekiplerini ata.</div>';
    } else {
      const i = ui.selected;
      const clean = sim.sectorClean(s.sectors[i]);
      h += `<div class="card"><h3>${SECTORS[i].name}${clean ? ' <span class="muted">✓ temiz</span>' : ''}</h3>
        ${bar('🏚️ Enkaz', 'rubble', 'r')}
        ${bar('🔥 Yangın', 'fire', 'f')}
        ${bar('🦖 Canavar', 'corpse', 'k')}
        <div style="margin-top:10px">
        ${CREW_TYPES.map((t) => `
          <div class="row crew">
            <span class="ico">${CREWS[t].icon}</span>
            <div class="grow">${CREWS[t].name}<div class="muted" data-k="cwn-${t}"></div></div>
            <button class="btn sec small sq" data-a="crew-" data-n="${i}" data-v="${t}" data-dis="cm-${t}">−</button>
            <b class="cnt" data-k="cw-${t}"></b>
            <button class="btn small sq" data-a="crew+" data-n="${i}" data-v="${t}" data-dis="cp-${t}">+</button>
          </div>`).join('')}
        </div></div>`;
    }
  } else if (s.phase === 'calm') {
    h += `<div class="card"><div class="row">
        <div class="grow"><div class="muted">Sonraki saldırı</div><div class="big" data-k="calm-timer"></div></div>
        <button class="btn sec" data-a="skip" data-dis="skip">⏩ Hızlandır</button>
      </div></div>
      <div class="card"><h3>🏗️ Bakım sözleşmeleri</h3>
        <div class="muted" style="margin-bottom:8px">Her seviye saniyede ${fmt1(BAL.incomePerLevel)} 💰 pasif gelir getirir, sen oyunda değilken bile. Canavarın düştüğü bölgeler bir seviye kaybeder.</div>
        ${s.sectors.map((sec, i) => `
          <div class="row sec-row ${ui.selected === i ? 'sel' : ''}" data-a="select" data-n="${i}">
            <div class="grow"><b>${SECTORS[i].name}</b> <span class="stars" data-k="lv-${i}"></span>
              <div class="muted" data-k="sec-st-${i}"></div></div>
            <button class="btn small" data-a="sec-up" data-n="${i}" data-dis="sec-up-${i}"><span data-k="sec-cost-${i}"></span></button>
          </div>`).join('')}
      </div>`;
  } else if (s.phase === 'rival') {
    h += `<div class="card"><h3>🟣 ${RIVAL} temizliyor</h3>
      <div class="bar purple"><i data-w="rv"></i></div>
      <p class="muted" style="margin:8px 0 0">İhaleyi kaçırdın. Topladıkları parçaları piyasaya dökecekler, fiyatlar düşebilir. Bu arada ekip kirala ve depoyu boşalt.</p>
    </div>`;
  } else if (s.phase === 'tender') {
    h += `<div class="card center"><div class="big">📝 İhale açık</div>
      <div class="muted" style="margin:6px 0 10px">Belediye temizlik için teklif bekliyor.</div>
      <button class="btn" data-a="open-tender">Teklif ver</button></div>`;
  } else {
    h += '<div class="card center"><div class="big">⚠️ Saldırı!</div><div class="muted">Canavar şehirde. Temizlik ihalesi birazdan açılacak...</div></div>';
  }
  return h;
}

function buildDepot(s) {
  let h = `<div class="card"><div class="row"><b>📦 Depo</b><div class="bar grow good"><i data-w="stor"></i></div><span class="num" style="width:auto" data-k="stor"></span></div>
    <div class="muted" style="margin-top:6px">Satış yaptıkça o ürünün fiyatı düşer, zamanla toparlanır. Fiyat yükselişlerini kolla!</div></div>`;
  for (const k of ITEM_KEYS) {
    const it = ITEMS[k];
    h += `<div class="card item"><div class="row">
      <span class="ico">${it.icon}</span>
      <div class="grow"><b>${it.name}</b> <span class="muted">× <span data-k="inv-${k}"></span></span>
        <div class="row" style="margin-top:4px"><span class="price" data-k="pr-${k}"></span><canvas class="spark" width="144" height="44" data-spark="${k}"></canvas><span class="boom" data-k="boom-${k}"></span></div>
      </div>
      <div class="col">
        <button class="btn small" data-a="sell1" data-v="${k}" data-dis="s1-${k}">Sat 1</button>
        <button class="btn sec small" data-a="sellall" data-v="${k}" data-dis="sa-${k}">Tümü</button>
      </div>
    </div></div>`;
  }
  if (s.dna > 0) {
    h += `<div class="card item"><div class="row"><span class="ico">🧬</span>
      <div class="grow"><b>DNA Örneği</b> <span class="muted">× <span data-k="dna"></span></span>
      <div class="muted">Piyasada satılmaz. Bazı alıcılar bunun için çok para öder... sorusuz.</div></div></div></div>`;
  }
  return h;
}

function buildFactory(s) {
  const slots = sim.factorySlots(s);
  let h = `<div class="card"><h3>🏭 Üretim hatları (${slots})</h3>`;
  for (let i = 0; i < slots; i++) {
    h += `<div class="slot"><div class="row"><span class="grow" data-k="job-n-${i}"></span><span class="muted" data-k="job-t-${i}"></span></div>
      <div class="bar" style="margin-top:6px"><i data-w="job-${i}"></i></div></div>`;
  }
  h += '</div>';
  for (const r of RECIPES) {
    const inp = Object.entries(r.in).map(([k, n]) => `${n}× ${ITEMS[k].icon}`).join(' + ');
    const auto = s.autoJobs[r.id];
    h += `<div class="card"><div class="row">
      <div class="grow"><b>${inp} → ${ITEMS[r.out].icon} ${ITEMS[r.out].name}</b>
        <div class="muted">${r.time} sn · Alıcı: ${r.buyer}</div>
        <div class="muted" data-k="rv-${r.id}"></div></div>
      <div class="col">
        <button class="btn small" data-a="job" data-v="${r.id}" data-dis="job-${r.id}">Üret</button>
        <button class="btn small ${auto ? 'on' : 'sec'}" data-a="autojob" data-v="${r.id}">🔁 ${auto ? 'Açık' : 'Kapalı'}</button>
      </div></div></div>`;
  }
  return h;
}

function buildCompany() {
  let h = '<div class="card"><h3>👷 Ekipler</h3>';
  for (const t of CREW_TYPES) {
    h += `<div class="row crew"><span class="ico">${CREWS[t].icon}</span>
      <div class="grow">${CREWS[t].name} <span class="muted">× <span data-k="own-${t}"></span></span><div class="muted">${CREWS[t].desc}</div></div>
      <button class="btn small" data-a="hire" data-v="${t}" data-dis="hire-${t}">+ <span data-k="hc-${t}"></span></button></div>`;
  }
  h += '</div><div class="card"><h3>🔧 Geliştirmeler</h3>';
  for (const k in UPGRADES) {
    const u = UPGRADES[k];
    h += `<div class="row crew"><span class="ico">${u.icon}</span>
      <div class="grow">${u.name} <span class="muted" data-k="ul-${k}"></span><div class="muted">${u.desc}</div></div>
      <button class="btn small" data-a="upg" data-v="${k}" data-dis="upg-${k}"><span data-k="uc-${k}"></span></button></div>`;
  }
  h += `</div>
    <div class="card"><h3>📊 Aftermath Co.</h3><div class="kv">
      <span>Tamamlanan sözleşme</span><b data-k="st-c"></b>
      <span>Kaçırılan ihale</span><b data-k="st-l"></b>
      <span>Toplanan parça</span><b data-k="st-p"></b>
      <span>Toplam kazanç</span><b data-k="st-e"></b>
      <span>Saldırı sayısı</span><b data-k="st-a"></b>
      <span>Rakip itibarı (${RIVAL})</span><b data-k="st-r"></b>
    </div></div>
    <div class="card"><h3>🔊 Ses</h3>
      <div class="row"><div class="grow">Efektler<div class="muted">Saldırı, ekipler, kasa, fabrika</div></div><button class="btn small toggle" data-a="snd" data-v="sfx" data-snd="sfx"></button></div>
      <div class="row"><div class="grow">Müzik<div class="muted">Oyunun evresine göre değişir</div></div><button class="btn small toggle" data-a="snd" data-v="music" data-snd="music"></button></div>
    </div>
    <div class="card"><h3>🗞️ Haberler</h3><div data-news></div></div>
    <div class="card center"><button class="btn sec small" data-a="reset">Oyunu sıfırla</button></div>`;
  return h;
}

/* ---------------- Panel: değerler ---------------- */

function els(attr, key) {
  return panel.querySelectorAll(`[${attr}="${key}"]`);
}
function txt(key, value) {
  const v = String(value);
  for (const el of els('data-k', key)) if (el.textContent !== v) el.textContent = v;
}
function wid(key, p) {
  const v = `${Math.max(0, Math.min(100, p)).toFixed(1)}%`;
  for (const el of els('data-w', key)) if (el.style.width !== v) el.style.width = v;
}
function dis(key, d) {
  for (const el of els('data-dis', key)) el.disabled = !!d;
}

function update(s) {
  updateSoundButtons();
  if (ui.tab === 'city') updateCity(s);
  else if (ui.tab === 'depot') updateDepot(s);
  else if (ui.tab === 'factory') updateFactory(s);
  else updateCompany(s);
}

function updateCity(s) {
  if (s.phase === 'cleanup') {
    const c = s.contract;
    const left = c.deadline - c.elapsed;
    txt('c-pay', `💰 ${fmt(c.pay)}`);
    txt('c-time', left >= 0 ? fmtTime(left) : `+${fmtTime(-left)} gecikme`);
    wid('c-anger', c.anger);
    txt('c-anger', `%${Math.round(c.anger)}`);
    for (const t of CREW_TYPES) txt(`pool-${t}`, `${sim.crewFree(s, t)}/${s.crews[t]}`);
    if (ui.selected != null) {
      const sec = s.sectors[ui.selected];
      wid('r', pct(sec.rubble, sec.rubbleMax));
      txt('r', sec.rubble > 0 ? `${Math.ceil(sec.rubble)} t` : sec.rubbleMax > 0 ? '✓' : '—');
      wid('f', sec.fire);
      txt('f', sec.fire > 0 ? `%${Math.ceil(sec.fire)}` : '—');
      wid('k', pct(sec.corpse, sec.corpseMax));
      txt('k', sec.corpse > 0 ? `${Math.ceil(sec.corpse)} t` : sec.corpseMax > 0 ? '✓' : '—');
      for (const t of CREW_TYPES) {
        const work = sec[WORK[t]] > 0;
        txt(`cw-${t}`, sec.crews[t]);
        dis(`cm-${t}`, sec.crews[t] <= 0);
        dis(`cp-${t}`, sim.crewFree(s, t) <= 0 || !work);
        let note = CREWS[t].desc;
        if (!work) note = 'Bu bölgede iş yok';
        else if (t !== 'fire' && sec.fire > 0) note = '🔥 Yangın var: %30 hızla çalışır';
        else if (t === 'carve' && sim.storageFree(s) <= 0) note = '📦 Depo dolu, çalışamıyor';
        txt(`cwn-${t}`, note);
      }
    }
  } else if (s.phase === 'calm') {
    txt('calm-timer', fmtTime(s.timer));
    dis('skip', s.timer <= 3);
    s.sectors.forEach((sec, i) => {
      const clean = sim.sectorClean(sec);
      const max = sec.level >= BAL.sectorMax;
      const cost = sim.sectorUpgradeCost(sec);
      txt(`lv-${i}`, stars(sec.level));
      txt(`sec-st-${i}`, clean ? `+${fmt1(sec.level * BAL.incomePerLevel)} 💰/sn` : 'Temizlenmeyi bekliyor');
      txt(`sec-cost-${i}`, max ? 'MAKS' : `🏗️ ${fmt(cost)}`);
      dis(`sec-up-${i}`, max || !clean || s.money < cost);
    });
  } else if (s.phase === 'rival') {
    wid('rv', (s.rivalT / BAL.rivalTime) * 100);
  }
}

function updateDepot(s) {
  const used = sim.storageUsed(s);
  const cap = sim.storageCap(s);
  wid('stor', pct(used, cap));
  txt('stor', `${used}/${cap}`);
  for (const k of ITEM_KEYS) {
    const m = s.market[k];
    const p = sim.price(s, k);
    const prev = m.hist[Math.max(0, m.hist.length - 6)];
    const up = m.m >= prev;
    txt(`inv-${k}`, s.inv[k]);
    for (const el of els('data-k', `pr-${k}`)) {
      const v = `💰${fmt(p)} ${up ? '▲' : '▼'}`;
      if (el.textContent !== v) el.textContent = v;
      el.classList.toggle('up', up);
      el.classList.toggle('down', !up);
    }
    const bm = sim.boomMult(s, k);
    txt(`boom-${k}`, bm > 1 ? `×${bm} ${Math.ceil((s.boom.until - Date.now()) / 1000)} sn` : '');
    dis(`s1-${k}`, s.inv[k] <= 0);
    dis(`sa-${k}`, s.inv[k] <= 0);
    const cv = panel.querySelector(`[data-spark="${k}"]`);
    if (cv) spark(cv, m.hist);
  }
  txt('dna', s.dna);
}

function spark(cv, hist) {
  const c = cv.getContext('2d');
  const w = cv.width;
  const h = cv.height;
  c.clearRect(0, 0, w, h);
  let mn = Math.min(...hist);
  let mx = Math.max(...hist);
  if (mx - mn < 0.06) {
    mx += 0.03;
    mn -= 0.03;
  }
  c.beginPath();
  hist.forEach((v, i) => {
    const x = (i / (hist.length - 1)) * w;
    const y = h - 3 - ((v - mn) / (mx - mn)) * (h - 6);
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  });
  c.strokeStyle = hist[hist.length - 1] >= hist[0] ? '#5bd97a' : '#ff5d5d';
  c.lineWidth = 3;
  c.stroke();
}

function updateFactory(s) {
  const slots = sim.factorySlots(s);
  const now = Date.now();
  for (let i = 0; i < slots; i++) {
    const j = s.jobs[i];
    if (j) {
      const r = RECIPES.find((x) => x.id === j.rid);
      const left = (j.end - now) / 1000;
      txt(`job-n-${i}`, `${ITEMS[r.out].icon} ${ITEMS[r.out].name}`);
      txt(`job-t-${i}`, left > 0 ? fmtTime(left) : 'Depo dolu, bekliyor');
      wid(`job-${i}`, pct(now - j.start, j.end - j.start));
    } else {
      txt(`job-n-${i}`, 'Boş hat');
      txt(`job-t-${i}`, '');
      wid(`job-${i}`, 0);
    }
  }
  for (const r of RECIPES) {
    const [inKey, inN] = Object.entries(r.in)[0];
    const rawValue = sim.price(s, inKey) * inN;
    const outValue = sim.price(s, r.out);
    const gain = Math.round((outValue / rawValue - 1) * 100);
    txt(`rv-${r.id}`, `Elinde ${s.inv[inKey]}/${inN} ${ITEMS[inKey].icon} · Ham 💰${fmt(rawValue)} → Ürün 💰${fmt(outValue)} (${gain >= 0 ? '+' : ''}${gain}%)`);
    dis(`job-${r.id}`, !sim.canStart(s, r) || s.jobs.length >= slots);
  }
}

function updateCompany(s) {
  for (const t of CREW_TYPES) {
    const cost = sim.crewCost(s, t);
    txt(`own-${t}`, s.crews[t]);
    txt(`hc-${t}`, `💰${fmt(cost)}`);
    dis(`hire-${t}`, s.money < cost);
  }
  for (const k in UPGRADES) {
    const u = UPGRADES[k];
    const max = s.upgrades[k] >= u.max;
    const cost = sim.upgradeCost(s, k);
    txt(`ul-${k}`, `Sv ${s.upgrades[k]}/${u.max}`);
    txt(`uc-${k}`, max ? 'MAKS' : `💰${fmt(cost)}`);
    dis(`upg-${k}`, max || s.money < cost);
  }
  txt('st-c', s.stats.contracts);
  txt('st-l', s.stats.lost);
  txt('st-p', fmt(s.stats.parts));
  txt('st-e', `💰${fmt(s.stats.earned)}`);
  txt('st-a', s.attackLevel);
  txt('st-r', `⭐${Math.round(s.rival.rep)}`);
  const topT = s.news[0] ? s.news[0].t : 0;
  if (topT !== lastNewsT) {
    lastNewsT = topT;
    const box = panel.querySelector('[data-news]');
    if (box) {
      box.innerHTML = s.news.length
        ? s.news.slice(0, 12).map((x) => `<div class="news-item">${escapeHTML(x.text)}</div>`).join('')
        : '<div class="muted">Henüz haber yok.</div>';
    }
  }
}

const escapeHTML = (t) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/* ---------------- Pencereler ---------------- */

export function queueModal(m) {
  if (m.type === 'tender' && (current?.type === 'tender' || queue.some((x) => x.type === 'tender'))) return;
  queue.push(m);
  if (!current) nextModal();
}

function nextModal() {
  current = queue.shift() || null;
  if (current && current.type === 'tender') {
    tenderSel = { bid: 1, speed: 1 };
    tenderResult = null;
    if (!game.s.tender) {
      current = null;
      nextModal();
      return;
    }
  }
  if (current && current.type === 'buyer' && game.s.dna <= 0) {
    current = null;
    nextModal();
    return;
  }
  if (current && current.type === 'result') {
    const r = current.data.ratio;
    play(r <= 0.75 ? 'record' : r <= 1 ? 'win' : 'late');
  }
  renderModal();
}

function closeModal() {
  current = null;
  tenderResult = null;
  modalRoot.innerHTML = '';
  nextModal();
}

function renderModal() {
  if (!current) {
    modalRoot.innerHTML = '';
    return;
  }
  const s = game.s;
  let html = '';
  switch (current.type) {
    case 'intro':
      html = `<div class="logo">AFTERMATH</div>
        <p class="center muted">Herkes savaşı izler. Sen, savaştan sonrasını temizlersin.</p>
        <p>Dev canavarlar şehre saldırıyor, savunma robotları onları yere seriyor. Geriye enkaz, yangın ve sokağın ortasında yatan <b>dev bir canavar</b> kalıyor.</p>
        <p>Temizlik ihalelerini kazan, ekiplerini sahaya sür, canavar parçalarını işleyip sat ve <b>Aftermath Co.</b>’yu dünyanın en büyük temizlik şirketine dönüştür.</p>
        <div class="btns"><button class="btn" data-a="m-intro">Şirketi kur</button></div>`;
      break;
    case 'tender':
      html = tenderResult ? tenderResultHTML(tenderResult) : tenderHTML(s);
      break;
    case 'result':
      html = resultHTML(current.data);
      break;
    case 'buyer':
      html = `<h2>🕴️ Gizli alıcı</h2>
        <p>Siyah bir araba şirketin önünde duruyor. Takım elbiseli biri fısıldıyor:</p>
        <p><i>"Elinizde bir canavar DNA örneği olduğunu duydum. <b>💰${fmt(s.flags.buyerOffer)}</b> nakit. Soru yok."</i></p>
        <p class="muted">Satarsan sıradaki canavar... farklı olabilir. Ve haber sızarsa itibarın zarar görür.</p>
        <div class="btns"><button class="btn sec" data-a="m-buyer" data-v="no">Reddet, bağışla</button><button class="btn" data-a="m-buyer" data-v="yes">Sat</button></div>`;
      break;
    case 'offline':
      html = `<h2>👋 Tekrar hoş geldin!</h2>
        <p>Sen ${fmtAway(current.data.away)} yokken bakım sözleşmelerin <b>💰${fmt(current.data.earned)}</b> kazandırdı.</p>
        <div class="btns"><button class="btn" data-a="m-close">Topla</button></div>`;
      break;
    case 'reset':
      html = `<h2>Oyunu sıfırla?</h2><p>Tüm ilerlemen silinir. Bu geri alınamaz.</p>
        <div class="btns"><button class="btn sec" data-a="m-close">Vazgeç</button><button class="btn" data-a="m-reset">Sıfırla</button></div>`;
      break;
  }
  modalRoot.innerHTML = `<div class="overlay"><div class="modal">${html}</div></div>`;
}

function fmtAway(sec) {
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))} dakika`;
  return `${fmt1(sec / 3600)} saat`;
}

function tenderHTML(s) {
  const tn = s.tender;
  if (!tn) return '<p>İhale kapandı.</p><div class="btns"><button class="btn" data-a="m-close">Tamam</button></div>';
  const t = sim.totals(s);
  const bids = [[0.75, 'Düşük'], [1, 'Normal'], [1.25, 'Yüksek']];
  const speeds = [[0.7, 'Hızlı'], [1, 'Normal'], [1.4, 'Rahat']];
  const chance = sim.winChance(s, tenderSel.bid, tenderSel.speed);
  const cCls = chance >= 0.65 ? 'hi' : chance >= 0.4 ? 'mid' : 'lo';
  return `<h2>📝 Temizlik ihalesi</h2>
    <div class="dmg">
      <div>🏚️ <b>${fmt(t.rubble)}</b> ton enkaz</div>
      <div>🦖 <b>${fmt(t.corpse)}</b> ton canavar</div>
      <div>🔥 <b>${t.fireSectors}</b> bölgede yangın</div>
      <div>🏛️ Bütçe <b>💰${fmt(tn.value)}</b></div>
    </div>
    <div class="muted">Teklifin</div>
    <div class="seg">${bids.map(([v, l]) => `<button class="${tenderSel.bid === v ? 'sel' : ''}" data-a="m-bid" data-v="${v}">${l}<b>💰${fmt(tn.value * v)}</b></button>`).join('')}</div>
    <div class="muted">Teslim sözü</div>
    <div class="seg">${speeds.map(([v, l]) => `<button class="${tenderSel.speed === v ? 'sel' : ''}" data-a="m-speed" data-v="${v}">${l}<b>${fmtTime(tn.baseDeadline * v)}</b></button>`).join('')}</div>
    <div class="row"><div class="grow muted">Rakip: ${RIVAL} (⭐${Math.round(s.rival.rep)}) · Senin itibarın ⭐${Math.round(s.rep)}</div></div>
    <div class="row"><div class="grow">Kazanma şansı</div><span class="chance ${cCls}">%${Math.round(chance * 100)}</span></div>
    <p class="muted" style="margin-top:8px">Düşük fiyat ve hızlı teslim sözü şansını artırır, ama daha az kazanırsın ve süre baskısı büyür. Sözü erken bitirirsen %25 bonus alırsın.</p>
    <div class="btns"><button class="btn wide" data-a="m-submit">Teklif ver</button></div>`;
}

function tenderResultHTML(r) {
  if (r.win) {
    return `<h2>💪 İhale senin!</h2>
      <p>Belediye <b>💰${fmt(r.pay)}</b> karşılığında <b>${fmtTime(r.deadline)}</b> içinde temizlik sözünü kabul etti.</p>
      <p class="muted">Canavar parçaları da senin. Bölgelere dokunup ekiplerini ata. Yangınlar önce!</p>
      <div class="btns"><button class="btn wide" data-a="m-close">Temizliğe başla</button></div>`;
  }
  return `<h2>😤 ${RIVAL} kazandı</h2>
    <p>Rakibin teklifi: <b>💰${fmt(r.rivalPay)}</b> · <b>${fmtTime(r.rivalDeadline)}</b>. Belediye onları seçti.</p>
    <p class="muted">İtibarını artırmak ve daha cesur teklifler vermek şansını yükseltir.</p>
    <div class="btns"><button class="btn wide" data-a="m-close">Tamam</button></div>`;
}

function resultHTML(r) {
  const title = r.ratio <= 0.75 ? '🏆 Rekor temizlik!' : r.ratio <= 1 ? '✅ Zamanında teslim' : '😬 Geç kaldın';
  return `<h2>${title}</h2>
    <div class="kv" style="margin-bottom:6px">
      <span>Süre</span><b>${fmtTime(r.elapsed)} / ${fmtTime(r.deadline)}</b>
      <span>Sözleşme ödemesi</span><b>💰${fmt(r.pay)}</b>
      ${r.bonus ? `<span>Erken bitirme bonusu</span><b class="up">+💰${fmt(r.bonus)}</b>` : ''}
      <span>Halk öfkesi</span><b>%${Math.round(r.anger)}</b>
      <span>İtibar</span><b class="${r.repD >= 0 ? 'up' : 'down'}">${r.repD >= 0 ? '+' : ''}${r.repD}</b>
    </div>
    <p class="muted">Şimdi parçaları Fabrika’da işle, Depo’dan sat ve bakım sözleşmelerine yatırım yap. Sıradaki saldırı yolda...</p>
    <div class="btns"><button class="btn wide" data-a="m-close">Harika</button></div>`;
}

/* ---------------- Bildirimler ---------------- */

function showToast(text, kind) {
  const el = document.createElement('div');
  el.className = `toast ${kind || ''}`;
  el.textContent = text;
  toastBox.appendChild(el);
  while (toastBox.children.length > 3) toastBox.firstChild.remove();
  setTimeout(() => el.remove(), 2400);
}

/* ---------------- Ses düğmeleri ---------------- */

function updateSoundButtons() {
  for (const el of document.querySelectorAll('[data-snd]')) {
    const k = el.dataset.snd;
    const onState = k === 'any' ? prefs.sfx || prefs.music : prefs[k];
    el.classList.toggle('off', !onState);
    const label = k === 'any' ? (onState ? '🔊' : '🔇') : onState ? 'Açık' : 'Kapalı';
    if (el.textContent !== label) el.textContent = label;
  }
}
