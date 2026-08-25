import * as D from './data.js';
import * as fmt from './format.js';
import * as charts from './charts.js';
import { esc, qs, on, icon, emptyState, toast, countUp } from './ui.js';

/** Pemformat yang boleh dipakai animasi hitung-naik lewat `data-fmt`. */
const COUNT_FMT = { rp: fmt.rp, count: fmt.count };

const view = qs('#view');
const controls = qs('#controls');

let tab = 'harian';
// Tabel "Per Toko" bisa menampilkan jumlah atau rata-rata per hari.
let tokoMode = 'total';

/* ---------------------------------------------------------------- */
/* kontrol atas                                                      */
/* ---------------------------------------------------------------- */

const MODES = [['bulan', 'Bulan'], ['rentang', 'Rentang'], ['hari', 'Satu Hari']];
const DOW_LABEL = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function renderControls() {
  const s = D.state;
  const b = D.bounds();

  controls.innerHTML = `
    <div class="field">
      <span class="field-label">Toko</span>
      <div class="store-pills" id="f-store">
        <button class="store-pill ${s.store === 'ALL' ? 'active' : ''}" data-store="ALL" data-pick="ALL">
          <span class="swatch"></span>SEMUA
        </button>
        ${s.stores.map((n) => `
          <button class="store-pill ${s.store === n ? 'active' : ''}" data-store="${esc(n)}" data-pick="${esc(n)}" title="${esc(n)}">
            <span class="swatch"></span>${esc(fmt.storeShort(n))}
          </button>`).join('')}
      </div>
    </div>

    <div class="field">
      <span class="field-label">Periode</span>
      <div class="segmented" id="f-mode">
        ${MODES.map(([k, label]) => `<button data-mode="${k}" class="${s.mode === k ? 'active' : ''}">${esc(label)}</button>`).join('')}
      </div>
    </div>

    ${s.mode === 'bulan' ? `
      <div class="field">
        <span class="field-label">Pilih bulan</span>
        <select class="control" id="f-month">
          ${s.months.map((m) => `<option value="${esc(m)}" ${s.month === m ? 'selected' : ''}>${esc(fmt.monthLong(m))}</option>`).join('')}
        </select>
      </div>` : ''}

    ${s.mode === 'rentang' ? `
      <div class="field">
        <span class="field-label">Dari — sampai</span>
        <div class="field-row">
          <input type="date" class="control" id="f-from" value="${esc(s.from || '')}" min="${esc(b.min || '')}" max="${esc(b.max || '')}">
          <span class="dim">—</span>
          <input type="date" class="control" id="f-to" value="${esc(s.to || '')}" min="${esc(b.min || '')}" max="${esc(b.max || '')}">
        </div>
      </div>
      <div class="field">
        <span class="field-label">Cepat</span>
        <div class="segmented" id="f-quick">
          <button data-quick="7">7 hari</button>
          <button data-quick="14">14 hari</button>
          <button data-quick="30">30 hari</button>
          <button data-quick="90">90 hari</button>
        </div>
      </div>` : ''}

    ${s.mode === 'hari' ? `
      <div class="field">
        <span class="field-label">Tanggal</span>
        <div class="field-row">
          <button class="btn btn-icon" id="f-prev" title="Hari terisi sebelumnya">‹</button>
          <input type="date" class="control" id="f-day" value="${esc(s.day || '')}" min="${esc(b.min || '')}" max="${esc(b.max || '')}">
          <button class="btn btn-icon" id="f-next" title="Hari terisi berikutnya">›</button>
          <button class="btn btn-sm" id="f-today" title="Lompat ke tanggal terisi terakhir">Terakhir</button>
        </div>
      </div>` : ''}

    ${s.mode !== 'hari' ? `
      <div class="field">
        <span class="field-label">Hari</span>
        <select class="control" id="f-dow">
          <option value="">Semua hari</option>
          ${DOW_LABEL.map((d, i) => `<option value="${i}" ${s.dowFilter === i ? 'selected' : ''}>${esc(d)} saja</option>`).join('')}
        </select>
      </div>` : ''}

    <div class="refresh-meta">
      <b>${s.raw ? esc(fmt.stamp(s.raw.generated_at)) : '—'}</b>
      ${esc(s.sourceLabel || 'memuat…')}
    </div>
    <button class="btn btn-primary" id="btn-refresh" ${s.loading ? 'disabled' : ''}>
      ${icon('refresh', s.loading ? 'ico spin' : 'ico')} ${s.loading ? 'Menarik…' : 'Refresh Data'}
    </button>`;

  wireControls();
}

function wireControls() {
  const s = D.state;
  const b = D.bounds();
  const redraw = () => { renderControls(); render(); };

  on(qs('#f-store'), 'click', 'button[data-pick]', (_e, el) => {
    s.store = el.dataset.pick;
    // Tanggal yang dipilih bisa jadi kosong untuk toko yang baru dipilih.
    if (s.mode === 'hari' && s.day && !D.hasData(s.day)) {
      s.day = D.lastFilledDate({ from: null, to: null }) || s.day;
    }
    redraw();
  });

  on(qs('#f-mode'), 'click', 'button[data-mode]', (_e, el) => {
    const range = D.activeRange();
    s.mode = el.dataset.mode;

    // Nilai awal harus jatuh pada tanggal yang benar-benar punya data,
    // bukan akhir bulan kalender yang mungkin masih kosong.
    if (s.mode === 'rentang' && (!s.from || !s.to)) {
      s.from = range.from;
      s.to = range.to && b.max && range.to > b.max ? b.max : range.to;
    }
    if (s.mode === 'hari') {
      s.dowFilter = null;
      if (!s.day) s.day = D.lastFilledDate(range) || b.max;
    }
    redraw();
  });

  const month = qs('#f-month');
  if (month) month.addEventListener('change', (e) => { s.month = e.target.value; render(); });

  const from = qs('#f-from');
  const to = qs('#f-to');
  if (from) from.addEventListener('change', (e) => { s.from = e.target.value; if (s.to && s.from > s.to) s.to = s.from; redraw(); });
  if (to) to.addEventListener('change', (e) => { s.to = e.target.value; if (s.from && s.to < s.from) s.from = s.to; redraw(); });

  const quick = qs('#f-quick');
  if (quick) on(quick, 'click', 'button[data-quick]', (_e, el) => {
    const n = Number(el.dataset.quick);
    const end = b.max;
    const start = new Date(`${end}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - (n - 1));
    s.to = end;
    s.from = start.toISOString().slice(0, 10);
    if (b.min && s.from < b.min) s.from = b.min;
    redraw();
  });

  const day = qs('#f-day');
  if (day) day.addEventListener('change', (e) => { s.day = e.target.value; render(); });

  // Lompat ke tanggal berisi berikutnya, lewati yang kosong.
  const step = (n) => {
    if (!s.day) return;
    let cur = s.day;
    for (let i = 0; i < 400; i += 1) {
      const d = new Date(`${cur}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      cur = d.toISOString().slice(0, 10);
      if (b.min && cur < b.min) return;
      if (b.max && cur > b.max) return;
      if (D.hasData(cur)) { s.day = cur; redraw(); return; }
    }
  };
  const prevBtn = qs('#f-prev');
  const nextBtn = qs('#f-next');
  const lastBtn = qs('#f-today');
  if (prevBtn) prevBtn.addEventListener('click', () => step(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => step(1));
  if (lastBtn) lastBtn.addEventListener('click', () => {
    const last = D.lastFilledDate({ from: null, to: null });
    if (last) { s.day = last; redraw(); }
  });

  const dow = qs('#f-dow');
  if (dow) dow.addEventListener('change', (e) => {
    s.dowFilter = e.target.value === '' ? null : Number(e.target.value);
    render();
  });

  qs('#btn-refresh').addEventListener('click', refresh);
}

async function refresh() {
  D.state.loading = true;
  renderControls();
  const before = D.state.rows.length;
  await D.load({ preferLive: true });
  renderControls();
  render();
  if (D.state.error) toast('Sebagian gagal', D.state.error, 'warn');
  else toast('Data diperbarui', `${D.state.rows.length} baris dari ${D.state.sourceLabel}${before ? '' : ''}`, 'ok');
}

/* ---------------------------------------------------------------- */
/* render                                                            */
/* ---------------------------------------------------------------- */

const TABS = [
  ['harian', 'Harian'],
  ['toko', 'Per Toko'],
  ['promo', 'Promo & Bonus'],
  ['tren', 'Tren Bulanan'],
  ['catatan', 'Catatan & Masalah'],
];

function render() {
  charts.destroyAll();
  const s = D.state;

  if (!s.rows.length) {
    view.innerHTML = `
      ${s.error ? banner('err', 'Data tidak bisa dimuat', s.error) : ''}
      <div class="card"><div class="card-body">${emptyState('Belum ada data.', 'Jalankan tools/parse-export.js atau pasang URL Apps Script di data/config.json.')}</div></div>`;
    return;
  }

  const rows = D.selectRows();
  const t = D.totals(rows);
  const prev = D.previousTotals();
  const dl = D.delta(t, prev);
  const cmpLabel = prev && prev.days
    ? `vs ${fmt.dateShort(prev.from)}–${fmt.dateShort(prev.to)}`
    : '';

  view.innerHTML = `
    ${s.error ? banner('warn', 'Memakai data tersimpan', s.error) : ''}
    ${plateBar()}
    ${heroRow(t, dl, cmpLabel)}
    <div class="tabs" id="tabs">
      ${TABS.map(([k, label]) => `<button data-tab="${k}" class="${tab === k ? 'active' : ''}">${esc(label)}</button>`).join('')}
    </div>
    <div id="tabview" data-stagger></div>`;

  on(qs('#tabs'), 'click', 'button[data-tab]', (_e, el) => { tab = el.dataset.tab; render(); });
  const clearDow = qs('#clear-dow');
  if (clearDow) clearDow.addEventListener('click', () => { D.state.dowFilter = null; renderControls(); render(); });
  renderTab();
  updateFoot();
  // Dijalankan setelah tab tergambar supaya angka di dalamnya ikut terhitung.
  countUp(view, COUNT_FMT);
}

function renderTab() {
  const host = qs('#tabview');
  if (tab === 'harian') return renderHarian(host);
  if (tab === 'toko') return renderToko(host);
  if (tab === 'promo') return renderPromo(host);
  if (tab === 'tren') return renderTren(host);
  return renderCatatan(host);
}

function banner(kind, title, body) {
  return `
    <div class="banner ${kind}">
      ${icon(kind === 'err' || kind === 'warn' ? 'alert' : 'check')}
      <div><b>${esc(title)}</b>${body ? `<div class="banner-body">${esc(body)}</div>` : ''}</div>
    </div>`;
}

/**
 * Padanan baris judul berwarna di sheet. Saat satu toko dipilih, pita ini
 * memakai warna pelat toko itu persis seperti di sheet-nya.
 */
function plateBar() {
  const s = D.state;
  const all = s.store === 'ALL';
  const label = all ? 'SEMUA TOKO' : s.store;
  const series = D.dailySeries();
  const expected = series.length;
  // Dengan "semua toko", satu tanggal punya beberapa baris — hitung tanggalnya.
  const filled = series.filter((d) => d.reported).length;
  const complete = expected > 0 && filled >= expected;

  return `
    <div class="plate-bar" data-store="${esc(s.store)}">
      <div class="pb-main">
        <span class="pb-mark">${esc(all ? 'ALL' : fmt.storeShort(s.store))}</span>
        <div>
          <div class="pb-title">${esc(label)}</div>
          <div class="pb-sub">
            ${esc(D.periodLabel(fmt))} · Performance Report: Transaksi &amp; Win/Lose${s.dowFilter != null ? ` · hanya hari ${esc(DOW_LABEL[s.dowFilter])}` : ''}
          </div>
        </div>
      </div>
      <div class="pb-right">
        ${s.dowFilter != null ? '<button class="btn btn-sm" id="clear-dow">Semua hari</button>' : ''}
        <span class="badge ${complete ? 'ok' : 'warn'}"><span class="dot"></span>${filled}${expected ? `/${expected}` : ''} hari terisi</span>
        ${all ? `<span class="badge mute">${s.stores.length} toko</span>` : ''}
      </div>
    </div>`;
}

/* ---------------------------------------------------------------- */
/* hero                                                              */
/* ---------------------------------------------------------------- */

function heroTile({ group, iconName, label, value, raw, rawFmt, sub, avg, delta, deltaLabel, invert, neg }) {
  const count = raw != null && fmt.isNum(raw)
    ? ` data-num="${esc(raw)}" data-fmt="${esc(rawFmt || 'rp')}"`
    : '';
  return `
    <div class="hero-tile" data-group="${group}" title="${esc(sub || '')}">
      <div class="hero-head"><span class="chip">${icon(iconName)}</span>${esc(label)}</div>
      <div class="hero-value ${neg ? 'neg' : ''}"${count}>${esc(value)}</div>
      ${sub ? `<div class="hero-sub">${esc(sub)}</div>` : ''}
      ${avg ? `<div class="hero-avg"><b>${esc(avg.value)}</b> ${esc(avg.unit)}</div>` : ''}
      ${fmt.isNum(delta) ? `<div class="hero-foot">
        <span class="delta ${deltaCls(delta, invert)}">${fmt.arrow(delta)} ${esc(fmt.signedPercent(delta))}</span>
        <span class="muted" style="font-size:11.5px">${esc(deltaLabel || '')}</span>
      </div>` : ''}
    </div>`;
}

function deltaCls(v, invert) {
  const c = fmt.deltaClass(v);
  if (c === 'flat') return c;
  return invert ? (c === 'up' ? 'down' : 'up') : c;
}

function heroRow(t, dl, cmp) {
  const p = t.per_day;
  // Satu hari: rata-rata identik dengan totalnya, jadi keping itu disembunyikan.
  const perDay = t.dates > 1;
  const chip = (value) => (perDay ? { value, unit: '/ hari' } : null);
  return `
    <div class="hero-row" data-stagger>
      ${heroTile({
        group: 'DEPOSIT', iconName: 'arrow-in', label: 'Deposit Masuk',
        value: fmt.rp(t.deposit_amount), raw: t.deposit_amount,
        sub: `${fmt.count(t.deposit_count)} transaksi · ${fmt.rp(t.avg_deposit)} per transaksi`,
        avg: chip(`${fmt.rp(p.deposit_amount)} · ${fmt.count(p.deposit_count)} trx`),
        delta: dl.deposit_amount, deltaLabel: cmp,
      })}
      ${heroTile({
        group: 'WITHDRAWAL', iconName: 'arrow-out', label: 'Withdrawal Keluar',
        value: fmt.rp(t.withdrawal_amount), raw: t.withdrawal_amount,
        sub: `${fmt.count(t.withdrawal_count)} transaksi · ${fmt.percent(t.wd_ratio)} dari deposit`,
        avg: chip(`${fmt.rp(p.withdrawal_amount)} · ${fmt.count(p.withdrawal_count)} trx`),
        delta: dl.withdrawal_amount, deltaLabel: cmp, invert: true,
      })}
      ${heroTile({
        group: 'FINANCIAL', iconName: 'wallet', label: 'Profit (Win/Lose)',
        value: fmt.rp(t.profit), raw: t.profit,
        sub: `hold ${fmt.percent(t.hold_rate)} dari turnover`,
        avg: chip(fmt.rp(p.profit)),
        delta: dl.profit, deltaLabel: cmp, neg: t.profit < 0,
      })}
      ${heroTile({
        group: 'PLAYERS', iconName: 'chart', label: 'Net Turnover',
        value: fmt.rp(t.net_turnover), raw: t.net_turnover,
        sub: `${fmt.count(t.ftd)} FTD di periode ini`,
        avg: chip(`${fmt.rp(p.net_turnover)} · ${fmt.count(p.ftd)} FTD`),
        delta: dl.net_turnover, deltaLabel: cmp,
      })}
    </div>`;
}

/* ---------------------------------------------------------------- */
/* tab: harian                                                       */
/* ---------------------------------------------------------------- */

function renderHarian(host) {
  // Satu hari tidak punya deret untuk digambar — tampilkan rinciannya saja.
  if (D.state.mode === 'hari') return renderSatuHari(host);

  const series = D.dailySeries();

  host.innerHTML = `
    <div class="grid g-2" style="align-items:start" data-stagger>
      <div class="card">
        <div class="card-head"><div>
          <div class="card-title">Deposit vs Withdrawal</div>
          <div class="card-desc">Per hari · selisihnya net cashflow</div>
        </div></div>
        <div class="card-body"><div class="chart-box"><canvas id="c-flow"></canvas></div></div>
      </div>
      <div class="card">
        <div class="card-head"><div>
          <div class="card-title">Profit harian</div>
          <div class="card-desc">Batang merah = toko kalah hari itu</div>
        </div></div>
        <div class="card-body"><div class="chart-box"><canvas id="c-profit"></canvas></div></div>
      </div>
    </div>

    ${avgCard()}

    ${dowCard()}

    <div class="card">
      <div class="card-head"><div>
        <div class="card-title">Tabel harian</div>
        <div class="card-desc">${series.filter((d) => d.reported).length} hari terisi · sesuai kolom sheet Anda · klik baris untuk fokus ke tanggal itu</div>
      </div></div>
      <div class="card-body flush">${dailyTable(series)}</div>
    </div>`;

  on(host, 'click', 'tr[data-date]', (_e, el) => {
    D.state.mode = 'hari';
    D.state.day = el.dataset.date;
    D.state.dowFilter = null;
    renderControls();
    render();
  });

  on(host, 'click', '[data-dow]', (_e, el) => {
    const v = Number(el.dataset.dow);
    D.state.dowFilter = D.state.dowFilter === v ? null : v;
    renderControls();
    render();
  });

  // Nomor tanggal cukup untuk satu bulan; rentang lintas bulan perlu "5 Mei".
  const spansMonths = new Set(series.map((d) => (d.date || '').slice(0, 7))).size > 1;
  const labels = series.map((d) => (spansMonths ? fmt.dateShort(d.date) : String(d.day)));
  const val = (d, f) => (d.reported ? d[f] : null);

  charts.draw('c-flow', {
    type: 'bar', labels, kind: 'money',
    datasets: [
      { label: 'Deposit', data: series.map((d) => val(d, 'deposit_amount')), color: () => cssGroup('--g-deposit') },
      { label: 'Withdrawal', data: series.map((d) => val(d, 'withdrawal_amount')), color: () => cssGroup('--g-withdrawal') },
    ],
  });

  const profit = series.map((d) => val(d, 'profit'));
  charts.draw('c-profit', {
    type: 'bar', labels, kind: 'money', hideLegend: true,
    datasets: [{
      label: 'Profit',
      data: profit,
      // Warna per batang diberikan langsung, bukan disuntik setelah gambar —
      // update susulan akan memotong animasi masuknya.
      color: () => barColors(profit),
    }],
    optionsPatch(opts) {
      opts.scales.y.beginAtZero = true;
    },
  });
}

/** Merah saat toko kalah hari itu, emas saat menang. */
function barColors(values) {
  const pos = cssGroup('--g-financial');
  const neg = cssGroup('--neg');
  return values.map((v) => (v != null && v < 0 ? neg : pos));
}

/**
 * Rata-rata per hari kalender untuk periode aktif.
 *
 * Ini padanan langsung baris TOTAL di sheet: di sana kolom harian memang
 * dirata-ratakan, bukan dijumlahkan. Jadi angka di kartu ini bisa dibandingkan
 * lurus dengan baris TOTAL toko yang bersangkutan.
 */
function avgCard() {
  const t = D.totals(D.selectRows());
  if (!t.dates) return '';
  const p = t.per_day;
  const s = D.state;

  const cell = (group, label, value, raw, sub, kind = 'rp', cls = '') => `
    <div class="avg-cell" data-group="${group}">
      <span class="avg-label">${esc(label)}</span>
      <span class="avg-value ${cls}" data-num="${esc(raw)}" data-fmt="${kind}">${esc(value)}</span>
      <span class="avg-sub">${esc(sub)}</span>
    </div>`;

  return `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Rata-rata per hari</div>
          <div class="card-desc">
            ${esc(D.periodLabel(fmt))} · dibagi ${t.dates} hari terisi${s.store === 'ALL' ? ' · gabungan 3 toko' : ''}
          </div>
        </div>
        <div class="right">
          <span class="badge mute">sama dengan baris TOTAL di sheet</span>
        </div>
      </div>
      <div class="card-body">
        <div class="avg-grid" data-stagger>
          ${cell('DEPOSIT', 'Deposit', fmt.rp(p.deposit_amount), p.deposit_amount, `${fmt.count(p.deposit_count)} transaksi / hari`)}
          ${cell('WITHDRAWAL', 'Withdrawal', fmt.rp(p.withdrawal_amount), p.withdrawal_amount, `${fmt.count(p.withdrawal_count)} transaksi / hari`)}
          ${cell('DEPOSIT', 'Net Cashflow', fmt.rp(p.net_cashflow), p.net_cashflow, 'deposit − withdrawal', 'rp', p.net_cashflow < 0 ? 'neg' : '')}
          ${cell('PLAYERS', 'FTD', fmt.count(p.ftd), p.ftd, 'member baru / hari', 'count')}
          ${cell('FINANCIAL', 'Profit', fmt.rp(p.profit), p.profit, `hold ${fmt.percent(t.hold_rate)}`, 'rp', p.profit < 0 ? 'neg' : '')}
          ${cell('FINANCIAL', 'Net Turnover', fmt.rp(p.net_turnover), p.net_turnover, 'taruhan bersih / hari')}
        </div>
      </div>
    </div>`;
}

/* ---------------------------------------------------------------- */
/* tab harian → mode satu hari                                       */
/* ---------------------------------------------------------------- */

/**
 * Satu tanggal, dirinci per toko. Ini tampilan "cek harian" yang sebenarnya:
 * angka besar, satu kartu per toko dengan warna pelatnya, dan catatan hari itu
 * ikut ditampilkan karena di situlah masalah operasional tercatat.
 */
function renderSatuHari(host) {
  const day = D.state.day;
  const rows = D.selectRows().filter((r) => r.reported);
  const prev = D.previousTotals();

  if (!rows.length) {
    host.innerHTML = `<div class="card"><div class="card-body">${emptyState(
      `${fmt.dateLong(day)} belum ada isinya.`,
      'Pakai panah ‹ › untuk lompat ke tanggal terisi terdekat, atau tekan Terakhir.')}</div></div>`;
    return;
  }

  const byStore = D.state.stores
    .map((store) => ({ store, row: rows.find((r) => r.store === store) }))
    .filter((x) => x.row);

  host.innerHTML = `
    <div class="day-grid" data-stagger>
      ${byStore.map(({ store, row }) => dayCard(store, row)).join('')}
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Sekitar tanggal ini</div>
          <div class="card-desc">7 hari terakhir sampai ${esc(fmt.dateLong(day))} · klik batang mana pun untuk pindah ke hari itu</div>
        </div>
        <div class="right">
          ${prev && prev.days ? `<span class="badge mute">pembanding: ${esc(fmt.dateShort(prev.from))}</span>` : ''}
        </div>
      </div>
      <div class="card-body"><div class="chart-box"><canvas id="c-around"></canvas></div></div>
    </div>`;

  on(host, 'click', '[data-pick-store]', (_e, el) => {
    // Klik kartu toko = fokus ke toko itu; klik lagi kembali ke semua.
    const pick = el.dataset.pickStore;
    D.state.store = D.state.store === pick ? 'ALL' : pick;
    renderControls();
    render();
  });

  // Konteks tujuh hari: satu hari sendirian tidak memberi tahu apa-apa.
  const dates = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const pick = (ymd, field) => {
    const hit = D.state.rows.filter((r) =>
      r.reported && r.date === ymd && (D.state.store === 'ALL' || r.store === D.state.store));
    return hit.length ? hit.reduce((a, r) => a + (Number(r[field]) || 0), 0) : null;
  };

  charts.draw('c-around', {
    type: 'bar',
    labels: dates.map((d) => `${fmt.dateShort(d)} ${fmt.dow(d)}`),
    kind: 'money',
    datasets: [
      { label: 'Deposit', data: dates.map((d) => pick(d, 'deposit_amount')), color: () => cssGroup('--g-deposit') },
      { label: 'Withdrawal', data: dates.map((d) => pick(d, 'withdrawal_amount')), color: () => cssGroup('--g-withdrawal') },
      { label: 'Profit', type: 'line', data: dates.map((d) => pick(d, 'profit')), color: () => cssGroup('--g-financial'), fill: false },
    ],
  });
}

function dayCard(store, r) {
  const hold = r.net_turnover ? (r.profit / r.net_turnover) * 100 : null;
  const line = (group, label, sub, value, cls = '') => `
    <div class="dr" data-group="${group}">
      <span class="dr-label">${esc(label)}${sub ? `<span class="dr-sub">${esc(sub)}</span>` : ''}</span>
      <span class="dr-val ${cls}">${esc(value)}</span>
    </div>`;

  return `
    <div class="day-card" data-store="${esc(store)}" data-pick-store="${esc(store)}" title="Klik untuk lihat ${esc(store)} saja">
      <div class="day-card-head">
        <span class="dc-name">${esc(store)}</span>
        <span class="dc-profit ${r.profit < 0 ? 'loss' : ''}">${esc(fmt.rp(r.profit))}</span>
      </div>
      <div class="day-rows">
        ${line('DEPOSIT', 'Deposit', `${fmt.count(r.deposit_count)} trx`, fmt.rp(r.deposit_amount))}
        ${line('WITHDRAWAL', 'Withdrawal', `${fmt.count(r.withdrawal_count)} trx`, fmt.rp(r.withdrawal_amount))}
        ${line('PLAYERS', 'FTD', 'member baru', fmt.count(r.ftd))}
        ${line('FINANCIAL', 'Turnover', hold == null ? '' : `hold ${fmt.percent(hold)}`, fmt.rp(r.net_turnover))}
      </div>
      ${r.remarks.length ? `<div class="day-remark"><b>Catatan:</b> ${esc(r.remarks.join(', '))}</div>` : ''}
    </div>`;
}

/** Rata-rata per hari-dalam-seminggu. Klik untuk menyaring ke hari itu saja. */
function dowCard() {
  const rows = D.byDayOfWeek().filter((d) => d.days > 0);
  if (rows.length < 2) return '';
  const best = rows.reduce((a, b) => (b.profit > a.profit ? b : a));
  const worst = rows.reduce((a, b) => (b.profit < a.profit ? b : a));
  const max = Math.max(...rows.map((d) => Math.abs(d.profit)), 1);

  return `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Performa per hari</div>
          <div class="card-desc">Rata-rata profit per hari · klik untuk menyaring</div>
        </div>
        <div class="right">
          <span class="badge ok">Terbaik ${esc(DOW_LABEL[best.dow])}</span>
          <span class="badge ${worst.profit < 0 ? 'err' : 'mute'}">Terlemah ${esc(DOW_LABEL[worst.dow])}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="dow-grid" data-stagger>
          ${rows.map((d) => `
            <button class="dow-cell${D.state.dowFilter === d.dow ? ' active' : ''}" data-dow="${d.dow}">
              <span class="dow-name">${esc(DOW_LABEL[d.dow])}</span>
              <span class="dow-bar"><i style="height:${Math.max(4, (Math.abs(d.profit) / max) * 100).toFixed(0)}%;background:${d.profit < 0 ? 'var(--neg)' : 'var(--g-financial)'}"></i></span>
              <span class="dow-val ${d.profit < 0 ? 'neg' : ''}">${esc(fmt.rp(d.profit))}</span>
              <span class="dow-sub">${d.days} hari</span>
            </button>`).join('')}
        </div>
      </div>
    </div>`;
}

function cssGroup(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Satu baris kaki tabel harian. Dipakai dua kali: TOTAL (jumlah) dan
 * RATA-RATA (per hari kalender) — yang kedua adalah padanan langsung baris
 * TOTAL di sheet, karena di sana kolom harian memang dirata-ratakan.
 * `hold` selalu dihitung ulang dari profit ÷ turnover, bukan dirata-ratakan.
 */
function totalRow(label, v, cls = '') {
  const hold = v.net_turnover ? (v.profit / v.net_turnover) * 100 : null;
  return `
    <tr class="${cls}">
      <td>${label}</td>
      <td class="num edge-l" data-group="DEPOSIT">${esc(fmt.count(v.deposit_count))}</td>
      <td class="num edge-r" data-group="DEPOSIT" title="${esc(fmt.rpFull(v.deposit_amount))}">${esc(fmt.rp(v.deposit_amount))}</td>
      <td class="num edge-l" data-group="WITHDRAWAL">${esc(fmt.count(v.withdrawal_count))}</td>
      <td class="num edge-r" data-group="WITHDRAWAL" title="${esc(fmt.rpFull(v.withdrawal_amount))}">${esc(fmt.rp(v.withdrawal_amount))}</td>
      <td class="num edge-l edge-r" data-group="PLAYERS">${esc(fmt.count(v.ftd))}</td>
      <td class="num edge-l ${v.profit < 0 ? 'neg' : ''}" data-group="FINANCIAL" title="${esc(fmt.rpFull(v.profit))}">${esc(fmt.rp(v.profit))}</td>
      <td class="num" data-group="FINANCIAL" title="${esc(fmt.rpFull(v.net_turnover))}">${esc(fmt.rp(v.net_turnover))}</td>
      <td class="num edge-r" data-group="FINANCIAL">${esc(fmt.percent(hold))}</td>
    </tr>`;
}

function dailyTable(series) {
  const withData = series.filter((d) => d.reported);
  if (!withData.length) {
    return emptyState(
      `Belum ada data untuk ${D.periodLabel(fmt)}.`,
      'Pilih tanggal atau bulan lain, atau isi dulu sheet-nya lalu tekan Refresh Data.');
  }
  const t = D.totals(D.selectRows());

  return `
    <div class="table-wrap" style="max-height:520px;overflow-y:auto">
      <table class="data">
        <thead>
          <tr class="group-row">
            <th class="spacer"></th>
            <th colspan="2" data-group="DEPOSIT">Deposit</th>
            <th colspan="2" data-group="WITHDRAWAL">Withdrawal</th>
            <th data-group="PLAYERS">Player</th>
            <th colspan="3" data-group="FINANCIAL">Win / Lose</th>
          </tr>
          <tr class="head-row">
            <th>Tgl</th>
            <th class="num edge-l" data-group="DEPOSIT">Trx</th>
            <th class="num edge-r" data-group="DEPOSIT">Nominal</th>
            <th class="num edge-l" data-group="WITHDRAWAL">Trx</th>
            <th class="num edge-r" data-group="WITHDRAWAL">Nominal</th>
            <th class="num edge-l edge-r" data-group="PLAYERS">FTD</th>
            <th class="num edge-l" data-group="FINANCIAL">Profit</th>
            <th class="num" data-group="FINANCIAL">Turnover</th>
            <th class="num edge-r" data-group="FINANCIAL">Hold</th>
          </tr>
        </thead>
        <tbody>
          ${series.map((d) => {
            const label = `${esc(fmt.dateShort(d.date))} <span class="muted" style="font-weight:400">${esc(fmt.dow(d.date))}</span>`;
            if (!d.reported) {
              return `<tr class="ghost"><td class="strong">${label}</td><td colspan="8" class="muted">belum diisi</td></tr>`;
            }
            const hold = d.net_turnover ? (d.profit / d.net_turnover) * 100 : null;
            return `
              <tr class="clickable" data-date="${esc(d.date)}">
                <td class="strong">${label}</td>
                <td class="num edge-l" data-group="DEPOSIT">${esc(fmt.count(d.deposit_count))}</td>
                <td class="num edge-r" data-group="DEPOSIT" title="${esc(fmt.rpFull(d.deposit_amount))}">${esc(fmt.rp(d.deposit_amount))}</td>
                <td class="num edge-l" data-group="WITHDRAWAL">${esc(fmt.count(d.withdrawal_count))}</td>
                <td class="num edge-r" data-group="WITHDRAWAL" title="${esc(fmt.rpFull(d.withdrawal_amount))}">${esc(fmt.rp(d.withdrawal_amount))}</td>
                <td class="num edge-l edge-r" data-group="PLAYERS">${esc(fmt.count(d.ftd))}</td>
                <td class="num edge-l strong ${d.profit < 0 ? 'neg' : ''}" data-group="FINANCIAL" title="${esc(fmt.rpFull(d.profit))}">${esc(fmt.rp(d.profit))}</td>
                <td class="num" data-group="FINANCIAL" title="${esc(fmt.rpFull(d.net_turnover))}">${esc(fmt.rp(d.net_turnover))}</td>
                <td class="num edge-r muted" data-group="FINANCIAL">${esc(fmt.percent(hold))}</td>
              </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          ${totalRow('TOTAL', t)}
          ${totalRow(`RATA-RATA <span class="foot-note">${t.dates} hari</span>`, t.per_day, 'avg-row')}
        </tfoot>
      </table>
    </div>`;
}

/* ---------------------------------------------------------------- */
/* tab: per toko                                                     */
/* ---------------------------------------------------------------- */

/** Baris kaki tabel Per Toko — kolomnya sama, plus kolom "Hari" di depan. */
function storeFootRow(label, base, v, dates) {
  const hold = base.net_turnover ? (base.profit / base.net_turnover) * 100 : null;
  return `
    <tr>
      <td>${esc(label)}</td>
      <td class="num muted">${dates}</td>
      <td class="num edge-l" data-group="DEPOSIT">${esc(fmt.count(v.deposit_count))}</td>
      <td class="num edge-r" data-group="DEPOSIT" title="${esc(fmt.rpFull(v.deposit_amount))}">${esc(fmt.rp(v.deposit_amount))}</td>
      <td class="num edge-l" data-group="WITHDRAWAL">${esc(fmt.count(v.withdrawal_count))}</td>
      <td class="num edge-r" data-group="WITHDRAWAL" title="${esc(fmt.rpFull(v.withdrawal_amount))}">${esc(fmt.rp(v.withdrawal_amount))}</td>
      <td class="num edge-l edge-r" data-group="PLAYERS">${esc(fmt.count(v.ftd))}</td>
      <td class="num edge-l ${v.profit < 0 ? 'neg' : ''}" data-group="FINANCIAL" title="${esc(fmt.rpFull(v.profit))}">${esc(fmt.rp(v.profit))}</td>
      <td class="num" data-group="FINANCIAL" title="${esc(fmt.rpFull(v.net_turnover))}">${esc(fmt.rp(v.net_turnover))}</td>
      <td class="num edge-r" data-group="FINANCIAL">${esc(fmt.percent(hold))}</td>
    </tr>`;
}

function renderToko(host) {
  const rows = D.byStore().filter((r) => r.days > 0);
  if (!rows.length) { host.innerHTML = `<div class="card"><div class="card-body">${emptyState('Belum ada data toko di bulan ini.')}</div></div>`; return; }

  const maxProfit = Math.max(...rows.map((r) => Math.abs(r.profit)), 1);
  // Tiap toko punya jumlah hari terisi sendiri, jadi rata-ratanya dibagi
  // dengan hari toko itu — bukan dengan hari gabungan.
  const avg = tokoMode === 'avg';
  const shown = rows.map((r) => ({ ...r, ...(avg ? r.per_day : {}) }));
  // Baris kaki memakai hari KALENDER gabungan, bukan jumlah hari ketiga toko.
  const all = D.totals(D.selectRows({ store: 'ALL' }));

  host.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Perbandingan toko</div>
          <div class="card-desc">${esc(D.periodLabel(fmt))} · ${avg ? 'rata-rata per hari terisi tiap toko' : 'jumlah seluruh periode'}</div>
        </div>
        <div class="right">
          <div class="segmented" id="toko-mode">
            <button data-tmode="total" class="${avg ? '' : 'active'}">Total</button>
            <button data-tmode="avg" class="${avg ? 'active' : ''}">Rata-rata / hari</button>
          </div>
        </div>
      </div>
      <div class="card-body flush">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr class="group-row">
                <th class="spacer" colspan="2"></th>
                <th colspan="2" data-group="DEPOSIT">Deposit</th>
                <th colspan="2" data-group="WITHDRAWAL">Withdrawal</th>
                <th data-group="PLAYERS">Player</th>
                <th colspan="3" data-group="FINANCIAL">Win / Lose</th>
              </tr>
              <tr class="head-row">
                <th>Toko</th><th class="num">Hari</th>
                <th class="num edge-l" data-group="DEPOSIT">Trx</th>
                <th class="num edge-r" data-group="DEPOSIT">Nominal</th>
                <th class="num edge-l" data-group="WITHDRAWAL">Trx</th>
                <th class="num edge-r" data-group="WITHDRAWAL">Nominal</th>
                <th class="num edge-l edge-r" data-group="PLAYERS">FTD</th>
                <th class="num edge-l" data-group="FINANCIAL">Profit</th>
                <th class="num" data-group="FINANCIAL">Turnover</th>
                <th class="num edge-r" data-group="FINANCIAL">Hold</th>
              </tr>
            </thead>
            <tbody>
              ${shown.map((r) => `
                <tr class="clickable" data-store="${esc(r.store)}">
                  <td><span class="store-cell" data-store="${esc(r.store)}"><span class="store-mark">${esc(fmt.storeShort(r.store))}</span>${esc(r.store)}</span></td>
                  <td class="num muted">${r.dates}</td>
                  <td class="num edge-l" data-group="DEPOSIT">${esc(fmt.count(r.deposit_count))}</td>
                  <td class="num edge-r" data-group="DEPOSIT" title="${esc(fmt.rpFull(r.deposit_amount))}">${esc(fmt.rp(r.deposit_amount))}</td>
                  <td class="num edge-l" data-group="WITHDRAWAL">${esc(fmt.count(r.withdrawal_count))}</td>
                  <td class="num edge-r" data-group="WITHDRAWAL" title="${esc(fmt.rpFull(r.withdrawal_amount))}">${esc(fmt.rp(r.withdrawal_amount))}</td>
                  <td class="num edge-l edge-r" data-group="PLAYERS">${esc(fmt.count(r.ftd))}</td>
                  <td class="num edge-l strong ${r.profit < 0 ? 'neg' : ''}" data-group="FINANCIAL" title="${esc(fmt.rpFull(r.profit))}">${esc(fmt.rp(r.profit))}</td>
                  <td class="num" data-group="FINANCIAL" title="${esc(fmt.rpFull(r.net_turnover))}">${esc(fmt.rp(r.net_turnover))}</td>
                  <td class="num edge-r muted" data-group="FINANCIAL">${esc(fmt.percent(r.hold_rate))}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              ${storeFootRow(avg ? 'RATA-RATA / HARI' : 'SEMUA TOKO', all, avg ? all.per_day : all, all.dates)}
            </tfoot>
          </table>
        </div>
      </div>
    </div>

    <div class="grid g-2" style="align-items:start" data-stagger>
      <div class="card">
        <div class="card-head"><div><div class="card-title">Kontribusi profit</div><div class="card-desc">${esc(D.periodLabel(fmt))}</div></div></div>
        <div class="card-body">
          ${rows.slice().sort((a, b) => b.profit - a.profit).map((r, i) => `
            <div class="rank-row">
              <span class="rank-no">${i + 1}</span>
              <span class="rank-name" style="min-width:110px">${esc(r.store)}</span>
              <span class="rank-bar"><i style="width:${Math.max(2, (Math.abs(r.profit) / maxProfit) * 100).toFixed(1)}%;background:${fmt.storeColor(r.store)}"></i></span>
              <span class="rank-val ${r.profit < 0 ? 'neg' : ''}">${esc(fmt.rp(r.profit))}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><div class="card-title">Profit harian per toko</div><div class="card-desc">${esc(D.periodLabel(fmt))}</div></div></div>
        <div class="card-body"><div class="chart-box"><canvas id="c-store-daily"></canvas></div></div>
      </div>
    </div>`;

  // render() penuh, bukan renderTab(), supaya #tabview dibuat ulang dan
  // pendengar klik tidak menumpuk di elemen yang sama.
  on(qs('#toko-mode'), 'click', 'button[data-tmode]', (_e, el) => {
    tokoMode = el.dataset.tmode;
    render();
  });

  on(host, 'click', 'tr[data-store]', (_e, el) => {
    D.state.store = el.dataset.store;
    tab = 'harian';
    renderControls();
    render();
  });

  const dates = D.dailySeries({ store: 'ALL' }).map((d) => d.date);
  const spansMonths = new Set(dates.map((d) => (d || '').slice(0, 7))).size > 1;
  charts.draw('c-store-daily', {
    type: 'line',
    labels: dates.map((d) => (spansMonths ? fmt.dateShort(d) : String(Number(d.slice(8))))),
    kind: 'money',
    datasets: D.state.stores.map((store, i) => {
      const series = D.dailySeries({ store });
      const map = new Map(series.map((d) => [d.date, d.reported ? d.profit : null]));
      return {
        label: store,
        data: dates.map((d) => (map.has(d) ? map.get(d) : null)),
        color: fmt.storeColor(store, i),
        fill: false,
      };
    }),
  });
}

/* ---------------------------------------------------------------- */
/* tab: promo & bonus                                                */
/* ---------------------------------------------------------------- */

/**
 * Tabel LUCKY SPIN / BULANAN … di sisi kanan sheet. Isinya rekap BULANAN, jadi
 * apa pun mode periodenya, yang ditampilkan adalah bulan-bulan yang tersentuh.
 */
function renderPromo(host) {
  const blocks = D.promosFor();
  const t = D.promoTotals(blocks);
  const months = D.activeMonths();
  const repeats = D.repeatWinners(blocks);

  if (!blocks.length) {
    host.innerHTML = `
      <div class="card"><div class="card-body">${emptyState(
        'Belum ada pemenang promo di periode ini.',
        'Tabel LUCKY SPIN dan BULANAN di sheet masih kosong untuk bulan yang dipilih.')}</div></div>`;
    return;
  }

  const scope = months.length > 1
    ? `${fmt.monthLong(months[0])} – ${fmt.monthLong(months[months.length - 1])}`
    : fmt.monthLong(months[0]);

  host.innerHTML = `
    <div class="hero-row" data-stagger>
      ${heroTile({
        group: 'PROMO', iconName: 'gift', label: 'Bonus Dibayar',
        value: fmt.rp(t.bonus), raw: t.bonus,
        sub: `${t.winners} pemenang di ${t.blocks} tabel promo`,
      })}
      ${heroTile({
        group: 'PLAYERS', iconName: 'users', label: 'Member Unik',
        value: fmt.count(t.unique_users), raw: t.unique_users, rawFmt: 'count',
        sub: repeats.length ? `${repeats.length} menang lebih dari sekali` : 'semua menang sekali',
      })}
      ${heroTile({
        group: 'FINANCIAL', iconName: 'coins', label: 'Turnover Pemenang',
        value: fmt.rp(t.turnover), raw: t.turnover,
        sub: 'total taruhan bersih para pemenang',
      })}
      ${heroTile({
        group: 'DEPOSIT', iconName: 'chart', label: 'Profit dari Pemenang',
        value: fmt.rp(t.profit), raw: t.profit,
        sub: payoutNote(t),
        neg: t.profit < 0,
      })}
    </div>

    ${t.unpriced ? banner('warn', `${t.unpriced} pemenang tanpa nominal bonus`,
      'Kolom Bonus di sheet berisi aturan seperti "BONUS 10%", bukan angka — jadi tidak ikut dijumlahkan.') : ''}

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Pemenang per promo</div>
          <div class="card-desc">${esc(scope)} · diurutkan dari bonus terbesar</div>
        </div>
        <div class="right"><span class="badge mute">${blocks.length} tabel</span></div>
      </div>
      <div class="card-body">
        <div class="promo-grid" data-stagger>${blocks.map(promoCard).join('')}</div>
      </div>
    </div>

    ${repeats.length ? `
      <div class="panel" data-group="PROMO">
        <div class="panel-head">
          <span class="chip">${icon('trophy')}</span>
          <span class="panel-title">Menang berulang</span>
          <span class="panel-note">${repeats.length} member</span>
        </div>
        <div class="card-body flush">
          <ul class="mlist">
            ${repeats.slice(0, 16).map((x) => `
              <li>
                <span class="bullet"></span>
                <span class="m-label">${esc(x.user)}</span>
                <span class="m-value">${x.wins}×</span>
                <span class="m-extra">${esc(fmt.rp(x.bonus))} · ${esc(x.promos.join(', '))}</span>
              </li>`).join('')}
          </ul>
        </div>
      </div>` : ''}`;
}

/**
 * Membandingkan bonus yang keluar dengan profit yang dihasilkan pemenangnya.
 * Persen di atas 100% jadi sulit dibaca, jadi di situ dipakai kelipatan.
 */
function payoutNote(t) {
  if (t.profit <= 0) return 'pemenang justru menang bersih — bonus murni biaya';
  const ratio = t.bonus / t.profit;
  if (!Number.isFinite(ratio) || ratio <= 0) return 'Member Win dibalik tandanya';
  return ratio > 1
    ? `bonus ${fmt.percent(ratio, ratio > 10 ? 0 : 1).replace('%', '')}× lipat dari profit ini`
    : `bonus ${fmt.percent(ratio * 100)} dari profit ini`;
}

function promoCard(b) {
  const bonusCell = (w) => {
    if (w.bonus_amount != null) return `<b>${esc(fmt.rp(w.bonus_amount))}</b>`;
    if (w.bonus_label) return `<span class="tag">${esc(w.bonus_label)}</span>`;
    return '<span class="dim">—</span>';
  };

  return `
    <div class="promo-card" data-store="${esc(b.store)}">
      <div class="promo-head">
        <span class="ico-wrap">${icon('gift')}</span>
        <span class="ph-text">
          <span class="ph-name">${esc(b.promo)}</span>
          <span class="ph-sub">${esc(fmt.storeShort(b.store))} · ${esc(fmt.monthLong(b.month_key))}</span>
        </span>
        <span class="ph-total">
          <b>${esc(fmt.rp(b.bonus_total))}</b>
          <span>${b.winners.length} pemenang</span>
        </span>
      </div>
      <ul class="promo-list">
        ${b.winners.map((w, i) => `
          <li>
            <span class="pw-rank">${i + 1}</span>
            <span>
              <span class="pw-user">${esc(w.user)}</span>
              <span class="pw-meta">TO ${esc(fmt.rp(w.net_turnover))} · W/L ${esc(fmt.rp(w.profit))}</span>
            </span>
            <span class="pw-bonus">${bonusCell(w)}</span>
          </li>`).join('')}
      </ul>
    </div>`;
}

/* ---------------------------------------------------------------- */
/* tab: tren bulanan                                                 */
/* ---------------------------------------------------------------- */

function renderTren(host) {
  const series = D.monthlySeries();
  const year = D.totals(D.state.rows.filter((r) =>
    D.state.store === 'ALL' || r.store === D.state.store));
  const months = series.filter((m) => m.dates > 0).length;

  host.innerHTML = `
    <div class="card">
      <div class="card-head"><div>
        <div class="card-title">Tren sepanjang tahun</div>
        <div class="card-desc">${esc(D.state.store === 'ALL' ? 'Gabungan semua toko' : D.state.store)} · ${series.length} bulan</div>
      </div></div>
      <div class="card-body"><div class="chart-box lg"><canvas id="c-monthly"></canvas></div></div>
    </div>

    <div class="card">
      <div class="card-head"><div>
        <div class="card-title">Rekap bulanan</div>
        <div class="card-desc">Kolom "Per hari" dibagi jumlah hari terisi bulan itu · klik baris untuk membuka bulannya</div>
      </div></div>
      <div class="card-body flush">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr class="group-row">
                <th class="spacer" colspan="2"></th>
                <th colspan="2" data-group="DEPOSIT">Deposit</th>
                <th colspan="2" data-group="WITHDRAWAL">Withdrawal</th>
                <th data-group="PLAYERS">Player</th>
                <th colspan="3" data-group="FINANCIAL">Win / Lose</th>
              </tr>
              <tr class="head-row">
                <th>Bulan</th><th class="num">Hari</th>
                <th class="num edge-l" data-group="DEPOSIT">Nominal</th>
                <th class="num edge-r" data-group="DEPOSIT">Per hari</th>
                <th class="num edge-l" data-group="WITHDRAWAL">Nominal</th>
                <th class="num edge-r" data-group="WITHDRAWAL">Per hari</th>
                <th class="num edge-l edge-r" data-group="PLAYERS">FTD</th>
                <th class="num edge-l" data-group="FINANCIAL">Profit</th>
                <th class="num" data-group="FINANCIAL">Per hari</th>
                <th class="num edge-r" data-group="FINANCIAL">Hold</th>
              </tr>
            </thead>
            <tbody>
              ${series.map((m) => `
                <tr class="clickable ${m.month === D.state.month ? 'active-row' : ''}" data-month="${esc(m.month)}">
                  <td class="strong">${esc(fmt.monthLong(m.month))}</td>
                  <td class="num muted">${m.dates}</td>
                  <td class="num edge-l" data-group="DEPOSIT" title="${esc(fmt.rpFull(m.deposit_amount))}">${esc(fmt.rp(m.deposit_amount))}</td>
                  <td class="num edge-r muted" data-group="DEPOSIT" title="${esc(fmt.rpFull(m.per_day.deposit_amount))}">${esc(fmt.rp(m.per_day.deposit_amount))}</td>
                  <td class="num edge-l" data-group="WITHDRAWAL" title="${esc(fmt.rpFull(m.withdrawal_amount))}">${esc(fmt.rp(m.withdrawal_amount))}</td>
                  <td class="num edge-r muted" data-group="WITHDRAWAL" title="${esc(fmt.rpFull(m.per_day.withdrawal_amount))}">${esc(fmt.rp(m.per_day.withdrawal_amount))}</td>
                  <td class="num edge-l edge-r" data-group="PLAYERS">${esc(fmt.count(m.ftd))}</td>
                  <td class="num edge-l strong ${m.profit < 0 ? 'neg' : ''}" data-group="FINANCIAL" title="${esc(fmt.rpFull(m.profit))}">${esc(fmt.rp(m.profit))}</td>
                  <td class="num muted ${m.per_day.profit < 0 ? 'neg' : ''}" data-group="FINANCIAL" title="${esc(fmt.rpFull(m.per_day.profit))}">${esc(fmt.rp(m.per_day.profit))}</td>
                  <td class="num edge-r muted" data-group="FINANCIAL">${esc(fmt.percent(m.hold_rate))}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td>SETAHUN <span class="foot-note">${months} bulan</span></td>
                <td class="num muted">${year.dates}</td>
                <td class="num edge-l" data-group="DEPOSIT" title="${esc(fmt.rpFull(year.deposit_amount))}">${esc(fmt.rp(year.deposit_amount))}</td>
                <td class="num edge-r muted" data-group="DEPOSIT" title="${esc(fmt.rpFull(year.per_day.deposit_amount))}">${esc(fmt.rp(year.per_day.deposit_amount))}</td>
                <td class="num edge-l" data-group="WITHDRAWAL" title="${esc(fmt.rpFull(year.withdrawal_amount))}">${esc(fmt.rp(year.withdrawal_amount))}</td>
                <td class="num edge-r muted" data-group="WITHDRAWAL" title="${esc(fmt.rpFull(year.per_day.withdrawal_amount))}">${esc(fmt.rp(year.per_day.withdrawal_amount))}</td>
                <td class="num edge-l edge-r" data-group="PLAYERS">${esc(fmt.count(year.ftd))}</td>
                <td class="num edge-l ${year.profit < 0 ? 'neg' : ''}" data-group="FINANCIAL" title="${esc(fmt.rpFull(year.profit))}">${esc(fmt.rp(year.profit))}</td>
                <td class="num muted ${year.per_day.profit < 0 ? 'neg' : ''}" data-group="FINANCIAL" title="${esc(fmt.rpFull(year.per_day.profit))}">${esc(fmt.rp(year.per_day.profit))}</td>
                <td class="num edge-r" data-group="FINANCIAL">${esc(fmt.percent(year.hold_rate))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>`;

  on(host, 'click', 'tr[data-month]', (_e, el) => {
    D.state.month = el.dataset.month;
    renderControls();
    render();
  });

  charts.draw('c-monthly', {
    type: 'bar',
    labels: series.map((m) => fmt.monthShort(m.month)),
    kind: 'money',
    datasets: [
      { label: 'Deposit', data: series.map((m) => m.deposit_amount), color: () => cssGroup('--g-deposit') },
      { label: 'Withdrawal', data: series.map((m) => m.withdrawal_amount), color: () => cssGroup('--g-withdrawal') },
      { label: 'Profit', type: 'line', data: series.map((m) => m.profit), color: () => cssGroup('--g-financial'), fill: false },
    ],
  });
}

/* ---------------------------------------------------------------- */
/* tab: catatan & masalah                                            */
/* ---------------------------------------------------------------- */

function renderCatatan(host) {
  const { issues, members } = D.remarkSummary();
  const losing = D.losingDays();

  host.innerHTML = `
    <div class="grid g-2" style="align-items:start" data-stagger>
      <div class="panel" data-group="WITHDRAWAL">
        <div class="panel-head">
          <span class="chip">${icon('bug')}</span>
          <span class="panel-title">Gangguan tercatat</span>
          <span class="panel-note">${issues.length} jenis</span>
        </div>
        <div class="card-body flush">
          ${issues.length ? `<ul class="mlist">
            ${issues.map((x) => `
              <li>
                <span class="bullet"></span>
                <span class="m-label">${esc(x.tag)}</span>
                <span class="m-value">${x.count}×</span>
                <span class="m-extra">tgl ${esc(x.days.slice(0, 6).join(', '))}${x.days.length > 6 ? '…' : ''}</span>
              </li>`).join('')}
          </ul>` : emptyState('Tidak ada gangguan tercatat bulan ini.')}
        </div>
      </div>

      <div class="panel" data-group="PLAYERS">
        <div class="panel-head">
          <span class="chip">${icon('trophy')}</span>
          <span class="panel-title">Member sering disebut</span>
          <span class="panel-note">${members.length} nama</span>
        </div>
        <div class="card-body flush">
          ${members.length ? `<ul class="mlist">
            ${members.slice(0, 14).map((x) => `
              <li>
                <span class="bullet${x.count > 1 ? '' : ' hollow'}"></span>
                <span class="m-label">${esc(x.tag)}</span>
                <span class="m-value">${x.count}×</span>
                <span class="m-extra">${esc(x.stores.join(', '))}</span>
              </li>`).join('')}
          </ul>` : emptyState('Tidak ada nama member dicatat bulan ini.')}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div>
        <div class="card-title">Hari toko kalah</div>
        <div class="card-desc">Profit negatif — member menang lebih besar dari pendapatan</div>
      </div>
      <div class="right"><span class="badge ${losing.length ? 'warn' : 'ok'}">${losing.length} hari</span></div>
      </div>
      <div class="card-body flush">
        ${losing.length ? `
          <div class="table-wrap">
            <table class="data">
              <thead><tr>
                <th>Tanggal</th><th>Toko</th>
                <th class="num">Profit</th><th class="num">Turnover</th>
                <th class="num">Deposit</th><th class="num">Withdrawal</th><th>Catatan</th>
              </tr></thead>
              <tbody>
                ${losing.map((r) => `
                  <tr>
                    <td class="strong">${esc(fmt.dateLong(r.date))} <span class="muted" style="font-weight:400">${esc(fmt.dow(r.date))}</span></td>
                    <td><span class="store-cell" data-store="${esc(r.store)}"><span class="store-mark">${esc(fmt.storeShort(r.store))}</span>${esc(r.store)}</span></td>
                    <td class="num strong neg" title="${esc(fmt.rpFull(r.profit))}">${esc(fmt.rp(r.profit))}</td>
                    <td class="num" title="${esc(fmt.rpFull(r.net_turnover))}">${esc(fmt.rp(r.net_turnover))}</td>
                    <td class="num" title="${esc(fmt.rpFull(r.deposit_amount))}">${esc(fmt.rp(r.deposit_amount))}</td>
                    <td class="num" title="${esc(fmt.rpFull(r.withdrawal_amount))}">${esc(fmt.rp(r.withdrawal_amount))}</td>
                    <td class="muted" style="white-space:normal;max-width:280px">${esc(r.remarks.join(', ') || '—')}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : emptyState('Tidak ada hari kalah bulan ini.', 'Semua hari menghasilkan profit positif.')}
      </div>
    </div>`;
}

/* ---------------------------------------------------------------- */
/* boot                                                              */
/* ---------------------------------------------------------------- */

function updateFoot() {
  const s = D.state;
  qs('#foot-source').textContent = s.raw
    ? `${s.sourceLabel} · ${s.rows.length} baris · ${s.months.length} bulan · diperbarui ${fmt.stamp(s.raw.generated_at)}`
    : '—';
}

(async function boot() {
  renderControls();
  await D.load({ preferLive: true });
  renderControls();
  render();
})();
