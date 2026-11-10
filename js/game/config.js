// Static game data: locations, stations, dishes, goals and economy rules.
// Pure data, no DOM. Tuned with tests/logic/bot.mjs (see docs/ARCH.md).

export const RULES = {
  costGrowth: 1.15,              // station upgrade cost multiplier per level
  priceStep: 0.35,               // price per dish = basePrice * (1 + priceStep * (level-1))
  priceGrowth: 1.02,             //                  * priceGrowth^(level-1)
  milestones: [10, 25, 50, 100], // each one doubles the station's cooking speed
  maxLevel: 150,
  boostMult: 2,                  // cooking speed multiplier while a tap boost runs
  boostPerTap: 1.5,              // seconds of boost added per tap on a station
  boostMax: 5,                   // boost time cap in seconds
  eatTime: 2.6,                  // seconds a customer eats
  payTime: 1.1,                  // seconds of paying + cheering
  serveTime: 0.45,               // seconds a cook needs to put the dish down
  arriveBase: 2.4,               // next customer after arriveBase / free seats seconds ...
  arriveMin: 0.7,                // ... but never faster than this
  firstArrive: 0.4,              // first customer of a fresh location
  newestWeight: 3,               // order weight of the newest open station (others 1)
  cookSpeedStep: 0.15,           // +15 % walking speed per Cook speed level
  cookSpeedMax: 10,              // Cook speed levels
  offlineCap: 2 * 60 * 60,       // seconds of offline earnings at most (v0: 2 h)
  offlineMin: 60,                // shorter absences give nothing
  offlineRate: 1,                // share of the average income earned while away
  maxStep: 0.05,                 // tick() sub-step size in seconds
};

// Customers: KayKit adventurers (file names) and tint variants the scene can recolour.
export const CUSTOMER_CHARS = ['Knight', 'Mage', 'Rogue_Hooded'];
export const CUSTOMER_TINTS = 4;

// Dishes (the scene maps them to KayKit food models, the UI to its SVG icons).
export const DISHES = {
  juice: { nameKey: 'dish.juice' },
  burger: { nameKey: 'dish.burger' },
  stew: { nameKey: 'dish.stew' },
  dinner: { nameKey: 'dish.dinner' },
  cocoa: { nameKey: 'dish.cocoa' },
  veggieburger: { nameKey: 'dish.veggieburger' },
  soup: { nameKey: 'dish.soup' },
};

// Goal types (see goals.js): open, level, served, tables, cooks, cookSpeed.
// reward: coins paid when the goal is collected.
// kind (stations): which machine the scene builds: 'drinks' | 'grill' | 'pot' | 'oven'.

const INN = {
  id: 'inn',
  nameKey: 'loc.inn',
  startMoney: 25,               // the first upgrades are affordable straight away
  completeReward: 0,            // the next location starts with its own money
  palette: { floor: 0xe9c79b, wall: 0xf3e3c3, trim: 0x9a6a43, accent: 0xd9643a },
  stations: [
    { id: 'juice', kind: 'drinks', dish: 'juice', nameKey: 'station.juice', cookTime: 2.0, basePrice: 7, baseCost: 8, openCost: 0 },
    { id: 'grill', kind: 'grill', dish: 'burger', nameKey: 'station.grill', cookTime: 3.0, basePrice: 30, baseCost: 60, openCost: 100 },
    { id: 'stew', kind: 'pot', dish: 'stew', nameKey: 'station.stew', cookTime: 4.0, basePrice: 300, baseCost: 700, openCost: 1400 },
    { id: 'oven', kind: 'oven', dish: 'dinner', nameKey: 'station.oven', cookTime: 5.0, basePrice: 3000, baseCost: 10000, openCost: 16000 },
  ],
  tables: { start: 2, costs: [0, 0, 80, 300, 1500, 6000] },   // cost of table n (index n-1)
  cooks: { start: 1, max: 4, costs: [0, 30, 500, 6000] },     // cost of cook n (index n-1)
  cookSpeed: { baseCost: 200, growth: 2.4 },                   // cost of the next level
  goals: [
    { id: 'i1', type: 'level', station: 'juice', target: 5, reward: 15 },
    { id: 'i2', type: 'served', target: 5, reward: 20 },
    { id: 'i3', type: 'cooks', target: 2, reward: 30 },
    { id: 'i4', type: 'open', station: 'grill', reward: 60 },
    { id: 'i5', type: 'tables', target: 3, reward: 80 },
    { id: 'i6', type: 'level', station: 'juice', target: 10, reward: 100 },
    { id: 'i7', type: 'level', station: 'grill', target: 10, reward: 150 },
    { id: 'i8', type: 'served', target: 50, reward: 300 },
    { id: 'i9', type: 'open', station: 'stew', reward: 600 },
    { id: 'i10', type: 'cooks', target: 3, reward: 1000 },
    { id: 'i11', type: 'level', station: 'stew', target: 10, reward: 2000 },
    { id: 'i12', type: 'tables', target: 4, reward: 2500 },
    { id: 'i13', type: 'cookSpeed', target: 3, reward: 3000 },
    { id: 'i14', type: 'served', target: 150, reward: 4000 },
    { id: 'i15', type: 'open', station: 'oven', reward: 6000 },
    { id: 'i16', type: 'level', station: 'oven', target: 10, reward: 10000 },
    { id: 'i17', type: 'cooks', target: 4, reward: 15000 },
    { id: 'i18', type: 'level', station: 'oven', target: 25, reward: 30000 },
  ],
};

// Location 2: the same structure with every value x10 and its own dishes / decor.
function scaled(base, over) {
  const k = 10;
  return Object.assign({}, base, over, {
    startMoney: base.startMoney * k,
    stations: base.stations.map((s, i) => Object.assign({}, s, over.stations[i], {
      basePrice: s.basePrice * k, baseCost: s.baseCost * k, openCost: s.openCost * k,
    })),
    tables: { start: base.tables.start, costs: base.tables.costs.map((c) => c * k) },
    cooks: { start: base.cooks.start, max: base.cooks.max, costs: base.cooks.costs.map((c) => c * k) },
    cookSpeed: { baseCost: base.cookSpeed.baseCost * k, growth: base.cookSpeed.growth },
    goals: base.goals.map((g, i) => Object.assign({}, g, over.goals[i], { reward: g.reward * k })),
  });
}

const STATION_MAP = { juice: 'cocoa', grill: 'veggie', stew: 'soup', oven: 'roast' };
const INN_GOALS_MAP = INN.goals.map((g) => {
  const o = { id: 'h' + g.id.slice(1) };
  if (g.station) o.station = STATION_MAP[g.station];
  return o;
});

const HARBOR = scaled(INN, {
  id: 'harbor',
  nameKey: 'loc.harbor',
  palette: { floor: 0xb9d3dc, wall: 0xe8f1f2, trim: 0x3f6f8a, accent: 0x2f8fb0 },
  stations: [
    { id: 'cocoa', dish: 'cocoa', nameKey: 'station.cocoa' },
    { id: 'veggie', dish: 'veggieburger', nameKey: 'station.veggie' },
    { id: 'soup', dish: 'soup', nameKey: 'station.soup' },
    { id: 'roast', dish: 'dinner', nameKey: 'station.roast' },
  ],
  // same goals with this location's stations (ids h1..h18)
  goals: INN_GOALS_MAP,
});

export const LOCATIONS = [INN, HARBOR];
// Shown as "coming soon" in the Locations panel (names only, not playable in v0).
export const COMING_SOON = ['loc.forest', 'loc.castle'];

export function locationByIndex(i) {
  return LOCATIONS[Math.max(0, Math.min(LOCATIONS.length - 1, i | 0))];
}
