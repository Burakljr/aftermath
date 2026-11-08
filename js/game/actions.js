// Aftermath v2: act(s, id, arg) — the single entry point for player actions (ARCH §4.2). Never throws.
import { CREWS, CREW_TYPES, ITEMS, ITEM_KEYS, BAL, ATTACK, recipeById } from './data.js';
import { REASON, NEWS, TENDER, TOAST, FLOAT } from './copy.js';
import { rand } from './rng.js';
import { fmtPct } from './format.js';
import {
  emit, sfx, toast, float, headline, say, post, isFree, blockReason, nearestFree, sendTo, sendHome, HOOKS,
  vehicleCost, owned, credit, startContract, startRival, releaseTailNow, startCalm, radarRuns, jobSectors,
  rizaAll, sellToRiza, canStartJob, startJobNow, upkeepCost, upkeepCap, round10, clamp, rebuildCrews,
} from './sim.js';
import { resolve, chance, cellTerms } from './tender.js';
import { ftueAllows } from './ftue.js';
import { goalDone } from './goals.js';
import { newVehicle } from './state.js';

const ok = (extra) => ({ ok: true, ...(extra || {}) });
const fail = (reason, code = 'rule') => ({ ok: false, code, reason });

/** FTUE key for an action: `dispatch:<type>:<sector>`, `buyVehicle:<type>`, `sellAll:<buyer>`, else the id. */
export function actionKey(id, arg) {
  const a = arg || {};
  if (id === 'dispatch') return `dispatch:${a.type}:${a.sector}`;
  if (id === 'buyVehicle') return `buyVehicle:${a.type}`;
  if (id === 'sellAll') return `sellAll:${a.buyer || 'riza'}`;
  return id;
}

export const upgradeCost = (s, key) => {
  if (key === 'speed') return round10(BAL.equipBase * Math.pow(BAL.equipMult, s.upgrades.speed));
  if (key === 'lines') return round10(BAL.lineBase * Math.pow(BAL.lineMult, s.upgrades.lines));
  return BAL.foremanCost;
};

/** Why an upgrade cannot be bought now, or null. */
export function upgradeBlock(s, key) {
  const u = s.progress.unlocked;
  if (key === 'speed') {
    if (!u.equipment) return REASON.locked;
    if (s.upgrades.speed >= BAL.equipMax) return REASON.maxLevel;
  } else if (key === 'lines') {
    if (!u.line2) return REASON.locked;
    if (s.upgrades.lines >= BAL.lineMax) return REASON.maxLevel;
  } else if (key === 'foreman') {
    if (!u.foreman) return REASON.locked;
    if (s.upgrades.foreman) return REASON.owned;
  } else {
    return REASON.locked;
  }
  const cost = upgradeCost(s, key);
  if (s.money < cost) return REASON.money(Math.ceil(cost - s.money));
  return null;
}

/** Why a vehicle cannot be bought now, or null. */
export function vehicleBlock(s, type) {
  if (!CREWS[type]) return REASON.locked;
  const cost = vehicleCost(s, type);
  if (s.money < cost) return REASON.money(Math.ceil(cost - s.money));
  return null;
}

/** Why upkeep cannot be signed for a district now, or null. */
export function upkeepBlock(s, id) {
  const sec = s.sectors[id];
  if (!sec || !s.progress.unlocked.upkeep) return REASON.locked;
  if (s.phase !== 'calm') return REASON.notCalm;
  if (sec.damaged) return REASON.damaged;
  if (sec.upkeep >= upkeepCap(s)) return REASON.maxTier;
  const cost = upkeepCost(sec.upkeep);
  if (s.money < cost) return REASON.money(Math.ceil(cost - s.money));
  return null;
}

/** Why a dispatch is refused (rule level), or null. */
export function dispatchBlock(s, type, id) {
  const sec = s.sectors[id];
  if (!sec || !CREWS[type]) return REASON.noJob;
  if (s.phase !== 'cleanup' && s.phase !== 'rival') return REASON.noJob;
  if (sec.rival) return REASON.rivalSite;
  const r = blockReason(sec, type);
  if (r) return REASON[r];
  if (!s.fleet.some((v) => v.type === type && isFree(v))) return REASON.noVehicle;
  return null;
}

function nextBay(s) {
  const used = new Set(s.fleet.map((v) => v.bay));
  let b = 0;
  while (used.has(b)) b++;
  return b;
}

const H = {
  skipAttack(s) {
    const a = s.attack;
    if (s.phase !== 'attack' || !a) return fail(REASON.wrongPhase);
    a.skip = true;
    if (!a.hit) a.t = Math.max(a.t, ATTACK.hit);
    return ok();
  },

  acceptCall(s) {
    const t = s.tender;
    if (s.phase !== 'tender' || !t || t.kind !== 'call') return fail(REASON.wrongPhase);
    startContract(s, 'call', t.call.pay, t.call.deadline);
    return ok();
  },

  selectTenderCell(s, arg) {
    const t = s.tender;
    if (s.phase !== 'tender' || !t || t.kind !== 'bid' || t.reveal) return fail(REASON.wrongPhase);
    const price = Number(arg && arg.price);
    const speed = Number(arg && arg.speed);
    if (![0, 1, 2].includes(price) || ![0, 1, 2].includes(speed)) return fail(REASON.wrongPhase);
    t.sel = { price, speed };
    return ok();
  },

  submitTender(s, arg, confirmed) {
    const t = s.tender;
    if (s.phase !== 'tender' || !t || t.kind !== 'bid' || t.reveal) return fail(REASON.wrongPhase);
    const c = cellTerms(t, t.sel.price, t.sel.speed);
    const p = chance(s, c.bid, c.speed);
    if (p < 0.4 && !s.progress.tips.redConfirm && !confirmed) return fail(REASON.confirmRed(fmtPct(p)), 'confirm');
    const r = resolve(s);
    if (r.win) {
      s.rival.lossStreak = 0;
      s.rival.rivalLosses += 1;
      s.stats.won += 1;
      headline(s, NEWS.won(r.you.deadline), 'tender');
    } else {
      s.rival.lossStreak += 1;
      s.rival.rivalLosses = 0;
      s.stats.lost += 1;
      s.rivalTrust = clamp(s.rivalTrust + 2, 0, 100);
      say(s, 'nevin', TENDER.loseLine, 6);
    }
    emit('tender-result', { win: r.win, chance: r.chance });
    sfx(r.win ? 'win' : 'lose');
    return ok({ win: r.win, chance: r.chance });
  },

  confirmRed(s) {
    s.progress.tips.redConfirm = true;
    return H.submitTender(s, null, true);
  },

  startWork(s) {
    const t = s.tender;
    if (s.phase !== 'tender' || !t || !t.reveal || !t.reveal.win) return fail(REASON.wrongPhase);
    startContract(s, 'bid', t.reveal.you.bid, t.reveal.you.deadline);
    return ok();
  },

  takeTail(s) {
    const t = s.tender;
    if (s.phase !== 'tender' || !t || !t.reveal || t.reveal.win) return fail(REASON.wrongPhase);
    startRival(s, true);
    headline(s, NEWS.lost, 'tender');
    if (s.npc && s.npc.text === TENDER.loseLine) s.npc = null; // the offer was taken; Nevin does not repeat it
    return ok({ tail: s.rival.tail });
  },

  releaseTail(s) {
    const t = s.tender;
    if (s.phase === 'tender' && t && t.reveal && !t.reveal.win) {
      startRival(s, false);
      if (s.npc && s.npc.text === TENDER.loseLine) s.npc = null;
      return ok();
    }
    if (s.phase === 'rival' && s.rival.tail != null) {
      releaseTailNow(s);
      return ok();
    }
    return fail(REASON.noTail);
  },

  dispatch(s, arg) {
    const type = arg && arg.type;
    const id = Number(arg && arg.sector);
    const why = dispatchBlock(s, type, id);
    if (why) return fail(why);
    const v = nearestFree(s, type, id);
    sendTo(s, v, id, HOOKS);
    if (s.contract) s.contract.idleT = 0;
    rebuildCrews(s);
    return ok({ vehicleId: v.id, eta: v.eta });
  },

  recall(s, arg) {
    const id = Number(arg && arg.sector);
    let v = null;
    for (const x of s.fleet) if (x.sector === id && x.state === 'enroute') v = x;
    if (!v) for (const x of s.fleet) if (x.sector === id && x.state === 'working') v = x;
    if (!v) return fail(REASON.noneHere);
    emit('recall', { vehicleId: v.id, sectorId: id });
    sendHome(s, v, HOOKS);
    rebuildCrews(s);
    return ok({ vehicleId: v.id });
  },

  collectPayment(s) {
    const r = s.result;
    if (!r) return fail(REASON.wrongPhase);
    const amount = r.pay + r.bonus;
    credit(s, amount);
    s.result = null;
    emit('payment', { amount });
    sfx('cash', true);
    if (s.progress.ftue === 'done') startCalm(s);
    return ok({ amount });
  },

  sellAll(s, arg) {
    const buyer = (arg && arg.buyer) || 'riza';
    if (buyer !== 'riza' || !s.progress.unlocked.depot) return fail(REASON.locked);
    const { total, qty } = rizaAll(s);
    if (qty <= 0) return fail(REASON.nothing);
    for (const k of ITEM_KEYS) if (s.inv[k] > 0) sellToRiza(s, k, s.inv[k]);
    credit(s, total);
    s.stats.sold += qty;
    emit('sale', { buyer: 'riza', item: 'all', qty, total });
    sfx('cash', qty >= 10);
    return ok({ total, qty });
  },

  sell(s, arg) {
    const item = arg && arg.item;
    if (!s.progress.unlocked.depot || !ITEMS[item]) return fail(REASON.locked);
    const qty = Math.min(Math.floor(Number(arg.qty) || s.inv[item]), s.inv[item]);
    if (qty <= 0) return fail(REASON.noStock);
    const total = Math.round(sellToRiza(s, item, qty));
    credit(s, total);
    s.stats.sold += qty;
    emit('sale', { buyer: 'riza', item, qty, total });
    sfx('cash', qty >= 10);
    return ok({ total, qty });
  },

  acceptOffer(s, arg) {
    const o = s.offers.find((x) => x.id === (arg && arg.offerId));
    if (!o || s.clock >= o.until) return fail(REASON.offerGone);
    const want = arg.qty == null ? o.qty : Math.floor(Number(arg.qty) || 0);
    const qty = Math.min(want, o.qty, s.inv[o.item]);
    if (qty <= 0) return fail(REASON.noStock);
    const total = o.unit * qty;
    s.inv[o.item] -= qty;
    o.qty -= qty;
    if (o.qty <= 0) s.offers.splice(s.offers.indexOf(o), 1);
    credit(s, total);
    s.stats.sold += qty;
    s.stats.offerSold += qty;
    emit('sale', { buyer: o.buyer, item: o.item, qty, total });
    sfx('cash', qty >= 10);
    return ok({ total, qty });
  },

  buyVehicle(s, arg) {
    const type = arg && arg.type;
    if (!s.progress.unlocked.company) return fail(REASON.locked);
    const why = vehicleBlock(s, type);
    if (why) return fail(why);
    const cost = vehicleCost(s, type);
    s.money -= cost;
    const v = newVehicle('v' + s.nextId++, type, nextBay(s));
    s.fleet.push(v);
    emit('purchase', { kind: 'vehicle', type, vehicleId: v.id });
    sfx('buy');
    toast(TOAST.bought(type), 'good');
    return ok({ vehicleId: v.id, cost });
  },

  buyUpgrade(s, arg) {
    const key = arg && arg.key;
    const why = upgradeBlock(s, key);
    if (why) return fail(why);
    const cost = upgradeCost(s, key);
    s.money -= cost;
    if (key === 'speed') s.upgrades.speed += 1;
    else if (key === 'lines') s.upgrades.lines += 1;
    else s.upgrades.foreman = true;
    emit('purchase', { kind: 'upgrade', type: key });
    sfx('buy');
    return ok({ cost });
  },

  startJob(s, arg) {
    const rid = arg && arg.rid;
    const c = canStartJob(s, rid);
    if (!c.ok) return fail(c.code === 'material' ? REASON.material(c.n, c.item) : REASON[c.code]);
    const j = startJobNow(s, rid);
    sfx('factory');
    return ok({ jobId: j.id });
  },

  toggleAuto(s, arg) {
    const rid = arg && arg.rid;
    if (!s.progress.unlocked.autoRepeat) return fail(REASON.autoLocked);
    if (!recipeById(rid) || !s.progress.recipes[rid]) return fail(REASON.locked);
    s.autoJobs[rid] = !s.autoJobs[rid];
    if (s.autoJobs[rid] && canStartJob(s, rid).ok) startJobNow(s, rid);
    return ok({ on: s.autoJobs[rid] });
  },

  signUpkeep(s, arg) {
    const id = Number(arg && arg.sector);
    const why = upkeepBlock(s, id);
    if (why) return fail(why);
    const sec = s.sectors[id];
    const cost = upkeepCost(sec.upkeep);
    s.money -= cost;
    sec.upkeep += 1;
    emit('upkeep', { sectorId: id, tier: sec.upkeep });
    float(id, FLOAT.upkeep(sec.upkeep), 'stage');
    sfx('buy');
    return ok({ tier: sec.upkeep, cost });
  },

  skipRadar(s) {
    if (!goalDone(s, 'G4')) return fail(REASON.locked);
    if (!radarRuns(s)) return fail(REASON.wrongPhase);
    s.timer = 0;
    return ok();
  },

  decideBuyer(s, arg) {
    if (s.dna <= 0) return fail(REASON.noDna);
    const i = s.notices.findIndex((n) => n.kind === 'buyer');
    const offer = i >= 0 ? s.notices[i].data.offer : s.flags.buyerOffer;
    if (i >= 0) s.notices.splice(i, 1);
    s.flags.buyerAt = null;
    s.dna -= 1;
    s.flags.buyerDecided = true;
    const sell = !!(arg && arg.sell);
    let scandal = false;
    if (sell) {
      credit(s, offer);
      s.flags.mutantNext = true;
      s.flags.dnaSold = true;
      emit('payment', { amount: offer });
      sfx('cash', true);
      if (rand() < BAL.scandalChance) {
        scandal = true;
        s.trust = clamp(s.trust + BAL.trustScandal, 0, 100);
        headline(s, NEWS.scandal, 'scandal');
      }
    } else {
      s.trust = clamp(s.trust + BAL.trustDonate, 0, 100);
      headline(s, NEWS.donated, 'donate');
      sfx('done');
    }
    return ok({ sell, scandal, amount: sell ? offer : 0 });
  },

  ackNotice(s) {
    const n = s.notices[0];
    if (!n) return fail(REASON.wrongPhase);
    if (n.kind === 'buyer') return fail(REASON.wrongPhase);
    s.notices.shift();
    if (n.kind === 'offline' && n.data.amount > 0) {
      credit(s, n.data.amount);
      emit('payment', { amount: n.data.amount });
      sfx('cash', true);
    }
    if (n.kind === 'v1') s.flags.v1Notice = true;
    return ok({ kind: n.kind });
  },

  markSeen(s, arg) {
    const tab = arg && arg.tab;
    if (!(tab in s.progress.seen)) return fail(REASON.wrongPhase);
    s.progress.seen[tab] = true;
    return ok();
  },

  tip(s, arg) {
    const key = arg && arg.key;
    const tips = s.progress.tips;
    if (key === 'tenderBubble') tips.tenderBubble = Math.min(3, tips.tenderBubble + 1);
    else if (key in tips) tips[key] = true;
    else if (key && key.startsWith('seen:')) s.progress.seen[key.slice(5)] = true;
    else return fail(REASON.wrongPhase);
    return ok();
  },
};

/**
 * act(s, id, arg) → { ok:true, ...extra } | { ok:false, code:'ftue'|'rule'|'confirm'|'unknown', reason }.
 * Order: FTUE gate, rule checks, effect. Emits 'action'.
 */
export function act(s, id, arg) {
  let res;
  try {
    const fn = H[id];
    if (!fn) res = fail('', 'unknown');
    else if (!ftueAllows(s, actionKey(id, arg))) res = fail('', 'ftue');
    else res = fn(s, arg || {});
    if (res.ok) post(s);
  } catch (err) {
    res = fail(REASON.wrongPhase, 'error');
    res.error = String(err && err.stack ? err.stack : err);
  }
  emit('action', { id, arg, ok: res.ok, code: res.ok ? null : res.code });
  return res;
}

export const ACTION_IDS = Object.keys(H);
export { CREW_TYPES };
