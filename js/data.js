// Aftermath — oyun verileri ve denge ayarları.
// Yeni canavar, ürün ya da ekip eklemek için sadece bu dosyayı düzenlemek yeterli.

export const COLS = 3;
export const ROWS = 2;

export const SECTORS = [
  { id: 0, name: 'Liman', style: 'harbor' },
  { id: 1, name: 'Merkez', style: 'center' },
  { id: 2, name: 'Finans', style: 'finance' },
  { id: 3, name: 'Sanayi', style: 'industry' },
  { id: 4, name: 'Park', style: 'park' },
  { id: 5, name: 'Eski Çarşı', style: 'old' },
];

export function neighbors(i) {
  const r = Math.floor(i / COLS);
  const c = i % COLS;
  const out = [];
  if (c > 0) out.push(i - 1);
  if (c < COLS - 1) out.push(i + 1);
  if (r > 0) out.push(i - COLS);
  if (r < ROWS - 1) out.push(i + COLS);
  return out;
}

// Depoda tutulan ve satılabilen her şey
export const ITEMS = {
  scale:    { name: 'Pul',            icon: '🐉', base: 40,   elastic: 0.008 },
  blood:    { name: 'Kan',            icon: '🩸', base: 26,   elastic: 0.008 },
  bone:     { name: 'Kemik',          icon: '🦴', base: 32,   elastic: 0.008 },
  eye:      { name: 'Göz',            icon: '👁️', base: 550,  elastic: 0.06 },
  armor:    { name: 'Zırh Plakası',   icon: '🛡️', base: 330,  elastic: 0.02 },
  cell:     { name: 'Enerji Hücresi', icon: '🔋', base: 165,  elastic: 0.02 },
  concrete: { name: 'Kemik Beton',    icon: '🧱', base: 150,  elastic: 0.02 },
  relic:    { name: 'Müze Eseri',     icon: '🏺', base: 1500, elastic: 0.06 },
};
export const ITEM_KEYS = Object.keys(ITEMS);
export const RAW = ['scale', 'blood', 'bone'];

export const RECIPES = [
  { id: 'armor',    out: 'armor',    in: { scale: 5 }, time: 20, buyer: 'Ordu' },
  { id: 'cell',     out: 'cell',     in: { blood: 4 }, time: 15, buyer: 'Enerji şirketleri' },
  { id: 'concrete', out: 'concrete', in: { bone: 3 },  time: 12, buyer: 'İnşaat firmaları' },
  { id: 'relic',    out: 'relic',    in: { eye: 1 },   time: 40, buyer: 'Müzeler' },
];

export const CREW_TYPES = ['fire', 'debris', 'carve'];
export const CREWS = {
  fire:   { name: 'İtfaiye',         icon: '🚒', rate: 5,   base: 450, desc: 'Yangınları söndürür.' },
  debris: { name: 'Enkaz Ekibi',     icon: '🚜', rate: 2.2, base: 400, desc: 'Enkazı kaldırır.' },
  carve:  { name: 'Parçalama Ekibi', icon: '🔪', rate: 1.1, base: 600, desc: 'Canavarı parçalayıp depoya taşır.' },
};
// Her ekip türünün sektörde baktığı iş alanı
export const WORK = { fire: 'fire', debris: 'rubble', carve: 'corpse' };

export const MONSTERS = {
  magmadon: {
    name: 'Magmadon',
    title: 'Lav Sırtlı',
    body: '#c9452f',
    belly: '#f2a65a',
    spike: '#ffd166',
    fire: true,
    rubble: 120,
    corpse: 80,
  },
};
export const MUTANT_PALETTE = { body: '#7b3fbf', belly: '#9be564', spike: '#d6ff4d' };

export const UPGRADES = {
  speed:   { name: 'Ekipman',      icon: '⚙️', desc: 'Tüm ekipler %25 daha hızlı çalışır.', base: 900,  mult: 1.8, max: 10 },
  storage: { name: 'Depo',         icon: '📦', desc: '+40 depo kapasitesi.',                base: 500,  mult: 1.6, max: 12 },
  factory: { name: 'Fabrika Hattı', icon: '🏭', desc: '+1 üretim hattı.',                   base: 1500, mult: 2.2, max: 3 },
};

export const RIVAL = 'Süpürge Holding';
export const START_CREWS = { fire: 1, debris: 2, carve: 1 };
export const START_LEVELS = [1, 1, 2, 0, 1, 1];

export const BAL = {
  startMoney: 1500,
  incomePerLevel: 1.2, // bakım sözleşmesi seviyesi başına saniyelik gelir
  firstCalm: 8,
  calmTime: 75,
  rivalTime: 25,
  baseContract: 1200,
  storageBase: 60,
  storageStep: 40,
  sectorBase: 350,
  sectorMax: 5,
  yields: { scale: 0.26, blood: 0.2, bone: 0.15 }, // canavar tonu başına parça
  attackHit: 2.6,
  attackEnd: 4.4,
  offlineCap: 4 * 3600,
  offlineRate: 0.5,
};
