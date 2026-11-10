// Static game data: factories, stations, goals and economy rules.
// Pure data, no DOM. Tuned with tests/logic/bot.mjs (see docs/ARCH.md).

export const RULES = {
  costGrowth: 1.15,            // upgrade cost multiplier per level
  trayMax: 3,                  // items that can wait in a station's input tray
  milestones: [10, 25, 50, 100], // each one doubles the station's speed
  speedPerLevel: 0,            // extra speed per level (0: only milestones change speed)
  valueGrowth: 1.04,           // value per toy = baseValue * level * valueGrowth^(level-1)
  boostMult: 2,                // speed multiplier while a tap boost runs
  boostPerTap: 1.5,            // seconds of boost added per tap
  boostMax: 5,                 // boost time cap in seconds
  offlineCap: 2 * 60 * 60,     // seconds of offline earnings at most (v0: 2 h)
  offlineMin: 60,              // shorter absences give nothing
  offlineRate: 1,              // share of the live income earned while away
  maxStep: 0.05,               // tick() sub-step size in seconds
};

// Goal types (see goals.js): open, level, sold, income, allLevel.
// reward: coins paid when the goal is collected.

export const FACTORIES = [
  {
    id: 'wood',
    nameKey: 'factory.wood',
    toyKey: 'toy.wood',
    startMoney: 30,             // enough for the first upgrades straight away
    completeReward: 500,        // starting bonus for the next factory
    palette: {
      floor: 0xffe6b8, wall: 0x8fd6ff, trim: 0xffffff, belt: 0x4b587c,
      accent: 0xff6b6b, accent2: 0xffc23c, accent3: 0x4fd18b, accent4: 0x6c8cff,
      wood: 0xe0a463, toy: [0xff5a5f, 0x3fa9f5, 0xffcc29, 0x4fd18b],
      ribbon: 0xff4f9a, box: 0x6c8cff,
    },
    stations: [
      { id: 'saw',      nameKey: 'station.saw',      baseTime: 1.0, baseValue: 1,    openCost: 0,     baseCost: 20 },
      { id: 'assembly', nameKey: 'station.assembly', baseTime: 1.5, baseValue: 3,    openCost: 0,     baseCost: 60 },
      { id: 'paint',    nameKey: 'station.paint',    baseTime: 1.2, baseValue: 30,   openCost: 700,   baseCost: 600 },
      { id: 'wrap',     nameKey: 'station.wrap',     baseTime: 0.9, baseValue: 3000, openCost: 60000, baseCost: 350000 },
    ],
    goals: [
      { id: 'w1', type: 'level', station: 'saw', target: 5, reward: 20 },
      { id: 'w2', type: 'sold', target: 25, reward: 25 },
      { id: 'w3', type: 'open', station: 'paint', reward: 60 },
      { id: 'w4', type: 'level', station: 'assembly', target: 10, reward: 100 },
      { id: 'w5', type: 'income', target: 20, reward: 150 },
      { id: 'w6', type: 'level', station: 'paint', target: 5, reward: 300 },
      { id: 'w7', type: 'level', station: 'paint', target: 10, reward: 600 },
      { id: 'w8', type: 'open', station: 'wrap', reward: 350000 },
      { id: 'w9', type: 'sold', target: 500, reward: 100000 },
      { id: 'w10', type: 'level', station: 'wrap', target: 5, reward: 600000 },
      { id: 'w11', type: 'income', target: 50000, reward: 1000000 },
      { id: 'w12', type: 'level', station: 'wrap', target: 10, reward: 3000000 },
      { id: 'w13', type: 'level', station: 'paint', target: 50, reward: 3000000 },
      { id: 'w14', type: 'income', target: 300000, reward: 5000000 },
      { id: 'w15', type: 'allLevel', target: 25, reward: 10000000 },
    ],
  },
  {
    id: 'teddy',
    nameKey: 'factory.teddy',
    toyKey: 'toy.teddy',
    startMoney: 300,
    completeReward: 5000,
    palette: {
      floor: 0xffd9e8, wall: 0xb7a6ff, trim: 0xffffff, belt: 0x5a4b7c,
      accent: 0xff7eb6, accent2: 0xffd166, accent3: 0x66d9c2, accent4: 0x8f7bff,
      fabric: 0xc8945f, toy: [0xc8945f, 0xf2c38f, 0xffffff, 0x8a5a3b],
      ribbon: 0xff4f6d, box: 0x66d9c2,
    },
    stations: [
      { id: 'cutter', nameKey: 'station.cutter', baseTime: 1.0, baseValue: 10, openCost: 0, baseCost: 200 },
      { id: 'stuffing', nameKey: 'station.stuffing', baseTime: 1.5, baseValue: 30, openCost: 0, baseCost: 600 },
      { id: 'stitching', nameKey: 'station.stitching', baseTime: 1.2, baseValue: 300, openCost: 7000, baseCost: 6000 },
      { id: 'ribbon', nameKey: 'station.ribbon', baseTime: 0.9, baseValue: 30000, openCost: 600000, baseCost: 3500000 },
    ],
    goals: [
      { id: 't1', type: 'level', station: 'cutter', target: 5, reward: 200 },
      { id: 't2', type: 'sold', target: 25, reward: 250 },
      { id: 't3', type: 'open', station: 'stitching', reward: 600 },
      { id: 't4', type: 'level', station: 'stuffing', target: 10, reward: 1000 },
      { id: 't5', type: 'income', target: 200, reward: 1500 },
      { id: 't6', type: 'level', station: 'stitching', target: 5, reward: 3000 },
      { id: 't7', type: 'level', station: 'stitching', target: 10, reward: 6000 },
      { id: 't8', type: 'open', station: 'ribbon', reward: 3500000 },
      { id: 't9', type: 'sold', target: 500, reward: 1000000 },
      { id: 't10', type: 'level', station: 'ribbon', target: 5, reward: 6000000 },
      { id: 't11', type: 'income', target: 500000, reward: 10000000 },
      { id: 't12', type: 'level', station: 'ribbon', target: 10, reward: 30000000 },
      { id: 't13', type: 'level', station: 'stitching', target: 50, reward: 30000000 },
      { id: 't14', type: 'income', target: 3000000, reward: 50000000 },
      { id: 't15', type: 'allLevel', target: 25, reward: 100000000 },
    ],
  },
];

export function factoryByIndex(i) {
  return FACTORIES[Math.max(0, Math.min(FACTORIES.length - 1, i | 0))];
}
