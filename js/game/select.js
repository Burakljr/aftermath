// Aftermath v2: UI selectors (ARCH §4.4). Pure and cheap; all text is final Turkish copy with units.
import { DISTRICTS, CREWS, CREW_TYPES, ITEMS, ITEM_KEYS, RAW, RECIPES, BUYERS, BAL, recipeById } from './data.js';
import {
  fmtMoney, fmtMoneyShort, fmtMoneyBare, fmtTime, fmtDur, fmtPct, fmtTon, fmtInt, fmtSigned,
} from './format.js';
import {
  CHIP_LABEL, OBJ, LABEL, LOOT, DISTRICT_STATE, RECEIPT, TENDER, CALM, NOTICE, COMPANY, FACTORY, NPC,
  RIVAL_COPY, callLines, SEG_NAME, STAGE_NAME,
} from './copy.js';
import {
  radarRuns, isFree, assigned, blockReason, owned, vehicleCost, rizaUnit, rizaAll, rizaTotal, upkeepCost,
  upkeepCap, lineCount, canStartJob, jobSectors, isClean,
} from './sim.js';
import { chance, cellTerms, isHatched, estimate } from './tender.js';
import { ftueView, ftueAllows } from './ftue.js';
import { goalById, goalDone } from './goals.js';
import { dispatchBlock, upkeepBlock, vehicleBlock, upgradeBlock, upgradeCost } from './actions.js';

const D = (id) => DISTRICTS[id];
const FTUE_CONTRACT_STEPS = { fire: 1, rubble: 1, carve: 1 };
const FTUE_BLOCKED = 'Sırası gelince açılır';

/* ---------------- HUD ---------------- */

export function hud(s) {
  let chip;
  const c = s.contract;
  if (s.phase === 'calm' && s.result) {
    chip = { kind: 'edildi', label: CHIP_LABEL.edildi, time: null, bar: 1, gold: null, warn: false };
  } else if (s.phase === 'calm') {
    const runs = radarRuns(s);
    chip = {
      kind: 'radar', label: CHIP_LABEL.radar, time: runs ? fmtTime(s.timer) : null,
      bar: runs && s.timerMax > 0 ? Math.min(1, Math.max(0, 1 - s.timer / s.timerMax)) : 0, gold: null, warn: false,
    };
  } else if (s.phase === 'attack') {
    chip = { kind: 'alarm', label: CHIP_LABEL.alarm, time: null, bar: 0, gold: null, warn: true };
  } else if (s.phase === 'tender') {
    const call = s.tender && s.tender.kind === 'call';
    chip = { kind: call ? 'cagri' : 'ihale', label: call ? CHIP_LABEL.cagri : CHIP_LABEL.ihale, time: null, bar: 0, gold: null, warn: false };
  } else if (s.phase === 'cleanup' && c) {
    const r = c.elapsed / c.deadline;
    if (r <= 1) {
      chip = { kind: 'teslim', label: CHIP_LABEL.teslim, time: fmtTime(c.deadline - c.elapsed), bar: r, gold: BAL.earlyRatio, warn: r >= 0.9 };
    } else {
      chip = { kind: 'gecikme', label: CHIP_LABEL.gecikme, time: `+${fmtTime(c.elapsed - c.deadline)}`, bar: 1, gold: BAL.earlyRatio, warn: true };
    }
  } else {
    chip = { kind: 'rival', label: CHIP_LABEL.rival, time: null, bar: s.rival.T ? Math.min(1, s.rival.t / s.rival.T) : 1, gold: null, warn: false };
  }
  const tip = s.phase === 'cleanup' && c && c.no >= 2 && !s.progress.tips.zones
    ? { key: 'zones', text: 'Altın bölgede bitirirsen %25 prim.' } : null;
  return { cash: s.money, cashText: fmtMoneyShort(s.money), chip, tip };
}

/* ---------------- Objective ---------------- */

/** The district's current blocking stage. */
export function stageOf(sec) {
  if (sec.fire > 0) return 'fire';
  if (sec.rubble > 0) return 'rubble';
  if (sec.corpse > 0) return 'carve';
  return sec.stages.fire || sec.stages.rubble || sec.stages.carve ? 'clean' : 'none';
}
const STAGE_RANK = { fire: 0, rubble: 1, carve: 2 };
const STAGE_TYPE = { fire: 'fire', rubble: 'debris', carve: 'carve' };

/** Highest-priority task among ids: fire > rubble > carcass, unattended first, then spread threat, then size. */
export function topTask(s, ids) {
  let best = null;
  let bestKey = null;
  for (const id of ids) {
    const sec = s.sectors[id];
    if (sec.rival) continue;
    const st = stageOf(sec);
    if (!(st in STAGE_RANK)) continue;
    const attended = assigned(s, id, STAGE_TYPE[st]) > 0 ? 1 : 0;
    const amount = st === 'fire' ? sec.fire : st === 'rubble' ? sec.rubble : sec.corpse;
    const key = [STAGE_RANK[st], attended, sec.warnTo != null ? 0 : 1, -amount];
    if (!bestKey || lexLess(key, bestKey)) {
      bestKey = key;
      best = { id, stage: st, attended: !!attended };
    }
  }
  return best;
}
function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

function pointerFor(s, ids, task) {
  const c = s.contract;
  if (!c || c.no < 2 || c.idleT < 8 || !task) return null;
  if (blockReason(s.sectors[task.id], STAGE_TYPE[task.stage])) return null;
  if (!s.fleet.some((v) => v.type === STAGE_TYPE[task.stage] && isFree(v))) return null;
  return { district: task.id, text: OBJ.pointer(task.id) };
}

export function objective(s) {
  const out = (text, source, progress = null, reward = null, pointer = null) => ({
    text, progress: progress ? { ...progress, text: LABEL.progress(progress.done, progress.total, progress.unit) } : null,
    reward, source, pointer,
  });
  if (s.phase === 'attack') return out('', 'attack');
  const fv = ftueView(s);
  const f = s.progress.ftue;
  if (fv && f !== 'cold' && (FTUE_CONTRACT_STEPS[f] || s.phase !== 'cleanup')) return out(fv.objective, 'ftue');
  if (s.phase === 'cleanup' && s.contract) {
    const ids = s.contract.sectors;
    const task = topTask(s, ids);
    let done = 0;
    for (const id of ids) if (isClean(s.sectors[id])) done++;
    const prog = ids.length > 1 ? { done, total: ids.length, unit: 'bölge' } : null;
    const text = task ? OBJ[task.stage](task.id) : OBJ.collect;
    return out(text, 'contract', prog, null, pointerFor(s, ids, task));
  }
  if (s.phase === 'rival') {
    const tail = s.rival.tail;
    return out(tail != null ? OBJ.tail(tail) : OBJ.tailWait, 'contract');
  }
  if (s.phase === 'tender' && s.tender) {
    const t = s.tender;
    if (t.kind === 'call') return out(OBJ.call, 'contract');
    if (t.reveal) return out(t.reveal.win ? TENDER.startWork : TENDER.takeTail, 'contract');
    return out(OBJ.tender, 'contract');
  }
  if (s.result) return out(OBJ.collect, 'contract');
  if (fv) return out(fv.objective, 'ftue');
  if (s.notices.some((n) => n.kind === 'buyer')) return out(OBJ.buyer, 'goal');
  const g = goalById(s.progress.goal);
  if (!g) return out(OBJ.calm, 'goal');
  const text = g.id === 'G4' && s.phase === 'calm' ? 'Sıradaki saldırıya hazırlan' : g.text;
  return out(text, 'goal', g.progress ? g.progress(s) : null, g.reward);
}

export function headline(s) {
  const n = s.news.current;
  return n && s.clock < n.until ? { text: n.text, kind: n.kind || '' } : null;
}

export function npcCard(s) {
  const n = s.npc;
  if (!n || s.clock >= n.until) return null;
  const p = NPC[n.who];
  return { who: n.who, name: p.name, role: p.role, initials: p.initials, text: n.text };
}

/* ---------------- District ---------------- */

const VALUE = { fire: (sec) => fmtPct(sec.fire0 > 0 ? Math.min(1, sec.fire / sec.fire0) : 1), rubble: (sec) => fmtTon(sec.rubble), carve: (sec) => fmtTon(sec.corpse) };

export function districtStatus(s, id) {
  const d = D(id);
  const sec = s.sectors[id];
  const stage = stageOf(sec);
  let bar = null;
  if (stage === 'fire') bar = { kind: 'fire', value: sec.fire0 > 0 ? Math.min(1, sec.fire / sec.fire0) : 1, text: VALUE.fire(sec) };
  else if (stage === 'rubble') bar = { kind: 'rubble', value: sec.rubbleMax > 0 ? sec.rubble / sec.rubbleMax : 1, text: VALUE.rubble(sec) };
  else if (stage === 'carve') bar = { kind: 'carve', value: sec.corpseMax > 0 ? sec.corpse / sec.corpseMax : 1, text: VALUE.carve(sec) };
  const amount = { fire: sec.fire, rubble: sec.rubble, carve: sec.corpse };
  const dots = ['fire', 'rubble', 'carve'].map((kind) => ({
    kind,
    state: !sec.stages[kind] ? 'absent' : amount[kind] <= 0 ? 'done' : kind === stage ? 'now' : 'pending',
  }));
  const values = {
    fire: sec.stages.fire ? VALUE.fire(sec) : null,
    rubble: sec.stages.rubble ? VALUE.rubble(sec) : null,
    carve: sec.stages.carve ? VALUE.carve(sec) : null,
  };
  let working = 0;
  let enroute = 0;
  const wk = { fire: 0, debris: 0, carve: 0 };
  for (const v of s.fleet) {
    if (v.sector !== id) continue;
    if (v.state === 'working') {
      working++;
      wk[v.type]++;
    } else if (v.state === 'enroute') enroute++;
  }
  const inJob = jobSectors(s).includes(id);
  const workPhase = s.phase === 'cleanup' || s.phase === 'rival';
  const stType = STAGE_TYPE[stage];
  const attention = workPhase && inJob && !!stType && !sec.rival && assigned(s, id, stType) === 0 && !blockReason(sec, stType);
  let threatened = null;
  for (const o of s.sectors) if (o.warnTo === id) threatened = { from: o.id, t: o.warnT };
  const fv = ftueView(s);
  const buttons = {};
  let primaryGiven = false;
  for (const type of CREW_TYPES) {
    const rule = workPhase ? dispatchBlock(s, type, id) : 'Şu an iş yok';
    const ftueOk = ftueAllows(s, `dispatch:${type}:${id}`);
    const enabled = !rule && ftueOk;
    let ready = 0;
    for (const v of s.fleet) if (v.type === type && isFree(v)) ready++;
    const isPrimary = enabled && !primaryGiven && STAGE_TYPE[stage] === type;
    if (isPrimary) primaryGiven = true;
    buttons[type] = {
      label: CREWS[type].send, enabled, reason: enabled ? null : rule || FTUE_BLOCKED,
      sub: enabled ? `${fmtInt(ready)} araç hazır` : rule || FTUE_BLOCKED,
      ready, total: owned(s, type), primary: isPrimary,
    };
  }
  const here = working + enroute;
  const parts = [];
  for (const type of CREW_TYPES) if (wk[type]) parts.push(`${wk[type]} ${CREWS[type].low} çalışıyor`);
  if (enroute) parts.push(`${enroute} yolda`);
  if (sec.paused) parts.push(DISTRICT_STATE.paused);
  let upkeep = null;
  if (s.progress.unlocked.upkeep && s.phase === 'calm') {
    const reason = upkeepBlock(s, id);
    const next = sec.upkeep + 1;
    const capped = sec.upkeep >= upkeepCap(s);
    upkeep = {
      tier: sec.upkeep, cap: upkeepCap(s),
      title: LABEL.upkeepTitle(id, sec.upkeep),
      // unsigned: show what signing earns (+72 bin ₺/dk), not 0 bin ₺
      rateText: sec.upkeep > 0 ? LABEL.upkeepRate(sec.upkeep * BAL.upkeepRate) : LABEL.upkeepRate(BAL.upkeepRate, true),
      nextCostText: capped ? null : LABEL.upkeepNext(next, upkeepCost(sec.upkeep)),
      nextCost: capped ? null : upkeepCost(sec.upkeep),
      button: sec.upkeep === 0 ? 'Bakımı üstlen' : 'Kademe yükselt',
      enabled: !reason, reason, paused: sec.damaged && sec.upkeep > 0,
      pausedText: sec.damaged && sec.upkeep > 0 ? DISTRICT_STATE.upkeepPaused : null,
    };
  }
  return {
    id, name: d.name, caps: d.caps, stage, bar, dots, values,
    workers: working, attention,
    spreading: sec.warnTo != null ? { to: sec.warnTo, t: sec.warnT, text: DISTRICT_STATE.spreading } : null,
    threatened: threatened ? { ...threatened, text: DISTRICT_STATE.spreading } : null,
    paused: sec.paused, seg: sec.seg, segName: sec.seg ? SEG_NAME[sec.seg] : null, rival: sec.rival,
    buttons,
    recall: workPhase && here > 0 ? { count: here, label: LABEL.recall(here) } : null,
    loot: sec.corpse > 0 && sec.seg ? LOOT[sec.seg] : null,
    status: sec.rival ? DISTRICT_STATE.rival : parts.length ? parts.join(', ') : null,
    upkeep,
    highlight: !!(fv && fv.highlight.type === 'district' && fv.highlight.ref === id),
  };
}

export function fleetStrip(s) {
  const ids = jobSectors(s);
  return CREW_TYPES.map((type) => {
    let ready = 0;
    for (const v of s.fleet) if (v.type === type && isFree(v)) ready++;
    const total = owned(s, type);
    const accepts = ids.filter((id) => !s.sectors[id].rival && !blockReason(s.sectors[id], type));
    return { type, name: CREWS[type].short, ready, total, text: LABEL.readyOf(ready, total), glow: ready > 0 && accepts.length > 0, accepts };
  });
}

export function vehicleTags(s) {
  const out = [];
  for (const v of s.fleet) if (v.state === 'enroute') out.push({ id: v.id, sector: v.sector, text: LABEL.enroute(v.eta) });
  return out;
}

export function contractLine(s) {
  const c = s.contract;
  return c ? { text: LABEL.contractLine(c.pay), pay: c.pay } : null;
}

/* ---------------- Tender ---------------- */

const tone = (p) => (p >= 0.7 ? 'green' : p >= 0.4 ? 'amber' : 'red');

export function fleetEstimate(s, damage) {
  if (!damage && s.tender && s.tender.estimate) return s.tender.estimate;
  return estimate(s, damage);
}

export function tenderGrid(s) {
  const t = s.tender;
  if (!t || t.kind !== 'bid' || s.phase !== 'tender') return null;
  const a = s.attack;
  const names = a.chain.map((id) => D(id).name);
  let fires = 0;
  let rubble = 0;
  let corpse = 0;
  for (const id of a.sectors) {
    const sec = s.sectors[id];
    if (sec.fire > 0) fires++;
    rubble += sec.rubble;
    corpse += sec.corpse;
  }
  const e = t.estimate;
  const rows = [0, 1, 2].map((si) => {
    const dl = cellTerms(t, 0, si).deadline;
    return {
      label: TENDER.rows[si], time: fmtTime(dl), deadline: dl,
      cells: [0, 1, 2].map((pi) => {
        const c = cellTerms(t, pi, si);
        const p = chance(s, c.bid, c.speed);
        return {
          price: pi, speed: si, pay: c.pay, priceText: fmtMoneyBare(c.pay), chance: p, chanceText: fmtPct(p), tone: tone(p),
          hatched: isHatched(t, si), recommended: !!(t.rec && t.rec.price === pi && t.rec.speed === si),
          selected: t.sel.price === pi && t.sel.speed === si,
        };
      }),
    };
  });
  const sel = cellTerms(t, t.sel.price, t.sel.speed);
  const ps = chance(s, sel.bid, sel.speed);
  const bi = s.progress.tips.tenderBubble;
  const bubbles = TENDER.bubbles;
  const bubble = t.rec && bi < 3
    ? { index: bi, text: typeof bubbles[bi] === 'function' ? bubbles[bi](fmtTime(e.mid)) : bubbles[bi], anchor: ['grid', 'estimate', 'rival'][bi] }
    : null;
  return {
    title: TENDER.title(names), cols: TENDER.cols.slice(), legend: TENDER.legend,
    summary: { fires, firesText: `${fires} yangın`, rubble: fmtTon(rubble), corpse: fmtTon(corpse) },
    estimate: { lo: e.lo, mid: e.mid, hi: e.hi, text: TENDER.estimate(fmtTime(e.mid), fmtTime(e.lo), fmtTime(e.hi)) },
    rows,
    rival: { name: TENDER.rival, trust: Math.round(s.rivalTrust), trustText: `Güven ${Math.round(s.rivalTrust)}`, habit: t.rivalBias.bold ? TENDER.habitBold : TENDER.habit },
    trust: Math.round(s.trust),
    outcome: {
      pay: sel.pay, payText: fmtMoneyShort(sel.pay), chance: ps, chanceText: fmtPct(ps), deadline: sel.deadline,
      line: TENDER.outcome(fmtMoneyShort(sel.pay)),
      summary: TENDER.summaryLine(fmtPct(ps), fmtTime(sel.deadline), fmtTime(e.mid)),
    },
    needsConfirm: ps < 0.4 && !s.progress.tips.redConfirm,
    confirmText: ps < 0.4 ? `Kazanma şansın ${fmtPct(ps)}. Yine de gönderilsin mi?` : null,
    button: TENDER.submit,
    bubble,
  };
}

export function callCard(s) {
  const t = s.tender;
  if (s.phase !== 'tender' || !t || t.kind !== 'call') return null;
  const p = NPC.nevin;
  return {
    who: 'nevin', name: p.name, role: p.role, initials: p.initials, lines: callLines(s, t), button: 'İşi al',
    pay: t.call.pay, payText: fmtMoney(t.call.pay), deadline: t.call.deadline, deadlineText: fmtDur(t.call.deadline),
  };
}

export function reveal(s) {
  const t = s.tender;
  if (s.phase !== 'tender' || !t || !t.reveal) return null;
  const r = t.reveal;
  const row = (label, you, rival, ys, rs) => ({ label, you, rival, youScore: ys, rivalScore: rs, better: ys >= rs ? 'you' : 'rival' });
  const rows = [
    row(TENDER.revealRows[0], fmtMoneyShort(r.you.bid), fmtMoneyShort(r.rival.bid), r.you.parts.price, r.rival.parts.price),
    row(TENDER.revealRows[1], fmtTime(r.you.deadline), fmtTime(r.rival.deadline), r.you.parts.speed, r.rival.parts.speed),
    row(TENDER.revealRows[2], `${Math.round(r.you.trust)} puan`, `${Math.round(r.rival.trust)} puan`, r.you.parts.trust, r.rival.parts.trust),
  ];
  // the factor with the largest margin in the winner's favour
  const keys = ['price', 'speed', 'trust'];
  let why = keys[0];
  let m = -Infinity;
  for (const k of keys) {
    const d = (r.win ? 1 : -1) * (r.you.parts[k] - r.rival.parts[k]);
    if (d > m) {
      m = d;
      why = k;
    }
  }
  return {
    win: r.win, chance: r.chance, chanceText: fmtPct(r.chance), rows,
    total: { label: TENDER.revealTotal, you: Math.round(r.you.score), rival: Math.round(r.rival.score), youText: `${Math.round(r.you.score)} puan`, rivalText: `${Math.round(r.rival.score)} puan` },
    names: { you: TENDER.you, rival: TENDER.rival },
    stamp: r.win ? TENDER.stampWin : TENDER.stampLose, stampKind: r.win ? 'win' : 'lose',
    why: r.win ? TENDER.winWhy[why] : TENDER.loseWhy[why],
    line: r.win ? null : TENDER.loseLine,
    button: r.win ? { label: TENDER.startWork, action: { id: 'startWork' } } : { label: TENDER.takeTail, action: { id: 'takeTail' } },
    secondary: r.win ? null : { label: TENDER.releaseTail, action: { id: 'releaseTail' } },
  };
}

export function rivalCard(s) {
  if (s.phase !== 'rival') return null;
  const tail = s.rival.tail;
  const sec = tail != null ? s.sectors[tail] : null;
  return {
    title: RIVAL_COPY.card, sub: RIVAL_COPY.sub, tail, tailName: tail != null ? D(tail).name : null,
    bar: sec && sec.corpseMax > 0 ? sec.corpse / sec.corpseMax : 0, text: sec ? fmtTon(sec.corpse) : null,
    rival: { name: RIVAL_COPY.name, bar: s.rival.T ? Math.min(1, s.rival.t / s.rival.T) : 1 },
    release: tail != null ? { label: TENDER.releaseTail, action: { id: 'releaseTail' } } : null,
  };
}

/* ---------------- Receipt ---------------- */

export function receipt(s) {
  const r = s.result;
  if (!r) return null;
  const rows = [
    { label: RECEIPT.time, value: `${fmtTime(r.elapsed)} / ${RECEIPT.promise} ${fmtTime(r.deadline)}` },
    { label: RECEIPT.pay, value: fmtMoney(r.pay + r.cut) },
  ];
  if (r.bonus) rows.push({ label: RECEIPT.bonus, value: fmtMoney(r.bonus) });
  if (r.cut) rows.push({ label: RECEIPT.cut, value: `-${fmtMoney(r.cut)}` });
  rows.push({ label: RECEIPT.trust, value: fmtSigned(r.trustD) });
  const parts = [];
  for (const k of ITEM_KEYS) if (r.parts[k]) parts.push({ item: k, name: ITEMS[k].name, n: r.parts[k], text: `${fmtInt(r.parts[k])} ${ITEMS[k].low}` });
  if (r.parts.dna) parts.push({ item: 'dna', name: 'Etiketsiz tüp', n: r.parts.dna, text: `${fmtInt(r.parts.dna)} tüp` });
  return {
    title: RECEIPT.title(r.districts), stamp: RECEIPT.stamp[r.grade], stampKind: r.grade, consequence: RECEIPT.consequence[r.grade],
    rows, parts, trustText: LABEL.trustD(r.trustD), total: fmtMoney(r.pay + r.bonus), totalValue: r.pay + r.bonus,
    button: RECEIPT.button,
  };
}

/* ---------------- Calm cards ---------------- */

function partsCount(s) {
  let n = 0;
  for (const k of ITEM_KEYS) n += s.inv[k];
  return n;
}

function usefulVehicle(s) {
  // the scarcest type relative to the fleet balance, if affordable
  const order = CREW_TYPES.slice().sort((a, b) => owned(s, a) - owned(s, b) || vehicleCost(s, a) - vehicleCost(s, b));
  for (const type of order) if (!vehicleBlock(s, type)) return type;
  return null;
}

export function suggestion(s) {
  if (s.phase !== 'calm' || s.result || s.progress.ftue !== 'done') return null;
  const u = s.progress.unlocked;
  if (u.factory && s.jobs.length < lineCount(s)) {
    for (const r of RECIPES) {
      if (s.progress.recipes[r.id] && canStartJob(s, r.id).ok) {
        const k = Object.keys(r.in)[0];
        return { kind: 'factory', title: CALM.factoryIdle, text: FACTORY.row(r.in[k], k, r.out, r.time), button: CALM.factoryBtn, action: { id: 'startJob', arg: { rid: r.id } } };
      }
    }
  }
  const n = partsCount(s);
  if (n > 0 && u.depot) {
    const off = s.offers.find((o) => s.inv[o.item] > 0);
    if (off) return { kind: 'offer', title: CALM.offer(off.buyer), text: `${fmtInt(off.qty)} ${ITEMS[off.item].low} · ${fmtMoney(off.unit)}`, button: CALM.offerBtn, action: { id: 'openTab', arg: { tab: 'depot' } } };
    const all = rizaAll(s);
    return {
      kind: 'sell', title: CALM.sellParts(n), text: LABEL.sellAll(all.total), button: CALM.sellBtn,
      action: u.offers ? { id: 'openTab', arg: { tab: 'depot' } } : { id: 'sellAll', arg: { buyer: 'riza' } },
    };
  }
  if (u.company) {
    const type = usefulVehicle(s);
    if (type) return { kind: 'buy', title: CALM.buy(type), text: fmtMoney(vehicleCost(s, type)), button: CALM.buyBtn, action: { id: 'buyVehicle', arg: { type } } };
  }
  if (u.upkeep) {
    for (const sec of s.sectors) {
      if (sec.upkeep === 0 && !upkeepBlock(s, sec.id)) {
        return { kind: 'upkeep', title: CALM.upkeep(sec.id), text: `${CALM.upkeepText} ${fmtMoney(upkeepCost(0))}`, button: CALM.upkeepBtn, action: { id: 'signUpkeep', arg: { sector: sec.id } } };
      }
    }
  }
  return null;
}

export function nextCard(s) {
  if (s.phase !== 'calm') return null;
  const runs = radarRuns(s);
  const canSkip = runs && goalDone(s, 'G4');
  return {
    title: CALM.next, etaText: runs ? CALM.eta(fmtTime(s.timer)) : null, monster: 'Magmadon', mutant: !!s.flags.mutantNext,
    line: s.flags.mutantNext ? CALM.lineMutant : CALM.line, loot: ['scale', 'blood', 'bone', 'eye'],
    skip: canSkip ? { label: CALM.skip, action: { id: 'skipRadar' } } : null,
  };
}

/* ---------------- Depot / factory / company ---------------- */

function trend(s, k) {
  const h = s.market[k].hist;
  const d = s.market[k].m - h[Math.max(0, h.length - 2)];
  return d > 0.02 ? 'up' : d < -0.02 ? 'down' : 'flat';
}

export function depot(s) {
  const items = [];
  for (const k of ITEM_KEYS) {
    const it = ITEMS[k];
    const show = it.raw || k === 'eye' || s.inv[k] > 0 || (it.product && RECIPES.some((r) => r.out === k && s.progress.recipes[r.id]));
    if (!show) continue;
    const unit = rizaUnit(s, k);
    items.push({ key: k, name: it.name, count: s.inv[k], countText: `${fmtInt(s.inv[k])} adet`, unit, unitText: fmtMoney(unit), rare: !!it.rare, trend: trend(s, k) });
  }
  const all = rizaAll(s);
  const offers = s.offers.map((o) => {
    const ru = rizaUnit(s, o.item);
    const pct = ru > 0 ? Math.max(0, o.unit / ru - 1) : 0;
    const have = s.inv[o.item];
    return {
      id: o.id, buyer: o.buyer, item: o.item, itemName: ITEMS[o.item].name, qty: o.qty, qtyText: `${fmtInt(o.qty)} ${ITEMS[o.item].low}`,
      unit: o.unit, unitText: fmtMoney(o.unit), deltaText: LABEL.delta(fmtPct(pct)), untilT: Math.max(0, o.until - s.clock),
      untilText: fmtTime(Math.max(0, o.until - s.clock)), life: o.life || BAL.offerMax, have, canSell: have > 0,
      reason: have > 0 ? null : 'Depoda yok', boom: !!o.boom,
    };
  });
  return {
    items,
    riza: {
      name: BUYERS.riza.name, line: BUYERS.riza.line, sub: BUYERS.riza.sub, note: BUYERS.riza.note,
      allText: LABEL.sellAll(all.total), allValue: all.total, enabled: all.qty > 0, reason: all.qty > 0 ? null : 'Satacak parça yok',
      primary: s.progress.ftue === 'sell',
    },
    offers, offersOn: !!s.progress.unlocked.offers, dna: s.dna, dnaText: s.dna ? `${fmtInt(s.dna)} etiketsiz tüp` : null,
    countText: LABEL.depotCount(partsCount(s)),
  };
}

export function factory(s) {
  const lines = lineCount(s);
  const jobs = s.jobs.map((j) => ({
    id: j.id, rid: j.rid, line: j.line, name: ITEMS[recipeById(j.rid).out].name,
    progress: Math.min(1, Math.max(0, (s.clock - j.start) / (j.end - j.start))), leftText: FACTORY.left(j.end - s.clock),
  }));
  const recipes = [];
  let locked = 0;
  for (const r of RECIPES) {
    if (!s.progress.recipes[r.id]) {
      locked++;
      continue;
    }
    const k = Object.keys(r.in)[0];
    const n = r.in[k];
    const c = canStartJob(s, r.id);
    // honest figures (playtest M3): what Rıza pays for the raw parts now vs the best price on offer for the product now
    const rawV = rizaTotal(s, k, n);
    let outV = rizaUnit(s, r.out);
    for (const o of s.offers) if (o.item === r.out && o.unit > outV) outV = o.unit;
    recipes.push({
      id: r.id, name: ITEMS[r.out].name, inText: FACTORY.row(n, k, r.out, r.time), timeText: `${r.time} sn`,
      rawText: FACTORY.raw(rawV, outV), outText: fmtMoney(outV), have: s.inv[k], need: n,
      canStart: c.ok, reason: c.ok ? null : c.code === 'material' ? `Malzeme yetmiyor: ${fmtInt(c.n)} ${ITEMS[c.item].low} eksik.` : c.code === 'linesFull' ? 'Tüm hatlar dolu' : 'Henüz açılmadı',
      auto: !!s.autoJobs[r.id], autoAvailable: !!s.progress.unlocked.autoRepeat, autoLabel: FACTORY.auto,
    });
  }
  return { lines, linesText: `${fmtInt(s.jobs.length)}/${fmtInt(lines)} hat`, jobs, recipes, locked };
}

export function company(s) {
  const fv = s.progress.ftue === 'buy';
  const fleet = CREW_TYPES.map((type) => {
    const reason = vehicleBlock(s, type);
    return {
      type, name: CREWS[type].name, owned: owned(s, type), ownedText: COMPANY.owned(owned(s, type)),
      price: vehicleCost(s, type), priceText: fmtMoney(vehicleCost(s, type)), canBuy: !reason && ftueAllows(s, `buyVehicle:${type}`),
      reason: reason || (ftueAllows(s, `buyVehicle:${type}`) ? null : FTUE_BLOCKED), desc: CREWS[type].desc,
      primary: fv && type === 'fire' && !reason,
    };
  });
  const u = s.progress.unlocked;
  const up = (key, meta, visible, level) => {
    const reason = upgradeBlock(s, key);
    return {
      key, name: meta.name, desc: meta.desc, visible, level, levelText: key === 'foreman' ? null : COMPANY.level(level),
      price: upgradeCost(s, key), priceText: fmtMoney(upgradeCost(s, key)), canBuy: !reason, reason,
    };
  };
  const upgrades = [
    up('speed', COMPANY.equipment, !!u.equipment, s.upgrades.speed),
    up('lines', COMPANY.lines, !!u.line2, 1 + s.upgrades.lines),
    up('foreman', COMPANY.foreman, !!u.foreman, s.upgrades.foreman ? 1 : 0),
  ].filter((x) => x.visible);
  const st = s.stats;
  const L = COMPANY.stats;
  const stats = [
    { label: L.trust, value: `${Math.round(s.trust)} puan` },
    { label: L.contracts, value: `${fmtInt(st.contracts)} iş` },
    { label: L.early, value: `${fmtInt(st.early)} iş` },
    { label: L.lost, value: `${fmtInt(st.lost)} ihale` },
    { label: L.attacks, value: `${fmtInt(st.attacks)} saldırı` },
    { label: L.parts, value: `${fmtInt(st.parts)} parça` },
    { label: L.sold, value: `${fmtInt(st.sold)} parça` },
    { label: L.earned, value: fmtMoney(st.earned) },
    { label: L.fastest, value: st.fastest ? fmtDur(st.fastest) : '0 sn' },
  ];
  return { fleet, upgrades, stats, trust: Math.round(s.trust), trustText: `Güven ${Math.round(s.trust)}` };
}

/* ---------------- Tabs, notices, news ---------------- */

export function tabs(s) {
  const u = s.progress.unlocked;
  const seen = s.progress.seen;
  const out = [
    { id: 'city', visible: true, isNew: false, dot: false },
    { id: 'depot', visible: !!u.depot, isNew: !!u.depot && !seen.depot, dot: false },
    { id: 'factory', visible: !!u.factory, isNew: !!u.factory && !seen.factory, dot: false },
    { id: 'company', visible: !!u.company, isNew: !!u.company && !seen.company, dot: false },
  ];
  if (s.progress.ftue !== 'done') return out;
  // at most one dot: better offer for stock > idle line > affordable vehicle
  if (u.depot && s.offers.some((o) => s.inv[o.item] > 0)) out[1].dot = true;
  else if (u.factory && s.jobs.length < lineCount(s) && RECIPES.some((r) => s.progress.recipes[r.id] && canStartJob(s, r.id).ok)) out[2].dot = true;
  else if (u.company && s.phase === 'calm' && CREW_TYPES.some((t) => !vehicleBlock(s, t))) out[3].dot = true;
  return out;
}

export function notice(s) {
  const n = s.notices[0];
  if (!n) return null;
  if (n.kind === 'v1') return { kind: 'v1', title: NOTICE.v1.title, body: NOTICE.v1.body.slice(), note: null, buttons: [{ label: NOTICE.v1.button, action: { id: 'ackNotice' }, primary: true }] };
  if (n.kind === 'offline') {
    const c = NOTICE.offline(n.data.amount, n.data.seconds);
    return { kind: 'offline', title: c.title, body: c.body, note: null, buttons: [{ label: c.button, action: { id: 'ackNotice' }, primary: true }] };
  }
  if (n.kind === 'buyer') {
    const c = NOTICE.buyer(n.data.offer);
    return {
      kind: 'buyer', title: c.title, body: c.body, note: c.note,
      buttons: [
        { label: c.donate, action: { id: 'decideBuyer', arg: { sell: false } }, primary: false },
        { label: c.sell, action: { id: 'decideBuyer', arg: { sell: true } }, primary: true },
      ],
    };
  }
  if (n.kind === 'chapter') {
    const c = NOTICE.chapter;
    const body = c.body.concat([
      `${fmtInt(s.stats.contracts)} iş teslim edildi.`,
      `Toplam kazanç ${fmtMoney(s.stats.earned)}.`,
    ]);
    return { kind: 'chapter', title: c.title, body, note: null, buttons: [{ label: c.button, action: { id: 'ackNotice' }, primary: true }] };
  }
  return { kind: n.kind, title: '', body: [], note: null, buttons: [{ label: 'Tamam', action: { id: 'ackNotice' }, primary: true }] };
}

export function newsArchive(s) {
  return s.news.archive.slice();
}

export { STAGE_NAME };
