// ui-lab fixtures: real game states (game.debugScenario / debugFtue) plus UI-only flags, one per screen.
import * as game from '../../game/index.js';
import { silently } from '../../game/sim.js';

const quiet = (fn) => silently(fn);

function ftue(step) {
  const s = game.newState();
  quiet(() => game.debugFtue(s, step));
  return s;
}

function firstAttack(t) {
  const s = game.newState();
  quiet(() => {
    for (let i = 0; i < 40 && s.phase !== 'attack'; i++) game.tick(s, 0.1);
    s.attack.t = t;
  });
  return s;
}

function withNotice(base, kind, data) {
  const s = game.debugScenario(base);
  quiet(() => game.pushNotice(s, kind, data));
  return s;
}

/** name -> { state(), ui:{ tab, sel, settings, news, accept, title }, note } */
export const FIXTURES = {
  calm: { state: () => game.debugScenario('calm'), note: 'Hazırlık: radar kartı + öneri' },
  late: { state: () => game.debugScenario('late'), note: 'Geç oyun: tüm sekmeler, bakım kademeleri' },
  'notice-v1': { state: () => { const s = game.newState(); quiet(() => { for (let i = 0; i < 80 && s.phase !== 'tender'; i++) game.tick(s, 0.1); game.pushNotice(s, 'v1', {}); }); return s; } },
  'attack-first': { state: () => firstAttack(0.4), note: 'İlk saldırı: canlı yayın' },
  attack: { state: () => game.debugScenario('attack') },
  impact: { state: () => game.debugScenario('impact') },
  title: { state: () => ftue('call'), ui: { title: true } },
  'ftue-call': { state: () => ftue('call') },
  call: { state: () => game.debugScenario('call') },
  'ftue-fire': { state: () => game.debugScenario('ftue-fire') },
  'ftue-fire-sheet': { state: () => game.debugScenario('ftue-fire'), ui: { sel: 1 } },
  'ftue-carve': { state: () => ftue('carve'), ui: { sel: 1 } },
  cleanup: { state: () => game.debugScenario('cleanup') },
  'cleanup-sheet': { state: () => game.debugScenario('cleanup'), ui: { sel: 2 } },
  'fleet-accept': { state: () => game.debugScenario('cleanup'), ui: { accept: 'debris' } },
  enroute: { state: () => { const s = game.debugScenario('call'); quiet(() => { game.act(s, 'acceptCall'); game.act(s, 'dispatch', { type: 'fire', sector: 2 }); game.act(s, 'dispatch', { type: 'debris', sector: 5 }); game.tick(s, 0.1); game.tick(s, 0.1); game.tick(s, 0.1); }); return s; }, note: 'Yolda etiketleri' },
  spread: { state: () => game.debugScenario('spread') },
  tender: { state: () => game.debugScenario('tender') },
  'tender-confirm': { state: () => game.debugScenario('tender'), ui: { confirm: true } },
  'tender-reveal': { state: () => game.debugScenario('tender-reveal') },
  receipt: { state: () => game.debugScenario('result') },
  'receipt-ftue': { state: () => ftue('deliver') },
  rival: { state: () => game.debugScenario('rival') },
  'ftue-sell': { state: () => ftue('sell') },
  'ftue-sell-depot': { state: () => ftue('sell'), ui: { tab: 'depot' } },
  'ftue-buy': { state: () => ftue('buy'), ui: { tab: 'company' } },
  depot: { state: () => game.debugScenario('depot'), ui: { tab: 'depot' } },
  'depot-offers': { state: () => game.debugScenario('depot-offers'), ui: { tab: 'depot' } },
  factory: { state: () => game.debugScenario('factory'), ui: { tab: 'factory' } },
  company: { state: () => game.debugScenario('company'), ui: { tab: 'company' } },
  upkeep: { state: () => game.debugScenario('late'), ui: { sel: 1 } },
  settings: { state: () => game.debugScenario('calm'), ui: { settings: true } },
  news: { state: () => game.debugScenario('late'), ui: { settings: true, news: true } },
  'settings-reset': { state: () => game.debugScenario('calm'), ui: { settings: true, reset: true } },
  'notice-offline': { state: () => { const s = game.debugScenario('late'); quiet(() => game.applyOffline(s, 3 * 3600 + 420)); return s; } },
  'notice-buyer': { state: () => withNotice('late', 'buyer', { offer: 4200 }) },
  'notice-chapter': { state: () => withNotice('late', 'chapter', {}) },
};

export const SCREENS = Object.keys(FIXTURES);
