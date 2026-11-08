// Aftermath — oyun simülasyonu (ekonomi, saldırılar, temizlik, ihaleler)
import {
  SECTORS, ITEMS, RECIPES, CREWS, CREW_TYPES, WORK, MONSTERS, UPGRADES, BAL, RAW, RIVAL, neighbors,
} from './data.js';
import { emit } from './bus.js';
import { rand, pick, clamp, shuffle, fmt, fmtTime } from './util.js';

/* ---------------- Hesaplamalar ---------------- */

export const speedMult = (s) => 1 + 0.25 * s.upgrades.speed;
export const storageCap = (s) => BAL.storageBase + BAL.storageStep * s.upgrades.storage;
export function storageUsed(s) {
  let n = 0;
  for (const k in ITEMS) n += s.inv[k];
  return n;
}
export const storageFree = (s) => Math.max(0, storageCap(s) - storageUsed(s));
export const incomePerSec = (s) => s.sectors.reduce((a, x) => a + x.level, 0) * BAL.incomePerLevel;
export const crewAssigned = (s, t) => s.sectors.reduce((a, x) => a + x.crews[t], 0);
export const crewFree = (s, t) => s.crews[t] - crewAssigned(s, t);
const round10 = (n) => Math.round(n / 10) * 10;
export const crewCost = (s, t) => round10(CREWS[t].base * Math.pow(1.5, s.crews[t]));
export const upgradeCost = (s, k) => round10(UPGRADES[k].base * Math.pow(UPGRADES[k].mult, s.upgrades[k]));
export const sectorUpgradeCost = (sec) => round10(BAL.sectorBase * Math.pow(1.85, sec.level));
export const factorySlots = (s) => 1 + s.upgrades.factory;
export const sectorClean = (sec) => sec.rubble <= 0 && sec.fire <= 0 && sec.corpse <= 0;
export const cityClean = (s) => s.sectors.every(sectorClean);

export function totals(s) {
  const t = { rubble: 0, fire: 0, corpse: 0, fireSectors: 0 };
  for (const x of s.sectors) {
    t.rubble += x.rubble;
    t.fire += x.fire;
    t.corpse += x.corpse;
    if (x.fire > 0) t.fireSectors++;
  }
  return t;
}

export function boomMult(s, item) {
  return s.boom && s.boom.item === item && s.boom.until > Date.now() ? s.boom.mult : 1;
}
export const price = (s, item) => Math.max(1, Math.round(ITEMS[item].base * s.market[item].m * boomMult(s, item)));

export function canStart(s, r) {
  for (const k in r.in) if (s.inv[k] < r.in[k]) return false;
  return true;
}

/* ---------------- Haber & bildirim ---------------- */

const toast = (text, kind = '') => emit('toast', { text, kind });
const sfx = (name, arg) => emit('sfx', { name, arg });

export function news(s, text) {
  s.news.unshift({ t: Date.now(), text });
  if (s.news.length > 30) s.news.length = 30;
  emit('news', text);
}

/* ---------------- Ana döngü ---------------- */

export function tick(s, dt) {
  s.money += incomePerSec(s) * dt;
  s.mkAcc = (s.mkAcc || 0) + dt;
  if (s.mkAcc >= 2) {
    s.mkAcc -= 2;
    marketTick(s);
  }
  jobsTick(s);

  switch (s.phase) {
    case 'calm':
      s.timer -= dt;
      if (s.flags.buyerAt != null && s.timer <= s.flags.buyerAt) {
        s.flags.buyerAt = null;
        if (s.dna > 0) {
          sfx('mystery');
          emit('modal', { type: 'buyer' });
        }
      }
      if (s.timer <= 0) startAttack(s);
      break;
    case 'attack':
      s.attack.t += dt;
      if (!s.attack.hit && s.attack.t >= BAL.attackHit) applyHit(s);
      if (s.attack.t >= BAL.attackEnd) openTender(s);
      break;
    case 'cleanup':
      cleanupTick(s, dt);
      break;
    case 'rival':
      rivalTick(s, dt);
      break;
  }
}

/* ---------------- Piyasa ---------------- */

function marketTick(s) {
  for (const k in s.market) {
    const m = s.market[k];
    m.m = clamp(m.m + (1 - m.m) * 0.05 + (Math.random() - 0.5) * 0.07, 0.35, 2.2);
    m.hist.push(m.m);
    if (m.hist.length > 40) m.hist.shift();
  }
  if (s.boom && s.boom.until <= Date.now()) s.boom = null;
  if (!s.boom && s.attackLevel > 0 && s.phase !== 'attack' && Math.random() < 0.012) startBoom(s);
}

function startBoom(s) {
  const options = [
    ['armor', 'Ordu acil zırh alımı yapıyor', 1.7],
    ['cell', 'Enerji krizi: Hücre fiyatları uçtu', 1.6],
    ['concrete', 'İnşaat patlaması: Kemik beton kapış kapış', 1.6],
    ['relic', 'Müzeler arası açık artırma çılgınlığı', 1.5],
    ['scale', 'Ünlü moda markası canavar pulu koleksiyonu çıkardı', 1.8],
  ];
  const [item, text, mult] = pick(options);
  s.boom = { item, mult, until: Date.now() + 60000 };
  news(s, `📈 ${text}! ${ITEMS[item].name} fiyatı ×${mult} (60 sn)`);
}

export function sell(s, item, qty) {
  qty = Math.min(qty, s.inv[item]);
  if (qty <= 0) return;
  let total = 0;
  for (let i = 0; i < qty; i++) {
    total += price(s, item);
    s.market[item].m = Math.max(0.35, s.market[item].m - ITEMS[item].elastic);
  }
  s.inv[item] -= qty;
  s.money += total;
  s.stats.earned += total;
  sfx('cash', qty >= 10);
  toast(`+${fmt(total)} 💰  (${qty}× ${ITEMS[item].icon})`, 'good');
}

/* ---------------- Fabrika ---------------- */

export function startJob(s, rid, silent = false) {
  const r = RECIPES.find((x) => x.id === rid);
  if (s.jobs.length >= factorySlots(s)) return silent || toast('Tüm üretim hatları dolu', 'bad');
  if (!canStart(s, r)) return silent || toast('Yetersiz malzeme', 'bad');
  for (const k in r.in) s.inv[k] -= r.in[k];
  const now = Date.now();
  s.jobs.push({ rid, start: now, end: now + r.time * 1000 });
  return true;
}

function jobsTick(s) {
  const now = Date.now();
  for (let i = s.jobs.length - 1; i >= 0; i--) {
    const j = s.jobs[i];
    if (now < j.end) continue;
    if (storageFree(s) < 1) continue; // depo dolu: ürün bekliyor
    const r = RECIPES.find((x) => x.id === j.rid);
    s.inv[r.out] += 1;
    s.jobs.splice(i, 1);
    sfx('factory');
    toast(`🏭 ${ITEMS[r.out].icon} ${ITEMS[r.out].name} hazır`, 'good');
    if (s.autoJobs[r.id]) startJob(s, r.id, true);
  }
}

/* ---------------- Şirket ---------------- */

export function hire(s, type) {
  const cost = crewCost(s, type);
  if (s.money < cost) return toast('Yetersiz bakiye', 'bad');
  s.money -= cost;
  s.crews[type] += 1;
  sfx('buy');
  toast(`${CREWS[type].icon} Yeni ${CREWS[type].name.toLowerCase()} işe alındı`, 'good');
}

export function buyUpgrade(s, key) {
  const u = UPGRADES[key];
  if (s.upgrades[key] >= u.max) return;
  const cost = upgradeCost(s, key);
  if (s.money < cost) return toast('Yetersiz bakiye', 'bad');
  s.money -= cost;
  s.upgrades[key] += 1;
  sfx('buy');
  toast(`${u.icon} ${u.name} seviye ${s.upgrades[key]}`, 'good');
}

export function upgradeSector(s, i) {
  const sec = s.sectors[i];
  if (s.phase === 'attack') return;
  if (!sectorClean(sec)) return toast('Önce bölge temizlenmeli', 'bad');
  if (sec.level >= BAL.sectorMax) return;
  const cost = sectorUpgradeCost(sec);
  if (s.money < cost) return toast('Yetersiz bakiye', 'bad');
  s.money -= cost;
  sec.level += 1;
  emit('float', { sector: i, text: `🏗️ Seviye ${sec.level}`, color: '#ffe066' });
}

export function skipWait(s) {
  if (s.phase === 'calm' && s.timer > 3) {
    s.timer = 3;
    sfx('radar');
    toast('⏩ Radar hızlandırıldı');
  }
}

/* ---------------- Saldırı ---------------- */

export function startAttack(s) {
  s.attackLevel += 1;
  const L = s.attackLevel;
  const mutant = !!s.flags.mutantNext;
  s.flags.mutantNext = false;
  const id = 'magmadon';
  const mon = MONSTERS[id];
  const size = (1 + 0.35 * (L - 1)) * (mutant ? 1.45 : 1);

  // Canavarın yere düştüğü bölgeler (baş → kuyruk)
  const head = Math.floor(Math.random() * SECTORS.length);
  const chain = [head];
  const segs = L >= 3 || mutant ? 3 : 2;
  let cur = head;
  while (chain.length < segs) {
    const opts = neighbors(cur).filter((n) => !chain.includes(n));
    if (!opts.length) break;
    cur = pick(opts);
    chain.push(cur);
  }
  const shares = chain.length === 3 ? [0.32, 0.43, 0.25] : chain.length === 2 ? [0.45, 0.55] : [1];
  const hit = new Set(chain);
  const others = shuffle(SECTORS.map((x) => x.id).filter((i) => !hit.has(i)));
  others.slice(0, L >= 2 ? 2 : 1).forEach((i) => hit.add(i));

  s.attack = {
    t: 0, hit: false, monster: id, mutant, L, chain, shares,
    sectors: [...hit], corpseTotal: mon.corpse * size, rubbleTotal: mon.rubble * size,
  };
  s.phase = 'attack';
  for (const sec of s.sectors) sec.crews = { fire: 0, debris: 0, carve: 0 };
  news(s, mutant
    ? `☣️ MUTANT ${mon.name.toUpperCase()} şehre saldırıyor! Uzmanlar: "Bu doğal değil."`
    : `⚠️ ${mon.name} şehre saldırıyor! Savunma robotları havalandı.`);
  emit('phase');
  emit('attack-start');
}

function applyHit(s) {
  const a = s.attack;
  a.hit = true;
  const mon = MONSTERS[a.monster];
  const inChain = new Set(a.chain);
  const weights = a.sectors.map((i) => (inChain.has(i) ? 2 : 1));
  const wsum = weights.reduce((x, y) => x + y, 0);
  a.sectors.forEach((i, k) => {
    const sec = s.sectors[i];
    sec.rubble = a.rubbleTotal * (weights[k] / wsum) * rand(0.85, 1.15);
    sec.rubbleMax = sec.rubble;
    // Sadece canavarın üstüne düştüğü bölgeler seviye kaybeder
    if (inChain.has(i) && sec.level > 0) sec.level -= 1;
  });
  a.chain.forEach((i, k) => {
    const sec = s.sectors[i];
    sec.corpse = a.corpseTotal * a.shares[k];
    sec.corpseMax = sec.corpse;
    sec.role = k === 0 ? 'head' : 'body';
  });
  if (mon.fire) {
    const n = Math.min(a.sectors.length, (a.L >= 2 ? 2 : 1) + (a.mutant ? 1 : 0) + (a.L >= 5 ? 1 : 0));
    shuffle([...a.sectors]).slice(0, n).forEach((i) => {
      s.sectors[i].fire = rand(60, 100);
    });
  }
  emit('shake', { power: 20 });
  emit('hit', { chain: a.chain, sectors: a.sectors });
  try {
    if (navigator.vibrate) navigator.vibrate([90, 40, 180]);
  } catch {
    /* titreşim desteklenmiyor */
  }
}

/* ---------------- İhale ---------------- */

function openTender(s) {
  const a = s.attack;
  const sumLv = s.sectors.reduce((x, y) => x + y.level, 0);
  const value = round10(BAL.baseContract * (1 + 0.45 * (a.L - 1)) * (1 + 0.04 * sumLv) * (a.mutant ? 1.4 : 1));
  const t = totals(s);
  const baseDeadline = Math.round(30 + 0.35 * t.rubble + 0.55 * t.corpse + 0.2 * t.fire);
  s.tender = { value, baseDeadline };
  s.phase = 'tender';
  emit('phase');
  emit('modal', { type: 'tender' });
}

const isFirstTender = (s) => s.stats.contracts === 0 && s.stats.lost === 0;

function scoreFor(rep, bid, speed) {
  return rep * 0.4 + (1.3 - bid) * 60 + (1.4 - speed) * 40;
}

export function winChance(s, bid, speed) {
  if (isFirstTender(s)) return 1;
  let rival = scoreFor(s.rival.rep, 0.98, 1.05);
  if (s.flags.lossStreak >= 2) rival -= 25;
  return clamp(0.5 + (scoreFor(s.rep, bid, speed) - rival) / 50, 0.03, 0.97);
}

export function resolveTender(s, bid, speed) {
  const tn = s.tender;
  if (!tn || s.phase !== 'tender') return null;
  const rb = rand(0.78, 1.18);
  const rs = rand(0.8, 1.3);
  const ps = scoreFor(s.rep, bid, speed) + rand(0, 15);
  let rsc = scoreFor(s.rival.rep, rb, rs) + rand(0, 15);
  if (s.flags.lossStreak >= 2) rsc -= 25;
  const win = isFirstTender(s) || ps >= rsc;
  const result = {
    win, value: tn.value,
    pay: Math.round(tn.value * bid), deadline: Math.round(tn.baseDeadline * speed),
    rivalPay: Math.round(tn.value * rb), rivalDeadline: Math.round(tn.baseDeadline * rs),
  };
  if (win) {
    s.flags.lossStreak = 0;
    s.contract = { pay: result.pay, deadline: result.deadline, elapsed: 0, anger: 0 };
    s.phase = 'cleanup';
    news(s, `📝 Aftermath Co. ihaleyi kazandı! Söz: ${fmtTime(result.deadline)} içinde pırıl pırıl.`);
  } else {
    s.flags.lossStreak += 1;
    s.stats.lost += 1;
    s.rival.rep = clamp(s.rival.rep + 2, 0, 100);
    for (const sec of s.sectors) {
      sec.r0 = sec.rubble;
      sec.f0 = sec.fire;
      sec.c0 = sec.corpse;
    }
    s.rivalT = 0;
    s.phase = 'rival';
    news(s, `😤 ${RIVAL} ihaleyi kaptı. Temizlik ağır ağır ilerliyor...`);
  }
  s.tender = null;
  emit('phase');
  return result;
}

/* ---------------- Temizlik ---------------- */

export function assignCrew(s, i, type, d) {
  if (s.phase !== 'cleanup') return;
  const sec = s.sectors[i];
  if (d > 0) {
    if (crewFree(s, type) <= 0) return toast(`Boşta ${CREWS[type].name.toLowerCase()} yok`, 'bad');
    if (sec[WORK[type]] <= 0) return toast('Bu bölgede bu iş yok', 'bad');
    sec.crews[type] += 1;
  } else if (sec.crews[type] > 0) {
    sec.crews[type] -= 1;
  }
}

export function autoAssign(s) {
  if (s.phase !== 'cleanup') return;
  let moved = 0;
  for (const type of CREW_TYPES) {
    const key = WORK[type];
    while (crewFree(s, type) > 0) {
      let best = null;
      let bestScore = 0;
      for (const sec of s.sectors) {
        if (sec[key] <= 0) continue;
        let score = sec[key] / (sec.crews[type] + 1);
        if (type !== 'fire' && sec.fire > 0) score *= 0.4;
        if (type === 'carve' && sec.role === 'head') score *= 1.3;
        if (score > bestScore) {
          bestScore = score;
          best = sec;
        }
      }
      if (!best) break;
      best.crews[type] += 1;
      moved++;
    }
  }
  toast(moved ? `⚡ ${moved} ekip sahaya yollandı` : 'Boşta ekip yok', moved ? 'good' : '');
}

function release(s, sec, type) {
  if (sec.crews[type] > 0) {
    sec.crews[type] = 0;
    emit('float', { sector: sec.id, text: `✓ ${CREWS[type].icon} boşa çıktı`, color: '#8ef0b0' });
  }
}

function yieldParts(s, sec, amt) {
  const mult = s.attack && s.attack.mutant ? 1.25 : 1;
  for (const k in BAL.yields) {
    s.yieldAcc[k] += amt * BAL.yields[k] * mult;
    while (s.yieldAcc[k] >= 1 && storageFree(s) > 0) {
      s.yieldAcc[k] -= 1;
      s.inv[k] += 1;
      s.stats.parts += 1;
      emit('float', { sector: sec.id, text: `+1 ${ITEMS[k].icon}` });
    }
  }
}

function finishSegment(s, sec) {
  if (sec.role === 'head') {
    const mutant = s.attack && s.attack.mutant;
    const eyes = mutant ? 2 : 1;
    s.inv.eye += eyes;
    emit('float', { sector: sec.id, text: `+${eyes} 👁️ Göz!`, color: '#ffe066', big: true });
    if (Math.random() < (mutant ? 0.6 : 0.4)) {
      s.dna += 1;
      sfx('mystery');
      toast('🧬 Nadir bir DNA örneği buldun...', 'good');
    }
  }
  sec.role = null;
}

function cleanupTick(s, dt) {
  const c = s.contract;
  c.elapsed += dt;
  const sp = speedMult(s);
  let full = false;

  for (const sec of s.sectors) {
    const cr = sec.crews;
    if (cr.fire > 0 && sec.fire > 0) {
      sec.fire -= CREWS.fire.rate * sp * cr.fire * dt;
      if (sec.fire <= 0.01) {
        sec.fire = 0;
        release(s, sec, 'fire');
      }
    }
    const slow = sec.fire > 0 ? 0.3 : 1;
    if (cr.debris > 0 && sec.rubble > 0) {
      sec.rubble -= CREWS.debris.rate * sp * cr.debris * slow * dt;
      if (sec.rubble <= 0.01) {
        sec.rubble = 0;
        release(s, sec, 'debris');
      }
    }
    if (cr.carve > 0 && sec.corpse > 0) {
      if (storageFree(s) <= 0) {
        full = true;
      } else {
        const amt = Math.min(sec.corpse, CREWS.carve.rate * sp * cr.carve * slow * dt);
        sec.corpse -= amt;
        yieldParts(s, sec, amt);
        if (sec.corpse <= 0.01) {
          sec.corpse = 0;
          finishSegment(s, sec);
          release(s, sec, 'carve');
        }
      }
    }
    // Yangın yanan enkaza sıçrayabilir
    if (sec.fire > 50 && Math.random() < 0.02 * dt) {
      const ns = s.sectors[pick(neighbors(sec.id))];
      if (ns.fire <= 0 && (ns.rubble > 0 || ns.corpse > 0)) {
        ns.fire = 35;
        emit('float', { sector: ns.id, text: '🔥 Yangın sıçradı!', color: '#ff7b39', big: true });
      }
    }
  }

  if (full && !s.fullWarned) toast('📦 Depo dolu! Parçalama durdu — sat ya da işle.', 'bad');
  s.fullWarned = full;

  const t = totals(s);
  let da = 0.12 + 0.002 * t.fire + 0.0008 * t.rubble;
  if (c.elapsed > c.deadline) da *= 3;
  c.anger = clamp(c.anger + da * dt, 0, 100);

  if (cityClean(s)) finishContract(s);
}

function scheduleBuyer(s) {
  if (s.dna > 0 && Math.random() < 0.7) {
    s.flags.buyerAt = BAL.calmTime * rand(0.3, 0.7);
    s.flags.buyerOffer = Math.round((2400 + 900 * s.attackLevel) / 50) * 50;
  }
}

function finishContract(s) {
  const c = s.contract;
  const ratio = c.elapsed / c.deadline;
  let pay = c.pay;
  let bonus = 0;
  let repD;
  if (ratio <= 0.75) {
    bonus = Math.round(pay * 0.25);
    repD = 8;
  } else if (ratio <= 1) {
    repD = 4;
  } else {
    pay = Math.round(pay * Math.max(0.4, 1 - (c.elapsed - c.deadline) / c.deadline));
    repD = -6;
  }
  repD -= Math.round(c.anger / 25);
  s.money += pay + bonus;
  s.stats.earned += pay + bonus;
  s.rep = clamp(s.rep + repD, 0, 100);
  s.stats.contracts += 1;
  for (const sec of s.sectors) {
    sec.crews = { fire: 0, debris: 0, carve: 0 };
    sec.role = null;
  }
  const result = { pay, bonus, repD, elapsed: c.elapsed, deadline: c.deadline, anger: c.anger, ratio };
  if (ratio <= 0.75) news(s, `🏆 Rekor! Şehir ${fmtTime(c.elapsed)} içinde temizlendi. Vatandaşlar şaşkın.`);
  else if (ratio <= 1) news(s, '✅ Aftermath Co. sözünü tuttu: Şehir zamanında temizlendi.');
  else news(s, '😠 Vatandaşlar isyanda: "Canavar kokusu hâlâ geçmedi!"');
  s.contract = null;
  s.phase = 'calm';
  s.timer = BAL.calmTime;
  scheduleBuyer(s);
  emit('phase');
  emit('modal', { type: 'result', data: result });
}

function rivalTick(s, dt) {
  s.rivalT += dt;
  const p = clamp(s.rivalT / BAL.rivalTime, 0, 1);
  for (const sec of s.sectors) {
    sec.rubble = (sec.r0 || 0) * (1 - p);
    sec.fire = (sec.f0 || 0) * (1 - p);
    sec.corpse = (sec.c0 || 0) * (1 - p);
  }
  if (p < 1) return;
  for (const sec of s.sectors) {
    sec.rubble = 0;
    sec.fire = 0;
    sec.corpse = 0;
    sec.role = null;
  }
  for (const k of RAW) s.market[k].m = clamp(s.market[k].m * 0.82, 0.35, 2.2);
  news(s, `📉 ${RIVAL} topladığı canavar parçalarını piyasaya döktü. Ham parça fiyatları düştü!`);
  s.phase = 'calm';
  s.timer = Math.round(BAL.calmTime * 0.7);
  emit('phase');
}

/* ---------------- Gizli alıcı ---------------- */

export function resolveBuyer(s, accept) {
  if (s.dna <= 0) return;
  const offer = s.flags.buyerOffer || 2500;
  s.dna -= 1;
  if (accept) {
    s.money += offer;
    s.stats.earned += offer;
    s.flags.mutantNext = true;
    toast(`+${fmt(offer)} 💰 Gizli alıcı memnun.`, 'good');
    if (Math.random() < 0.35) {
      s.rep = clamp(s.rep - 8, 0, 100);
      news(s, '🗞️ SKANDAL: "Aftermath Co. canavar DNA\'sı sattı" iddiası! İtibar sarsıldı.');
    }
  } else {
    s.rep = clamp(s.rep + 4, 0, 100);
    news(s, '🔬 Aftermath Co. bulduğu DNA örneğini bilim insanlarına bağışladı. Halk takdirle karşıladı.');
  }
}

/* ---------------- Çevrimdışı kazanç ---------------- */

export function applyOffline(s, seconds) {
  const t = Math.min(seconds, BAL.offlineCap);
  const earned = incomePerSec(s) * t * BAL.offlineRate;
  s.money += earned;
  if (s.phase === 'calm') s.timer = Math.max(2, s.timer - t);
  if (s.phase === 'rival') s.rivalT += t;
  return earned;
}
