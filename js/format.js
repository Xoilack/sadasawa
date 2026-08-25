// Angka & tanggal, gaya Indonesia.
// Sheet menyimpan nominal dalam RIBUAN — konversi terjadi di satu tempat saja.

export const SCALE = 1000;

export const isNum = (v) => v != null && Number.isFinite(Number(v));

/** Nilai sheet → rupiah sebenarnya. */
export const toRupiah = (v) => (isNum(v) ? Number(v) * SCALE : null);

const dec = (v, d) => v.toFixed(d).replace('.', ',');

/** 958 rb · 872,96 jt · 1,81 M · 1,2 T */
export function compact(value) {
  if (!isNum(value)) return '—';
  const n = Number(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${dec(abs / 1e12, 2)} T`;
  if (abs >= 1e9) return `${sign}${dec(abs / 1e9, 2)} M`;
  if (abs >= 1e6) return `${sign}${dec(abs / 1e6, 2)} jt`;
  if (abs >= 1e3) return `${sign}${dec(abs / 1e3, abs >= 1e5 ? 0 : 1)} rb`;
  return `${sign}${abs % 1 === 0 ? abs : dec(abs, 1)}`;
}

export function full(value) {
  if (!isNum(value)) return '—';
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

export function count(value) {
  if (!isNum(value)) return '—';
  return Math.round(Number(value)).toLocaleString('id-ID');
}

/** Nilai sheet → "Rp 1,14 M" */
export function rp(sheetValue) {
  const v = toRupiah(sheetValue);
  if (!isNum(v)) return '—';
  const sign = v < 0 ? '-' : '';
  return `${sign}Rp ${compact(Math.abs(v))}`;
}

/** Nilai sheet → "Rp 1.142.533.000" */
export function rpFull(sheetValue) {
  const v = toRupiah(sheetValue);
  if (!isNum(v)) return '—';
  const sign = v < 0 ? '-' : '';
  return `${sign}Rp ${full(Math.abs(v))}`;
}

export function percent(value, d = 1) {
  if (!isNum(value)) return '—';
  return `${dec(Number(value), d)}%`;
}

export function signedPercent(value, d = 1) {
  if (!isNum(value)) return '—';
  return `${Number(value) > 0 ? '+' : ''}${dec(Number(value), d)}%`;
}

/* ---------------------------------------------------------------- */
/* tanggal                                                           */
/* ---------------------------------------------------------------- */

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function dateShort(ymd) {
  if (!ymd) return '—';
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${BULAN[m - 1]}`;
}

export function dateLong(ymd) {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${BULAN[m - 1]} ${y}`;
}

export function dow(ymd) {
  if (!ymd) return '';
  return HARI[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
}

/** "2026-08" → "Agustus 2026" */
export function monthLong(key) {
  if (!key) return '—';
  const [y, m] = key.split('-').map(Number);
  return `${BULAN_PANJANG[m - 1]} ${y}`;
}

export function monthShort(key) {
  if (!key) return '—';
  const [y, m] = key.split('-').map(Number);
  return `${BULAN[m - 1]} ${String(y).slice(2)}`;
}

export function stamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const opt = { timeZone: 'Asia/Jakarta' };
  const date = new Intl.DateTimeFormat('id-ID', { ...opt, day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('id-ID', { ...opt, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${date} • ${time}`;
}

/* ---------------------------------------------------------------- */
/* misc                                                              */
/* ---------------------------------------------------------------- */

/**
 * Identitas toko diambil langsung dari sheet, supaya dashboard dan sheet
 * terbaca sebagai satu sistem:
 *
 *   SLOTGEMBIRA  plat marun tua, tulisan putih
 *   SEMESTA88    plat ungu tua, tulisan hijau limau
 *   MANJABET     plat hitam, tulisan emas
 *
 * `plate`/`on` dipakai untuk panel bergaya sheet; `color` adalah versi yang
 * tetap terbaca sebagai garis grafik dan teks di tema terang maupun gelap
 * (marun murni terlalu gelap untuk itu).
 */
const STORE_META = {
  SLOTGEMBIRA: { short: 'SLG', plate: '#4a0a0a', on: '#ffffff', color: '#d2483f' },
  SEMESTA88: { short: 'SE8', plate: '#460289', on: '#ccff33', color: '#8b5cf6' },
  MANJABET: { short: 'MANJA', plate: '#0b0b0b', on: '#e2c360', color: '#c9a227' },
};
const FALLBACK = [
  { plate: '#123a4a', on: '#e6f6ff', color: '#2e8ca3' },
  { plate: '#3b2a05', on: '#ffe9b0', color: '#96803a' },
  { plate: '#3d0d2c', on: '#ffd9ef', color: '#a44080' },
  { plate: '#0d3320', on: '#ccf5e0', color: '#1f8a6d' },
  { plate: '#2a1244', on: '#e8d9ff', color: '#7c5cd6' },
];

export function storeMeta(name, index = 0) {
  return STORE_META[name] || { short: String(name || '').slice(0, 5), ...FALLBACK[index % FALLBACK.length] };
}

export function storeShort(name) {
  return (STORE_META[name] && STORE_META[name].short) || String(name || '').slice(0, 5);
}

export function storeColor(name, index = 0) {
  return storeMeta(name, index).color;
}

export function storePlate(name, index = 0) {
  return storeMeta(name, index).plate;
}

export function storeOn(name, index = 0) {
  return storeMeta(name, index).on;
}

export function deltaClass(v) {
  if (!isNum(v) || Number(v) === 0) return 'flat';
  return Number(v) > 0 ? 'up' : 'down';
}

export function arrow(v) {
  if (!isNum(v) || Number(v) === 0) return '→';
  return Number(v) > 0 ? '▲' : '▼';
}
