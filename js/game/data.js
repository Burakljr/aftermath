// Aftermath v2: static game data and balance constants (ARCH §2, §3.3; DESIGN §4, §6.3, §9.3).

/* ---------------- Districts (2 columns × 3 rows, ids = v1 ids) ---------------- */

export const DISTRICTS = [
  { id: 0, key: 'kordon', name: 'Kordon', caps: 'KORDON', col: 0, row: 0,
    loc: "Kordon'da", locAdj: "Kordon'daki", dat: "Kordon'a", abl: "Kordon'dan", acc: "Kordon'u", gen: "Kordon'un" },
  { id: 1, key: 'konak', name: 'Konak', caps: 'KONAK', col: 1, row: 1,
    loc: "Konak'ta", locAdj: "Konak'taki", dat: "Konak'a", abl: "Konak'tan", acc: "Konak'ı", gen: "Konak'ın" },
  { id: 2, key: 'alsancak', name: 'Alsancak', caps: 'ALSANCAK', col: 1, row: 2,
    loc: "Alsancak'ta", locAdj: "Alsancak'taki", dat: "Alsancak'a", abl: "Alsancak'tan", acc: "Alsancak'ı", gen: "Alsancak'ın" },
  { id: 3, key: 'liman', name: 'Liman', caps: 'LİMAN', col: 1, row: 0,
    loc: "Liman'da", locAdj: "Liman'daki", dat: "Liman'a", abl: "Liman'dan", acc: "Liman'ı", gen: "Liman'ın" },
  { id: 4, key: 'kulturpark', name: 'Kültürpark', caps: 'KÜLTÜRPARK', col: 0, row: 2,
    loc: "Kültürpark'ta", locAdj: "Kültürpark'taki", dat: "Kültürpark'a", abl: "Kültürpark'tan", acc: "Kültürpark'ı", gen: "Kültürpark'ın" },
  { id: 5, key: 'kemeralti', name: 'Kemeraltı', caps: 'KEMERALTI', col: 0, row: 1,
    loc: "Kemeraltı'nda", locAdj: "Kemeraltı'ndaki", dat: "Kemeraltı'na", abl: "Kemeraltı'ndan", acc: "Kemeraltı'nı", gen: "Kemeraltı'nın" },
];
export const DISTRICT_IDS = [0, 1, 2, 3, 4, 5];
export const FTUE_DISTRICT = 1; // Konak
export const YARD_ROW = 3;

const NEIGH = DISTRICTS.map((a) =>
  DISTRICTS.filter((b) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1).map((b) => b.id));

/** 4-neighbourhood from col,row. */
export const neighbours = (id) => NEIGH[id];
export const districtAt = (col, row) => DISTRICTS.find((d) => d.col === col && d.row === row);

/** Straight chains (ARCH §3.3): 2 = horizontal or vertical pairs, 3 = a full column. Head is element 0. */
export const CHAINS2 = (() => {
  const out = [];
  for (const a of DISTRICTS) for (const b of DISTRICTS) {
    if (a.id !== b.id && Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1) out.push([a.id, b.id]);
  }
  return out;
})();
export const CHAINS3 = [[0, 5, 4], [4, 5, 0], [3, 1, 2], [2, 1, 3]];

/* ---------------- Items ---------------- */

export const ITEMS = {
  scale:    { name: 'Pul',            low: 'pul',            base: 40,   raw: true },
  blood:    { name: 'Magma özü',      low: 'magma özü',      base: 26,   raw: true },
  bone:     { name: 'Kemik',          low: 'kemik',          base: 32,   raw: true },
  eye:      { name: 'Göz',            low: 'göz',            base: 550,  rare: true },
  armor:    { name: 'Zırh plakası',   low: 'zırh plakası',   base: 330,  product: true },
  cell:     { name: 'Enerji hücresi', low: 'enerji hücresi', base: 165,  product: true },
  concrete: { name: 'Kemik beton',    low: 'kemik beton',    base: 150,  product: true },
  relic:    { name: 'Müze eseri',     low: 'müze eseri',     base: 1500, product: true, rare: true },
};
export const ITEM_KEYS = Object.keys(ITEMS);
export const RAW = ['scale', 'blood', 'bone'];

/* ---------------- Vehicles ---------------- */

export const CREW_TYPES = ['fire', 'debris', 'carve'];
export const CREWS = {
  fire:   { name: 'İtfaiye aracı', short: 'İtfaiye', low: 'itfaiye', send: 'İtfaiye gönder',
            rate: 5,   base: 450, work: 'fire',
            desc: 'İki araçla yangın iki kat hızlı söner.' },
  debris: { name: 'Enkaz ekibi',   short: 'Enkaz',   low: 'enkaz ekibi', send: 'Enkaz ekibi gönder',
            rate: 2.2, base: 400, work: 'rubble',
            desc: 'Kepçe ve damperli kamyon. Yolu açar.' },
  carve:  { name: 'Kesim ekibi',   short: 'Kesim',   low: 'kesim ekibi', send: 'Kesim ekibi gönder',
            rate: 1.4, base: 600, work: 'corpse',
            desc: 'Vinç ve testereler. Leşi sandıklara böler.' },
};
export const START_FLEET = ['fire', 'debris', 'debris', 'carve'];

/* ---------------- Factory ---------------- */

export const RECIPES = [
  { id: 'concrete', out: 'concrete', in: { bone: 3 },  time: 12, buyer: 'İnşaat firmaları' },
  { id: 'armor',    out: 'armor',    in: { scale: 5 }, time: 20, buyer: 'Ordu' },
  { id: 'cell',     out: 'cell',     in: { blood: 4 }, time: 15, buyer: 'Enerji şirketleri' },
  { id: 'relic',    out: 'relic',    in: { eye: 1 },   time: 40, buyer: 'Müzeler' },
];
export const recipeById = (id) => RECIPES.find((r) => r.id === id);

/* ---------------- Monsters ---------------- */

export const MONSTERS = {
  magmadon: { name: 'Magmadon', title: 'Lav Sırtlı', voice: 90, rubble: 120, corpse: 80, fire: true },
};

/* ---------------- Buyers ---------------- */

export const BUYERS = {
  riza: { name: 'Hurdacı Rıza', line: 'Ne getirirsen alırım. Fiyatı ben söylerim.',
          sub: 'Çok satarsan fiyatı düşürür. Bir dakikada toparlar.',
          note: 'Rıza piyasanın altında öder. Daha iyi alıcılar ileride çıkar.' },
  // Offer buyers per item (after G8). Product buyers come from RECIPES[].buyer.
  offer: {
    scale: 'Moda atölyesi', blood: 'Termik santral', bone: 'Gübre fabrikası', eye: 'Özel koleksiyoncu',
    armor: 'Ordu', cell: 'Enerji şirketleri', concrete: 'İnşaat firmaları', relic: 'Müzeler',
  },
};

/* ---------------- Balance ---------------- */

export const BAL = {
  startMoney: 1500,
  startTrust: 50,
  startRivalTrust: 45,
  attackHit: 2.6, // audio.js reads this
  // travel (ARCH §3.3)
  travelBase: 1.5, travelRow: 1.0, travelCol: 0.6, travelSame: 0.3,
  speedStep: 0.25,
  yields: { scale: 0.26, blood: 0.2, bone: 0.15 },
  mutantYield: 1.25,
  ftueYields: ['scale', 'blood', 'bone', 'scale', 'blood', 'bone', 'scale'], // Pul 3, Magma özü 2, Kemik 2
  // spread
  spreadFire: 70, spreadUnattended: 10, spreadWarn: 5, spreadNew: 35,
  // grades
  earlyRatio: 0.75, earlyBonus: 0.25, trustEarly: 8, trustOnTime: 4, trustLate: -6, lateFloor: 0.4,
  // calm
  calmFtue: 40, calmEarly: 35, calmLate: 45, calmFull: 60, firstTimer: 0.5,
  // vehicles
  vehicleMult: 1.5, bays: 8,
  // tender (v1)
  baseContract: 1200, chainValue: 0.45, upkeepValue: 0.04, mutantValue: 1.4,
  bids: [0.75, 1, 1.25], speeds: [0.7, 1, 1.4],
  rivalBid: 0.98, rivalSpeed: 1.05, rivalBoldBid: 0.9, rivalBoldSpeed: 0.95, pity: 25,
  rivalTime: 25,
  deadlineMin: 1.15, deadlineCap: 2.5,
  // market
  rizaFactor: 0.6, rizaDrop: 0.01, rizaRecover: 60, rizaMaxDrop: 0.5,
  driftEvery: 2, histEvery: 10, driftMin: 0.6, driftMax: 1.4, rivalDump: 0.82,
  // offers
  offerEvery: 25, offerMin: 60, offerMax: 120, offerMaxCount: 3,
  // upkeep
  upkeepRate: 1.2, upkeepBase: 350, upkeepMult: 1.85, upkeepCap: 3, upkeepCap4: 4, incomeEvery: 10,
  // offline
  offlineCap: 4 * 3600, offlineRate: 0.5, offlineMinTimer: 3,
  // upgrades
  foremanCost: 2500, foremanEvery: 1,
  equipBase: 900, equipMult: 1.8, equipMax: 5,
  lineBase: 1500, lineMult: 2.2, lineMax: 2,
  // dna
  dnaFromContract: 7, dnaChance: 0.25, scandalChance: 0.35, trustScandal: -8, trustDonate: 4,
  // news
  fillerEvery: 40, headlineTime: 5, npcTime: 4,
  goal4Money: 200,
  goalGap: 12,
};

/* ---------------- Attack timeline (ARCH §2.3) ---------------- */

export const ATTACK = {
  preFirst: 2.4, pre: 0,
  hit: BAL.attackHit,
  endFirst: 3.8, end: 3.6,
  TL: { walk: [null, 1.8], robot: 0.9, bursts: [1.4, 2.35], roar: 1.85, cut: 2.0, fall: [2.0, 2.6], settle: [2.6, null] },
};

/* ---------------- Scripted contracts (ARCH §3.3) ---------------- */

export const SCRIPTS = {
  c1: { chain: [1], extra: [], fires: { 1: 30 }, rubble: { 1: 14 }, corpse: 12, pay: 900, deadline: 120 },
  c2: { chain: [1, 2], extra: [5], fires: { 1: 50, 2: 75 }, rubble: { 1: 28, 2: 28, 5: 14 }, corpse: 50,
        pay: 1390, deadline: 130, spreadTo: 4 },
  c3: { fires: 70, rubble: 100, corpse: 70 },
};
export const SHARES = { 1: [1], 2: [0.45, 0.55], 3: [0.32, 0.43, 0.25] };
export const SEGS = ['head', 'body', 'tail'];

/* ---------------- Goals (DESIGN §4; checks live in goals.js) ---------------- */

export const GOAL_IDS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15'];
