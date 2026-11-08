// Aftermath v2: every gameplay string (DESIGN §9). No emoji, no "!", "sen" to the player, "siz" from NPCs.
// District suffix forms come from data.DISTRICTS; copy never builds suffixes by hand.
import { DISTRICTS, ITEMS, CREWS } from './data.js';
import { fmtMoney, fmtDur, durLoc, fmtInt } from './format.js';

const D = (id) => DISTRICTS[id];

export const NPC = {
  nevin: { who: 'nevin', name: 'Nevin Aksoy', role: 'Belediye Afet Koordinatörü', initials: 'NA' },
  riza: { who: 'riza', name: 'Hurdacı Rıza', role: 'Hurdacı', initials: 'HR' },
};

export const TITLE = { name: 'AFTERMATH', tagline: 'Herkes savaşı izler. Temizlik bize kalır.' };

/* ---------------- FTUE (DESIGN §3, Konak version) ---------------- */

export const FTUE_COPY = {
  cold: { objective: 'Radar bir sinyal aldı' },
  call: { objective: 'Belediyenin işini al' },
  fire: { objective: "Konak'taki yangını söndür", bubble: "Konak'a dokun.",
          npc: 'Yangın sönmeden kepçe girmesin. Kural bu.' },
  rubble: { objective: 'Enkazı kaldır, yolu aç', bubble: "Konak'a tekrar dokun." },
  carve: { objective: 'Canavarı parçala', bubble: "Konak'a tekrar dokun.",
           npc: 'Parçalar sizin. Belediye temiz sokak istiyor, o kadar.' },
  deliver: { objective: 'Ödemeyi al' },
  sell: { objective: 'Parçaları sat', bubble: 'Parçalar depoda.' },
  buy: { objective: 'İkinci itfaiye aracını al', npc: 'Göze iyi para verdim, haberin olsun.' },
  done: { npc: 'Radar yeni bir sinyal aldı. Bu sefer iki bölge.' },
};

/* ---------------- Calls (Nevin, siz) ---------------- */

export function callLines(s, t) {
  const no = t.no;
  if (no === 1) {
    return [
      'Aftermath? Nevin Aksoy, Belediye Afet Koordinasyon.',
      "Canavar Konak'a düştü. Yangın var, yol enkazla kapalı.",
      'İlk iş sizin, pazarlığa vakit yok: 900 bin lira.',
    ];
  }
  if (no === 2) {
    return [
      "Kafa Konak'ta, gövde Alsancak'ta. Kemeraltı'nda da enkaz var.",
      'Süre 2 dk 10 sn; erken biterse prim öderiz.',
    ];
  }
  const a = s.attack;
  const head = a && a.chain.length ? D(a.chain[0]) : null;
  const lines = [];
  lines.push(head ? `Kafa ${head.loc}. ${a.sectors.length} bölgede iş var.` : 'Yeni bir iş var.');
  lines.push(`Ödeme ${fmtMoney(t.call.pay)}. Süre ${fmtDur(t.call.deadline)}.`);
  return lines;
}

/* ---------------- Objectives ---------------- */

export const OBJ = {
  fire: (id) => `${D(id).locAdj} yangını söndür`,
  rubble: (id) => `${D(id).locAdj} enkazı kaldır`,
  carve: (id) => `${D(id).locAdj} leşi parçala`,
  tail: (id) => `${D(id).locAdj} kuyruğu parçala`,
  tailWait: 'Süpürge Holding işi bitirsin',
  collect: 'Ödemeyi al',
  call: 'İşi al',
  tender: 'Teklifini seç',
  reveal: 'Sonucu gör',
  calm: 'Sıradaki saldırıya hazırlan',
  buyer: 'Plakasız araca bir cevap ver',
  chapter: 'Şehir senin',
  pointer: (id) => `${D(id).dat} dokun.`,
};

/* ---------------- Rule refusals (≤ 8 words) ---------------- */

export const REASON = {
  noVehicle: 'Boşta araç yok.',
  noFire: 'Bu bölgede yangın yok',
  fireFirst: 'Yangın sönmeden giremez',
  noRubble: 'Bu bölgede enkaz yok',
  roadFirst: 'Önce yol açılmalı',
  noCorpse: 'Bu bölgede canavar yok',
  rivalSite: "Bu bölge Süpürge Holding'de",
  noJob: 'Şu an iş yok',
  noneHere: 'Bu bölgede araç yok',
  money: (missing) => `Para yetmiyor: ${fmtMoney(missing)} eksik.`,
  linesFull: 'Tüm hatlar dolu',
  material: (n, item) => `Malzeme yetmiyor: ${fmtInt(n)} ${ITEMS[item].low} eksik.`,
  locked: 'Henüz açılmadı',
  damaged: 'Önce bölge temizlenmeli',
  notCalm: 'Hazırlık sırasında yapılır',
  maxTier: 'En üst kademede',
  maxLevel: 'En üst seviyede',
  owned: 'Zaten var',
  nothing: 'Satacak parça yok',
  noStock: 'Depoda yok',
  offerGone: 'Teklif artık geçerli değil',
  noDna: 'Depoda tüp yok',
  wrongPhase: 'Şu an yapılamaz',
  noTail: 'Kuyruk işi yok',
  autoLocked: 'Vardiya şefiyle açılır',
  confirmRed: (pct) => `Kazanma şansın ${pct}. Yine de gönderilsin mi?`,
};

/* ---------------- Floats, toasts ---------------- */

export const FLOAT = {
  part: (item, n = 1) => `+${n} ${ITEMS[item].name}`,
  fireOut: 'Yangın söndü',
  roadOpen: 'Yol açık',
  clean: 'TEMİZ',
  spread: 'Yangın sıçradı',
  paused: 'Durdu',
  income: (amt) => `+${fmtMoney(amt)} · bakım`,
  upkeep: (tier) => `Kademe ${tier}`,
};

export const TOAST = {
  foreman: (n) => `Vardiya şefi ${n} aracı yola çıkardı.`,
  sold: (total) => `Satış: ${fmtMoney(total)}`,
  bought: (type) => `${CREWS[type].name} filoya katıldı.`,
  factoryDone: (item) => `${ITEMS[item].name} hazır.`,
  dna: 'Kafatasından etiketsiz bir tüp çıktı. Depoya kaldırıldı.',
  rare: (item) => `Nadir parça · ${ITEMS[item] ? ITEMS[item].name : 'DNA'}`,
  offerExpired: 'Bir teklifin süresi doldu.',
  upkeep: (id, tier) => `${D(id).name} · Bakım sözleşmesi · Kademe ${tier}`,
};

/* ---------------- Status words ---------------- */

export const STAGE_NAME = { fire: 'Yangın', rubble: 'Enkaz', carve: 'Kesim' };
export const SEG_NAME = { head: 'Kafa', body: 'Gövde', tail: 'Kuyruk' };
export const CHIP_LABEL = {
  radar: 'RADAR', alarm: 'ALARM', cagri: 'ÇAĞRI', ihale: 'İHALE', teslim: 'TESLİM',
  gecikme: 'GECİKME', rival: 'SÜPÜRGE ÇALIŞIYOR', edildi: 'TESLİM EDİLDİ',
};
export const DISTRICT_STATE = {
  spreading: 'Sıçramak üzere',
  paused: 'Durdu',
  upkeepPaused: 'Bakım durdu',
  clean: 'Temiz',
  rival: 'Süpürge Holding çalışıyor',
};
export const LOOT = {
  head: 'Çıkacaklar: pul, kemik, magma özü. Kafada göz var.',
  body: 'Çıkacaklar: pul, kemik, magma özü.',
  tail: 'Çıkacaklar: pul, kemik, magma özü.',
};

/* ---------------- Receipt ---------------- */

export const RECEIPT = {
  title: (ids) => (ids.length === 1 ? `${D(ids[0]).name} teslim edildi` : `${ids.length} bölge teslim edildi`),
  stamp: { early: 'ERKEN TESLİM', ontime: 'ZAMANINDA', late: 'GECİKTİ' },
  consequence: {
    early: 'Belediye prim ödedi. Güvenin arttı.',
    ontime: 'Söz tutuldu. Güvenin arttı.',
    late: 'Gecikme ödemeden düşüldü. Güvenin azaldı.',
  },
  time: 'Süre',
  promise: 'Söz',
  pay: 'Ödeme',
  bonus: 'Erken teslim primi',
  cut: 'Gecikme kesintisi',
  trust: 'Güven',
  parts: 'Çıkan parçalar',
  total: 'Toplam',
  button: 'Ödemeyi al',
};

/* ---------------- Tender ---------------- */

export const TENDER = {
  title: (names) => `Temizlik ihalesi · ${names.join('–')}`,
  cols: ['İndirimli', 'Liste', 'Yüksek'],
  rows: ['Hızlı', 'Normal', 'Rahat'],
  estimate: (mid, lo, hi) => `Filonla tahmini süre: ${mid} (${lo}–${hi})`,
  legend: 'Taralı: tahmini süren bu sözden uzun',
  recommended: 'Önerilen',
  rival: 'Süpürge Holding',
  habit: 'Genelde liste fiyatı, normal süre.',
  habitBold: 'Süpürge Holding bu sefer iddialı.',
  outcome: (pay) => `Kazanırsan ${pay} ve canavarın parçaları.`,
  summaryLine: (chance, promise, est) => `Şans ${chance} · Söz ${promise} · Tahminin ${est}`,
  submit: 'Teklifi gönder',
  send: 'Gönder',
  cancel: 'Vazgeç',
  bubbles: [
    'Her kutu bir teklif. Yeşil kolay kazanır, az kazandırır.',
    (est) => `Filonla bu iş ${est} sürer. Daha kısa söz verme.`,
    'Süpürge Holding genelde liste fiyatı verir.',
  ],
  revealRows: ['Fiyat', 'Süre', 'Güven'],
  revealTotal: 'Toplam puan',
  you: 'Aftermath',
  stampWin: 'KAZANDIN',
  stampLose: 'SÜPÜRGE HOLDİNG',
  startWork: 'İşe başla',
  takeTail: 'Kuyruğu al',
  releaseTail: 'Kuyruğu bırak',
  loseLine: 'Bu sefer olmadı. Kuyruğu almadılar; isterseniz sizin.',
  winWhy: { price: 'Fiyatın kazandırdı.', speed: 'Süre sözün kazandırdı.', trust: 'Güvenin kazandırdı.' },
  loseWhy: { price: 'Süpürge daha ucuz verdi.', speed: 'Süpürge daha kısa süre verdi.', trust: "Süpürge Holding'e güven daha yüksek." },
};

export const RIVAL_COPY = {
  card: 'Kuyruk sende',
  sub: 'Ücret yok, parçalar senin.',
  name: 'Süpürge Holding',
};

/* ---------------- Calm cards ---------------- */

export const CALM = {
  next: 'Sıradaki iş',
  eta: (t) => `Radar ${t}`,
  line: 'Kıyıya yaklaşıyor.',
  lineMutant: 'Radar alışılmadık bir iz görüyor.',
  skip: 'Sıradaki işe geç',
  sellParts: (n) => `Depoda ${fmtInt(n)} parça var`,
  sellBtn: 'Sat',
  factoryIdle: 'Fabrika boş',
  factoryBtn: 'Üret',
  buy: (type) => `${CREWS[type].name} al`,
  buyBtn: 'Satın al',
  upkeep: (id) => `${D(id).name} bakımını al`,
  upkeepBtn: 'Bakımı al',
  upkeepText: 'Temiz bölgeler dakikada gelir getirir.',
  offer: (buyer) => `${buyer} teklif verdi`,
  offerBtn: 'Teklife bak',
};

/* ---------------- Notices ---------------- */

export const NOTICE = {
  v1: { title: 'Aftermath yenilendi', body: ['Eski kayıt bu sürümle açılmıyor; yeni bir şirketle başlıyorsun.'], button: 'Tamam' },
  offline: (amt, sec) => ({
    title: 'Tekrar hoş geldin',
    body: [`Sen yokken bakım sözleşmeleri ${fmtMoney(amt)} getirdi.`, `${fmtDur(sec)} uzaktaydın.`],
    button: 'Kasaya al',
  }),
  buyer: (amt) => ({
    title: 'Depo kapısında plakasız bir araç',
    body: [`Tüpü istiyorlar. ${fmtMoney(amt)}, nakit.`, 'Kim olduklarını söylemiyorlar.'],
    note: 'Haber sızarsa güven kaybedebilirsin.',
    donate: 'Üniversiteye bağışla',
    sell: 'Sat',
  }),
  chapter: {
    title: 'Şehir senin.',
    body: ["Altı bölgenin bakımı Aftermath'te.", "Körfez'in öbür yakası seni bekliyor."],
    button: 'Devam et',
  },
};

/* ---------------- Company ---------------- */

export const COMPANY = {
  buy: 'Satın al',
  owned: (n) => `${fmtInt(n)} araç`,
  equipment: { name: 'Ekipman', desc: 'Tüm araçlar %25 daha hızlı çalışır.' },
  lines: { name: 'Fabrika hattı', desc: 'Bir üretim hattı daha.' },
  foreman: { name: 'Vardiya şefi', desc: 'Boştaki araçları en yakın işe kendisi yollar.' },
  level: (n) => `Seviye ${n}`,
  stats: {
    contracts: 'Teslim edilen iş', lost: 'Kaybedilen ihale', attacks: 'Saldırı', parts: 'Çıkan parça',
    earned: 'Toplam kazanç', sold: 'Satılan parça', early: 'Erken teslim', fastest: 'En hızlı temizlik', trust: 'Güven',
  },
};

export const FACTORY = {
  row: (n, inItem, outItem, time) => `${fmtInt(n)} ${ITEMS[inItem].low} → 1 ${ITEMS[outItem].low} · ${time} sn`,
  raw: (rawV, outV) => `Ham satarsan ${fmtMoney(rawV)}, işlersen ${fmtMoney(outV)}`,
  start: 'Üret',
  auto: 'Otomatik tekrar',
  left: (sec) => `${Math.max(0, Math.ceil(sec))} sn`,
};

/* ---------------- Goals (DESIGN §4) ---------------- */

export const GOAL_COPY = {
  G1: { text: "Konak'taki yangını söndür", reward: null },
  G2: { text: 'Parçaları sat', reward: 'Ödül: Şirket' },
  G3: { text: 'İkinci itfaiye aracını al', reward: 'Ödül: Radar' },
  G4: { text: 'İkinci işi teslim et', reward: 'Ödül: Fabrika ve 200 bin ₺', calm: 'Sıradaki saldırıya hazırlan' },
  G5: { text: 'Fabrikada ilk kemik betonu üret', reward: 'Ödül: İhaleler' },
  G6: { text: "Süpürge Holding'i bir ihalede yen", reward: 'Ödül: Bakım sözleşmeleri' },
  G7: { text: 'Bir bölgenin bakımını üstlen', reward: 'Ödül: Sen yokken gelir' },
  G8: { text: '4. sözleşmeyi tamamla', reward: 'Ödül: Alıcılar ve zırh plakası' },
  G9: { text: 'Bir alıcıya 5 parça sat', reward: 'Ödül: Enerji hücresi' },
  G10: { text: 'Bir işi altın bölgede bitir', reward: 'Ödül: Ekipman ve ikinci hat' },
  G11: { text: 'Filoda 3 kesim ekibi olsun', reward: 'Ödül: Vardiya şefi ve müze eseri' },
  G12: { text: '7. sözleşmeyi tamamla', reward: 'Ödül: Nadir parça' },
  G13: { text: 'Plakasız araca bir cevap ver', reward: 'Ödül: Yeni izler' },
  G14: { text: "Güveni 80'e çıkar", reward: 'Ödül: Bakımda 4. kademe' },
  G15: { text: 'Altı bölgenin bakımını da üstlen', reward: 'Ödül: Şehir senin' },
};
export const UNITS = { contract: 'sözleşme', part: 'parça', vehicle: 'araç', district: 'bölge', trust: 'güven' };

/* ---------------- News headline bank (DESIGN §9.5, ≤ 56 characters) ---------------- */

export const NEWS = {
  attack: 'Magmadon Liman açıklarında. KALKAN-07 sahada.',
  // later attacks rotate so the archive does not repeat one line (playtest m11)
  attackAgain: ['Körfezde alarm. KALKAN-07 yine yolda.', 'Magmadon yeniden kıyıda. Esnaf kepenk indirdi.', 'Liman yine boşaltıldı. KALKAN-07 sahada.', 'Sahil yolunda sirenler. Magmadon karaya çıkıyor.'],
  mutant: 'Uzmanlar gelen canavarın rengini doğal bulmuyor.',
  won: (deadline) => `Temizlik ihalesi Aftermath'in. Söz: ${fmtDur(deadline)}.`,
  lost: "İhale Süpürge Holding'e gitti. Kuyruk Aftermath'e kaldı.",
  early: (elapsed) => `Şehir ${durLoc(fmtDur(elapsed))} temizlendi. Belediye alışmasın.`,
  ontime: (id) => `Aftermath sözünü tuttu. ${D(id).loc} trafik açıldı.`,
  late: "Kemeraltı esnafı: 'Koku hâlâ dükkânda.'",
  rivalDump: 'Süpürge Holding pulları piyasaya sürdü. Fiyat düştü.',
  spread: (from, to) => `Yangın ${D(from).abl} ${D(to).dat} sıçradı.`,
  scandal: 'İddia: Aftermath canavar örneği sattı. Şirket yorumsuz.',
  donated: 'Aftermath bulduğu örneği üniversiteye bağışladı.',
  boom: {
    armor: 'Ordu acil zırh alıyor. Teklif bir dakika geçerli.',
    cell: 'Enerji şirketleri hücre arıyor. Teklif kısa süreli.',
    concrete: 'İnşaat firmaları kemik beton istiyor. Stok az.',
    relic: 'Müzeler eser için yarışıyor. Teklif kısa süreli.',
    scale: 'Moda atölyesi pul topluyor. Teklif kısa süreli.',
    blood: 'Termik santral magma özü arıyor. Fiyat yüksek.',
    bone: 'Gübre fabrikası kemik topluyor. Fiyat yüksek.',
    eye: 'Bir koleksiyoncu göz arıyor. Fiyat yüksek.',
  },
  filler: [
    'Başkan robotlara teşekkür etti. Temizlikten söz etmedi.',
    'KALKAN-07 pilotları imza dağıttı. Kepçeciye soran yok.',
    'Hava durumu: Parçalı bulutlu, canavar beklenmiyor.',
    'Hurdacı Rıza yeni kamyonet aldı. Sebebi soruldu, güldü.',
    "Kemeraltı'nda çay ocağı açıldı. İlk çaylar itfaiyeye.",
    "Bir banka canavar hasarını 'doğal afet' saymadı.",
    "Süpürge Holding: 'Biz olsak çoktan bitmişti.'",
    'Moda haftasında üç tasarımcı pul ceket gösterdi.',
  ],
  fillerMutant: 'Kültürpark havuzunda tanımsız balıklar görüldü.',
};

/* ---------------- Misc labels used by selectors ---------------- */

export const LABEL = {
  workers: (fire, debris, carve) => {
    const parts = [];
    if (fire) parts.push(`${fire} itfaiye`);
    if (debris) parts.push(`${debris} enkaz ekibi`);
    if (carve) parts.push(`${carve} kesim ekibi`);
    return parts.join(', ');
  },
  status: (working, enroute) => {
    const p = [];
    if (working) p.push(`${working} çalışıyor`);
    if (enroute) p.push(`${enroute} yolda`);
    return p.join(', ');
  },
  ready: (n) => `${fmtInt(n)} hazır`,
  readyOf: (n, total) => `${fmtInt(n)} hazır / ${fmtInt(total)}`,
  recall: (n) => `Geri çağır (${fmtInt(n)})`,
  enroute: (sec) => `Yolda · ${Math.max(1, Math.ceil(sec))} sn`,
  returning: 'Dönüyor',
  contractLine: (pay) => `Ödeme ${fmtMoney(pay, true)} + parçalar`,
  progress: (done, total, unit) => `${fmtInt(done)}/${fmtInt(total)} ${unit}`,
  trustD: (d) => `${d > 0 ? '+' : ''}${fmtInt(d)} güven`,
  upkeepRate: (rate, gain = false) => `${gain ? '+' : ''}${fmtMoney(rate * 60)}/dk`,
  upkeepNext: (tier, cost) => (tier === 1
    ? `Bakımı üstlen: ${fmtMoney(cost)}`
    : `Kademe ${tier}'${tier === 2 ? 'ye' : 'e'} çıkar: ${fmtMoney(cost)}`),
  upkeepTitle: (id, tier) => `${D(id).name} · Bakım sözleşmesi · Kademe ${tier}`,
  sellAll: (total) => (total > 0 ? `Hepsini Rıza'ya sat · ${fmtMoney(total)}` : "Hepsini Rıza'ya sat"),
  delta: (pct) => `Rıza'dan ${pct} fazla`,
  depotCount: (n) => `${fmtInt(n)} parça`,
};
