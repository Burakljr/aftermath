// Headless pacing simulation (ARCH §11 L6): node tools/balance.mjs [seeds=3] [minutes=40]
// Prints a contract table and the goal timeline for a greedy player and a human-paced player.
import { playBot } from '../tests/logic/bot.mjs';
import { fmtTime, fmtMoney } from '../js/game/format.js';

const seeds = Number(process.argv[2] || 3);
const minutes = Number(process.argv[3] || 40);
const fleet = (s) => ['fire', 'debris', 'carve'].map((t) => s.fleet.filter((v) => v.type === t).length).join('/');

for (const human of [false, true]) {
  for (let seed = 1; seed <= seeds; seed++) {
    const contractsAt = [];
    const r = playBot({
      seed, human, maxT: minutes * 60,
      until: (s) => {
        if (s.result && contractsAt[contractsAt.length - 1] !== s.result.no) {
          contractsAt.push(s.result.no);
          s.__snap = s.__snap || [];
          s.__snap.push({ no: s.result.no, money: s.money, fleet: fleet(s), trust: s.trust, goal: s.progress.goal });
        }
        return s.progress.goal === 'end' && s.progress.contractNo >= 8 && s.phase === 'calm';
      },
    });
    const snaps = r.s.__snap || [];
    console.log(`\n=== ${human ? 'human-paced' : 'greedy'} player, seed ${seed}: ${fmtTime(r.s.clock)} played, money ${fmtMoney(r.s.money)}, fleet ${fleet(r.s)}, trust ${Math.round(r.s.trust)}, tenders lost ${r.s.stats.lost}`);
    console.log(' no | kind | grade  | time / promise | done at | money after  | fleet F/D/C | trust | goal');
    for (const c of r.contracts) {
      const sn = snaps.find((x) => x.no === c.no) || {};
      const o = r.offered.find((x) => x.no === c.no);
      console.log(` ${String(c.no).padStart(2)} | ${(o ? o.kind : 'call').padEnd(4)} | ${c.grade.padEnd(6)} | ${fmtTime(c.elapsed).padStart(5)} / ${fmtTime(c.deadline).padEnd(5)}  | ${fmtTime(c.t).padStart(7)} | ${fmtMoney(sn.money || 0).padEnd(12)} | ${String(sn.fleet || '').padEnd(11)} | ${String(Math.round(sn.trust || 0)).padStart(5)} | ${sn.goal || ''}`);
    }
    let prev = 0;
    console.log(' goals: ' + r.goals.map((g) => { const d = Math.round(g.t - prev); prev = g.t; return `${g.id} ${fmtTime(g.t)} (+${d} s)`; }).join(', '));
  }
}
