// Aftermath v2: the whole game API (ARCH §4). import * as game from './game/index.js'
export * from './data.js';
export { rand, setSeed, setRandom } from './rng.js';
export * from './format.js';
export * as copy from './copy.js';
export { newState, load, save, wipe, normalize, hasV1Save, SAVE_KEY, V1_KEY } from './state.js';
export {
  tick, applyOffline, travel, vehicleCost, owned, speedMult, rizaUnit, rizaAll, upkeepRate, upkeepCost, upkeepCap,
  calmLength, radarRuns, greedyDispatch, jobSectors, blockReason, isClean, lineCount, pushNotice,
} from './sim.js';
export { act, actionKey, ACTION_IDS, upgradeCost, dispatchBlock, upkeepBlock, vehicleBlock, upgradeBlock } from './actions.js';
export { scoreFor, chance, resolve, estimate, cellTerms, rivalTendency, contractValue } from './tender.js';
export { FTUE_STEPS, FTUE_ORDER, ftueView, ftueAllows, debugFtue, driveFtue } from './ftue.js';
export { GOALS, checkGoals, goalById, goalDone } from './goals.js';
export * as select from './select.js';
export {
  hud, objective, headline, npcCard, districtStatus, fleetStrip, vehicleTags, contractLine, tenderGrid, fleetEstimate,
  callCard, reveal, rivalCard, receipt, suggestion, nextCard, depot, factory, company, tabs, notice, newsArchive, topTask,
  stageOf,
} from './select.js';
export { debugScenario, debugUnlockAll, SCENARIOS } from './debug.js';
export { TITLE } from './copy.js';
