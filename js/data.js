export const state = {
  raw: null,
  rows: [],
  promos: [],
  stores: [],
  months: [],
  store: 'ALL',
  month: null,
  loading: false,
  error: null,
  sourceLabel: '',

  mode: 'bulan',
  from: null,
  to: null,
  day: null,
  dowFilter: null,
};

// ================================================================
// DATA DARI ADMIN PANEL (localStorage)
// ================================================================

export async function loadFromAdmin() {
  const stored = localStorage.getItem('adni81_data');
  if (!stored) return null;
  
  try {
    const data = JSON.parse(stored);
    if (data.rows && data.rows.length) {
      return {
        ok: true,
        source: 'Admin Panel Adni81',
        generated_at: data.lastUpdated || new Date().toISOString(),
        amount_scale: 1000,
        stores: data.stores || ['ADNI81'],
        months: data.months || [],
        rows: data.rows,
        promos: data.promos || []
      };
    }
  } catch(e) {
    console.warn('Gagal load data admin:', e);
  }
  return null;
}

// ================================================================
// LOAD DATA UTAMA
// ================================================================

export function bounds() {
  if (!state.rows.length) return { min: null, max: null };
  const dates = state.rows.map((r) => r.date).sort();
  return { min: dates[0], max: dates[dates.length - 1] };
}

export function lastFilledDate(range) {
  const from = range && range.from;
  const to = range && range.to;
  let best = null;
  for (const r of state.rows) {
    if (!r.reported) continue;
    if (state.store !== 'ALL' && r.store !== state.store) continue;
    if (from && r.date < from) continue;
    if (to && r.date > to) continue;
    if (!best || r.date > best) best = r.date;
  }
  return best;
}

export function hasData(ymd) {
  return state.rows.some((r) =>
    r.reported && r.date === ymd &&
    (state.store === 'ALL' || r.store === state.store));
}

export function periodLabel(fmt) {
  if (state.mode === 'hari') return state.day ? fmt.dateLong(state.day) : '—';
  if (state.mode === 'rentang') return `${fmt.dateLong(state.from)} → ${fmt.dateLong(state.to)}`;
  return fmt.monthLong(state.month);
}

export function activeRange() {
  if (state.mode === 'hari' && state.day) return { from: state.day, to: state.day };
  if (state.mode === 'rentang' && state.from && state.to) {
    return state.from <= state.to
      ? { from: state.from, to: state.to }
      : { from: state.to, to: state.from };
  }
  if (state.month) {
    const [y, m] = state.month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${state.month}-01`, to: `${state.month}-${String(last).padStart(2, '0')}` };
  }
  return { from: null, to: null };
}

const CONFIG_URL = 'data/config.json';
const LOCAL_URL = 'data/reports.json';

async function readConfig() {
  try {
    const res = await fetch(`${CONFIG_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

function normalise(payload, sourceLabel) {
  const rows = (payload.rows || []).map((r) => ({
    ...r,
    profit: r.profit != null ? r.profit : (r.member_win == null ? null : -r.member_win),
    remarks: Array.isArray(r.remarks) ? r.remarks : [],
  }));

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.store.localeCompare(b.store));

  const stores = payload.stores && payload.stores.length
    ? [...payload.stores]
    : [...new Set(rows.map((r) => r.store))].sort();

  const months = payload.months && payload.months.length
    ? [...payload.months]
    : [...new Set(rows.map((r) => `${r.year}-${String(r.month).padStart(2, '0')}`))].sort();

  const promos = (payload.promos || []).map((p) => ({
    ...p,
    month_key: `${p.year}-${String(p.month).padStart(2, '0')}`,
    winners: (p.winners || []).map((w) => ({
      ...w,
      profit: w.profit != null ? w.profit : (w.member_win == null ? null : -w.member_win),
    })),
  }));

  return { ...payload, rows, promos, stores, months, sourceLabel };
}

export async function load({ preferLive = true } = {}) {
  state.loading = true;
  state.error = null;

  // COBA DARI ADMIN PANEL DULU
  const adminData = await loadFromAdmin();
  if (adminData) {
    apply(normalise(adminData, 'Admin Panel Adni81'));
    state.loading = false;
    return state;
  }

  const cfg = await readConfig();
  const liveUrl = cfg.sheet_url;

  if (preferLive && liveUrl) {
    try {
      const res = await fetch(`${liveUrl}${liveUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
      const text = await res.text();
      if (/^\s*</.test(text)) {
        throw new Error('Sheet membalas halaman login Google — setel "Who has access" ke Anyone.');
      }
      const payload = JSON.parse(text);
      if (payload.ok === false) throw new Error(payload.message || 'Sheet menolak permintaan.');
      apply(normalise(payload, 'Google Sheet (live)'));
      state.loading = false;
      return state;
    } catch (err) {
      state.error = `Gagal menarik dari Google Sheet: ${err.message}`;
    }
  }

  try {
    const res = await fetch(`${LOCAL_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`reports.json tidak ditemukan (${res.status})`);
    apply(normalise(await res.json(), liveUrl ? 'Data tersimpan (fallback)' : 'Data tersimpan'));
  } catch (err) {
    state.error = state.error ? `${state.error} · ${err.message}` : err.message;
  }

  state.loading = false;
  return state;
}

function apply(payload) {
  state.raw = payload;
  state.rows = payload.rows;
  state.promos = payload.promos || [];
  state.stores = payload.stores;
  state.months = payload.months;
  state.sourceLabel = payload.sourceLabel;
  if (!state.month || !state.months.includes(state.month)) {
    state.month = state.months[state.months.length - 1] || null;
  }
}

// ================================================================
// AGREGASI (SAMA SEPERTI SEBELUMNYA)
// ================================================================

export const monthKey = (r) => `${r.year}-${String(r.month).padStart(2, '0')}`;

const dowOf = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

export function selectRows(opts = {}) {
  const store = opts.store !== undefined ? opts.store : state.store;
  const byStore = (r) => store === 'ALL' || r.store === store;

  if (opts.month !== undefined) {
    return state.rows.filter((r) => byStore(r) && (!opts.month || monthKey(r) === opts.month));
  }

  const { from, to } = activeRange();
  return state.rows.filter((r) => {
    if (!byStore(r)) return false;
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (state.dowFilter != null && dowOf(r.date) !== state.dowFilter) return false;
    return true;
  });
}

const SUM_FIELDS = [
  'deposit_count', 'deposit_amount', 'withdrawal_count', 'withdrawal_amount',
  'ftd', 'member_win', 'net_turnover', 'profit',
];

export function totals(rows) {
  const reported = rows.filter((r) => r.reported);
  const out = { days: reported.length, dates: new Set(reported.map((r) => r.date)).size };
  for (const f of SUM_FIELDS) {
    out[f] = reported.reduce((a, r) => a + (Number(r[f]) || 0), 0);
  }
  out.net_cashflow = out.deposit_amount - out.withdrawal_amount;
  out.hold_rate = out.net_turnover ? (out.profit / out.net_turnover) * 100 : null;
  out.margin_deposit = out.deposit_amount ? (out.profit / out.deposit_amount) * 100 : null;
  out.wd_ratio = out.deposit_amount ? (out.withdrawal_amount / out.deposit_amount) * 100 : null;
  out.avg_deposit = out.deposit_count ? out.deposit_amount / out.deposit_count : null;
  out.avg_withdrawal = out.withdrawal_count ? out.withdrawal_amount / out.withdrawal_count : null;

  const d = out.dates;
  out.per_day = {};
  for (const f of SUM_FIELDS) out.per_day[f] = d ? out[f] / d : null;
  out.per_day.net_cashflow = d ? out.net_cashflow / d : null;

  return out;
}

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function dailySeries(opts = {}) {
  const rows = selectRows(opts);
  const byDate = new Map();
  for (const r of rows) {
    if (!r.reported) continue;
    const cur = byDate.get(r.date) || { date: r.date, day: r.day, reported: true };
    for (const f of SUM_FIELDS) cur[f] = (cur[f] || 0) + (Number(r[f]) || 0);
    byDate.set(r.date, cur);
  }

  let from;
  let to;
  if (opts.month !== undefined && opts.month) {
    const [y, m] = opts.month.split('-').map(Number);
    from = `${opts.month}-01`;
    to = `${opts.month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  } else {
    ({ from, to } = activeRange());
  }
  if (!from || !to) return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (state.dowFilter != null && dowOf(d) !== state.dowFilter) continue;
    out.push(byDate.get(d) || { date: d, day: Number(d.slice(8)), reported: false });
  }
  return out;
}

export function byStore(opts = {}) {
  return state.stores.map((store) => ({
    store,
    ...totals(selectRows({ ...opts, store })),
  }));
}

export function previousRange() {
  const { from, to } = activeRange();
  if (!from || !to) return null;
  const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  return { from: addDays(from, -span), to: addDays(from, -1), span };
}

export function previousTotals() {
  const prev = previousRange();
  if (!prev) return null;
  const rows = state.rows.filter((r) => {
    if (state.store !== 'ALL' && r.store !== state.store) return false;
    if (r.date < prev.from || r.date > prev.to) return false;
    if (state.dowFilter != null && dowOf(r.date) !== state.dowFilter) return false;
    return true;
  });
  return { ...totals(rows), from: prev.from, to: prev.to };
}

export function monthlySeries({ store = state.store } = {}) {
  return state.months.map((m) => ({
    month: m,
    ...totals(selectRows({ store, month: m })),
  }));
}

export function previousMonth(month = state.month) {
  const i = state.months.indexOf(month);
  return i > 0 ? state.months[i - 1] : null;
}

export function delta(now, before) {
  const out = {};
  for (const k of Object.keys(now)) {
    const a = now[k];
    const b = before ? before[k] : null;
    out[k] = (typeof a === 'number' && typeof b === 'number' && b !== 0)
      ? ((a - b) / Math.abs(b)) * 100
      : null;
  }
  return out;
}

export function byDayOfWeek() {
  const { from, to } = activeRange();
  const rows = state.rows.filter((r) => {
    if (state.store !== 'ALL' && r.store !== state.store) return false;
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    return r.reported;
  });

  const buckets = Array.from({ length: 7 }, (_, i) => ({ dow: i, dates: new Set(), rows: [] }));
  for (const r of rows) {
    const b = buckets[dowOf(r.date)];
    b.rows.push(r);
    b.dates.add(r.date);
  }

  return buckets.map((b) => {
    const t = totals(b.rows);
    const days = b.dates.size || 1;
    return {
      dow: b.dow,
      days: b.dates.size,
      deposit_amount: t.deposit_amount / days,
      withdrawal_amount: t.withdrawal_amount / days,
      profit: t.profit / days,
      net_turnover: t.net_turnover / days,
      ftd: t.ftd / days,
      deposit_count: t.deposit_count / days,
    };
  });
}

// ================================================================
// CATATAN
// ================================================================

const ISSUE_WORDS = [
  'BONUS', 'GG WEB', 'WEB', 'QRIS', 'LINK ILANG', 'LINK.LIST', 'LINK LIST',
  'IPOS', 'MAINTENANCE', 'ERROR', 'DOWN', 'SLOW', 'GANGGUAN', 'DEPO', 'WD',
];

export const isIssue = (tag) => {
  const t = tag.toUpperCase();
  return ISSUE_WORDS.some((w) => t === w || t.includes(w));
};

export function remarkSummary(opts = {}) {
  const rows = selectRows(opts);
  const issues = new Map();
  const members = new Map();

  for (const r of rows) {
    for (const tag of r.remarks) {
      const bucket = isIssue(tag) ? issues : members;
      const key = isIssue(tag) ? tag.toUpperCase() : tag;
      const cur = bucket.get(key) || { tag: key, count: 0, days: new Set(), stores: new Set(), profitOnDays: 0 };
      cur.count += 1;
      cur.days.add(r.day);
      cur.stores.add(r.store);
      cur.profitOnDays += Number(r.profit) || 0;
      bucket.set(key, cur);
    }
  }

  const shape = (m) => [...m.values()]
    .map((x) => ({ ...x, days: [...x.days].sort((a, b) => a - b), stores: [...x.stores] }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return { issues: shape(issues), members: shape(members) };
}

export function losingDays(opts = {}) {
  return selectRows(opts)
    .filter((r) => r.reported && Number(r.profit) < 0)
    .sort((a, b) => a.profit - b.profit);
}

// ================================================================
// PROMO
// ================================================================

export function activeMonths() {
  const { from, to } = activeRange();
  if (!from || !to) return state.month ? [state.month] : [];
  const out = [];
  let cur = from.slice(0, 7);
  const last = to.slice(0, 7);
  for (let i = 0; i < 240 && cur <= last; i += 1) {
    out.push(cur);
    const [y, m] = cur.split('-').map(Number);
    cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  return out;
}

export function promosFor(opts = {}) {
  const store = opts.store !== undefined ? opts.store : state.store;
  const months = new Set(opts.months || activeMonths());
  return state.promos
    .filter((p) => (store === 'ALL' || p.store === store) && months.has(p.month_key))
    .map((p) => {
      const winners = [...p.winners].sort((a, b) => (b.bonus_amount || 0) - (a.bonus_amount || 0));
      return {
        ...p,
        winners,
        bonus_total: winners.reduce((a, w) => a + (Number(w.bonus_amount) || 0), 0),
        turnover_total: winners.reduce((a, w) => a + (Number(w.net_turnover) || 0), 0),
        profit_total: winners.reduce((a, w) => a + (Number(w.profit) || 0), 0),
      };
    })
    .sort((a, b) =>
      a.month_key.localeCompare(b.month_key) ||
      a.store.localeCompare(b.store) ||
      a.promo.localeCompare(b.promo));
}

export function promoTotals(blocks = promosFor()) {
  const users = new Set();
  let bonus = 0;
  let turnover = 0;
  let profit = 0;
  let unpriced = 0;
  for (const b of blocks) {
    for (const w of b.winners) {
      users.add(w.user.toLowerCase());
      bonus += Number(w.bonus_amount) || 0;
      turnover += Number(w.net_turnover) || 0;
      profit += Number(w.profit) || 0;
      if (w.bonus_amount == null) unpriced += 1;
    }
  }
  const winners = blocks.reduce((n, b) => n + b.winners.length, 0);
  return {
    blocks: blocks.length,
    winners,
    unique_users: users.size,
    bonus,
    turnover,
    profit,
    unpriced,
    payout_rate: profit > 0 ? (bonus / profit) * 100 : null,
  };
}

export function repeatWinners(blocks = promosFor()) {
  const map = new Map();
  for (const b of blocks) {
    for (const w of b.winners) {
      const key = w.user.toLowerCase();
      const cur = map.get(key) || { user: w.user, wins: 0, bonus: 0, stores: new Set(), promos: new Set() };
      cur.wins += 1;
      cur.bonus += Number(w.bonus_amount) || 0;
      cur.stores.add(b.store);
      cur.promos.add(b.promo);
      map.set(key, cur);
    }
  }
  return [...map.values()]
    .map((x) => ({ ...x, stores: [...x.stores], promos: [...x.promos] }))
    .filter((x) => x.wins > 1)
    .sort((a, b) => b.wins - a.wins || b.bonus - a.bonus);
}