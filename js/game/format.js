// Turkish number, money and time formatting (DESIGN §9.1 rule 5, §9.2).
// Money is internal units; display = internal × 1000 ₺.

/** Integer with dot thousands: 1737500 -> "1.737.500". */
export function fmtInt(n) {
  const v = Math.round(Number(n) || 0);
  const neg = v < 0;
  let str = String(Math.abs(v));
  let out = '';
  while (str.length > 3) {
    out = '.' + str.slice(-3) + out;
    str = str.slice(0, -3);
  }
  return (neg ? '-' : '') + str + out;
}

/** Decimal with comma, at most `d` decimals, trailing zeros trimmed, truncated (never overstates). */
export function fmtDec(x, d = 1) {
  const p = Math.pow(10, d);
  const v = Math.floor(Math.abs(x) * p + 1e-6) / p;
  let str = v.toFixed(d);
  if (str.includes('.')) str = str.replace(/0+$/, '').replace(/\.$/, '');
  const [i, f] = str.split('.');
  return (x < 0 ? '-' : '') + fmtInt(Number(i)) + (f ? ',' + f : '');
}

function scaled(m) {
  const a = Math.abs(m);
  return fmtDec(m, a < 10 ? 2 : a < 100 ? 1 : 0);
}

/**
 * fmtMoney(900) -> "900 bin ₺"; fmtMoney(1390) -> "1,39 milyon ₺";
 * fmtMoney(1390, true) -> "1,39 Mn ₺"; fmtMoney(2.4e6, true) -> "2,4 Mr ₺".
 */
export function fmtMoney(v, compact = false) {
  const n = Number(v) || 0;
  const a = Math.abs(n);
  if (a < 1000) return `${fmtInt(Math.floor(a + 1e-6) * Math.sign(n) || 0)} bin ₺`;
  if (a < 1e6) return `${scaled(n / 1000)} ${compact ? 'Mn' : 'milyon'} ₺`;
  return `${scaled(n / 1e6)} ${compact ? 'Mr' : 'milyar'} ₺`;
}

/** Compact money (HUD, cells): "2,41 Mn ₺". */
export const fmtMoneyShort = (v) => fmtMoney(v, true);

/** Compact money without the currency sign, for dense cells: "1,04 Mn". */
export const fmtMoneyBare = (v) => fmtMoney(v, true).replace(/ ₺$/, '');

/** Exact lira: 1737.5 -> "1.737.500 ₺". */
export const fmtMoneyExact = (v) => `${fmtInt(Math.round((Number(v) || 0) * 1000))} ₺`;

/** Chip time: 102 -> "1:42" (ceil, never negative). */
export function fmtTime(sec) {
  const t = Math.max(0, Math.ceil((Number(sec) || 0) - 1e-6));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Sentence duration: 102 -> "1 dk 42 sn"; 45 -> "45 sn"; 120 -> "2 dk"; 3h -> "3 sa". */
export function fmtDur(sec) {
  let t = Math.max(0, Math.round(Number(sec) || 0));
  if (t >= 3600) {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    return m ? `${h} sa ${m} dk` : `${h} sa`;
  }
  const m = Math.floor(t / 60);
  const s = t % 60;
  if (!m) return `${s} sn`;
  return s ? `${m} dk ${s} sn` : `${m} dk`;
}

/** Locative suffix for a duration string: "1 dk 30 sn" -> "1 dk 30 sn'de", "2 dk" -> "2 dk'da". */
export function durLoc(str) {
  return /dk$/.test(str) ? `${str}'da` : /sa$/.test(str) ? `${str}'te` : `${str}'de`;
}

/** Percent from a 0..1 fraction: 0.62 -> "%62". */
export const fmtPct = (frac) => `%${Math.round((Number(frac) || 0) * 100)}`;

/** Tons, rounded up so remaining work never reads 0: 13.2 -> "14 ton". */
export const fmtTon = (t) => `${fmtInt(Math.ceil((Number(t) || 0) - 1e-6))} ton`;

/** Signed integer: 8 -> "+8", -6 -> "-6". */
export const fmtSigned = (n) => (n > 0 ? `+${fmtInt(n)}` : fmtInt(n));

/** Turkish upper case: "istif" -> "İSTİF", "ılık" -> "ILIK". */
export function trUpper(str) {
  return String(str).replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
}

/** Turkish lower case: "İSTİF" -> "istif". */
export function trLower(str) {
  return String(str).replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}
