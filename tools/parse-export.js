'use strict';

/**
 * Converts the "Perform Overview" Google Sheets HTML exports into one clean
 * JSON file the dashboard can read.
 *
 *   node tools/parse-export.js <folder-with-html> [outfile]
 *
 * Each monthly export is a single <table> holding three store sections stacked
 * vertically. A section is one header row plus everything under it:
 *
 *   ┌ title ─────────────────────────────┬ LUCKY SPIN ─┬ BULANAN … ─┐
 *   │ TGL Deposit Successful … Turnover  │ User ID …   │ User ID …  │  ← header
 *   │ 1 … 31                             │ winners     │ winners    │
 *   │ TOTAL                              │             │            │
 *   └────────────────────────────────────┴─────────────┴────────────┘
 *
 * The left block is the daily report; every block to the right is a monthly
 * promo leaderboard. Their column positions drift between months, so both are
 * located by header text rather than by fixed offsets.
 */

const fs = require('node:fs');
const path = require('node:path');

/* ---------------------------------------------------------------- */
/* html → grid                                                       */
/* ---------------------------------------------------------------- */

function stripTags(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/​/g, '') // Sheets pads empty promo cells with ZWSP
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Expands colspan so every row is indexed by true spreadsheet column.
 * Without this a merged title cell shifts everything to its right.
 */
function toGrid(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) => {
    const row = [];
    for (const cell of tr[1].matchAll(/<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/g)) {
      const span = Number(/colspan\s*=\s*"?(\d+)/i.exec(cell[1])?.[1] || 1);
      row.push(stripTags(cell[2]));
      for (let i = 1; i < span; i += 1) row.push('');
    }
    return row;
  });
}

/* ---------------------------------------------------------------- */
/* value coercion                                                    */
/* ---------------------------------------------------------------- */

/** "1,142,533" → 1142533 · "-168,514" → -168514 · "" / "-" → null */
function num(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === '' || s === '-' || s === '·') return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  s = s.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, juni: 6,
  jul: 7, july: 7, juli: 7, aug: 8, agu: 8, sep: 9, oct: 10, okt: 10,
  nov: 11, dec: 12, des: 12,
};

/**
 * Accepts "01–31 Aug 2026", "01-31-Aug-2026.html", "01–30 Juni 2026".
 * Takes the LAST month-year pair so a trailing end-date wins over a start date.
 */
function parsePeriod(text) {
  const s = String(text || '');
  const matches = [...s.matchAll(/([A-Za-z]{3,4})[a-z]*[\s-]+(\d{4})/g)];
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const month = MONTHS[matches[i][1].toLowerCase()];
    if (month) return { year: Number(matches[i][2]), month };
  }
  return null;
}

/** Split "young, BONUS, IPOS" into tidy tags. */
function parseRemarks(raw) {
  const s = String(raw || '').trim();
  if (!s || s === '-' || s === '·') return [];
  return s.split(/[,;]+/).map((x) => x.trim()).filter((x) => x && x !== '-');
}

/** Bonus is usually rupiah but sometimes a rule like "BONUS 10%". */
function parseBonus(raw) {
  const s = String(raw || '').trim();
  if (!s || s === '-') return { bonus_amount: null, bonus_label: null };
  const n = num(s);
  return n == null ? { bonus_amount: null, bonus_label: s } : { bonus_amount: n, bonus_label: null };
}

/* ---------------------------------------------------------------- */
/* section detection                                                 */
/* ---------------------------------------------------------------- */

const TITLE_RE = /Performance Report:\s*Transaksi\s*&\s*Win\/Lose\s+(.+)$/i;
const PROMO_RE = /^(LUCKY SPIN|BULANAN[A-Z\s]*)/i;

/** Daily columns, as offsets from the "TGL" cell. */
const COLS = {
  day: 0,
  deposit_count: 1,
  deposit_amount: 2,
  withdrawal_count: 3,
  withdrawal_amount: 4,
  ftd: 5,
  remark: 6,
  member_win: 7,
  net_turnover: 8,
};

/**
 * The four promos the sheet runs. Title cells are messy — dates are appended,
 * and a stale merge sometimes leaves two names in one cell ("BULANAN
 * SPEKTAKULER LUCKY SPIN 01-Jun-2026 …"). The leftmost known name wins.
 */
const PROMO_NAMES = ['BULANAN CASINO TO', 'BULANAN PALING CUAN', 'BULANAN SPEKTAKULER', 'LUCKY SPIN'];

function promoName(raw) {
  const s = String(raw || '').toUpperCase();
  let best = null;
  for (const name of PROMO_NAMES) {
    const at = s.indexOf(name);
    if (at >= 0 && (best === null || at < best.at)) best = { at, name };
  }
  return best ? best.name : null;
}

const headerAnchor = (cells) => {
  const idx = cells.findIndex((c) => /^TGL$/i.test(String(c || '').trim()));
  if (idx < 0) return -1;
  const joined = cells.join('|').toUpperCase();
  return joined.includes('DEPOSIT') && joined.includes('WITHDRAWAL') ? idx : -1;
};

/** Footer rows carry the canonical store order: "… – SLG | SE8 | MANJA". */
function storeOrder(grid) {
  for (const cells of grid) {
    for (const cell of cells) {
      const m = /Performance Report\s*[–-]\s*(.+)$/i.exec(cell || '');
      if (!m) continue;
      const names = m[1].split('|').map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (names.length >= 2) return names;
    }
  }
  return [];
}

/**
 * Locates the promo blocks to the right of the daily table.
 *
 * The header row cannot be trusted here: Sheets drops the empty header cells
 * above the status ("DONE") columns, so every block after the first is shifted
 * one column left in the header while the data rows stay correct. Blocks are
 * therefore detected from the data — a User ID column is one whose values are
 * mostly text and whose next column is mostly numeric. That also rules out the
 * status columns, which are text followed by more text.
 *
 * Titles are matched to blocks left-to-right rather than by column, because
 * Sheets also drops empty leading cells in some data rows, so the same
 * spreadsheet column can land at different indices in the title row and the
 * rows beneath it. A block with no title left is returned nameless and gets its
 * name from the same slot in another month.
 */
function promoBlocks(grid, headerRow, endRow, tglCol) {
  const first = tglCol + COLS.net_turnover + 1;
  const width = Math.max(...grid.slice(headerRow, endRow).map((r) => r.length), 0);

  const cell = (r, c) => String((grid[r] || [])[c] || '').trim();
  const tally = (c) => {
    let text = 0;
    let numeric = 0;
    for (let r = headerRow + 1; r < endRow; r += 1) {
      const v = cell(r, c);
      if (!v || v === '-') continue;
      if (num(v) == null) text += 1; else numeric += 1;
    }
    return { text, numeric };
  };

  const starts = [];
  for (let c = first; c < width - 1; c += 1) {
    if (starts.length && c < starts[starts.length - 1] + 4) continue;
    const here = tally(c);
    const next = tally(c + 1);
    if (here.text >= 1 && next.numeric >= 1 && next.numeric >= here.text * 0.5) starts.push(c);
  }
  if (!starts.length) return [];

  const titles = [];
  for (let r = Math.max(0, headerRow - 4); r < headerRow; r += 1) {
    (grid[r] || []).forEach((v, c) => {
      if (c >= first && PROMO_RE.test(String(v || '').trim())) titles.push({ c, v: String(v) });
    });
  }
  titles.sort((a, b) => a.c - b.c);

  return starts.map((col, i) => ({ col, name: promoName(titles[i] ? titles[i].v : '') }));
}

/**
 * Sections are anchored on the header row, not the title, because a title is
 * sometimes missing (Feb 2026 lost SLOTGEMBIRA's). The store name is read from
 * the title above when present, otherwise inferred from the footer's order.
 */
function findSections(grid) {
  const order = storeOrder(grid);
  const sections = [];

  for (let r = 0; r < grid.length; r += 1) {
    const tglCol = headerAnchor(grid[r]);
    if (tglCol < 0) continue;

    let store = null;
    let periodText = '';
    for (let back = r; back >= Math.max(0, r - 4); back -= 1) {
      let found = false;
      for (const cell of grid[back]) {
        const m = TITLE_RE.exec(cell || '');
        if (!m) continue;
        const [storePart, ...rest] = m[1].split('|');
        store = storePart.trim().toUpperCase();
        periodText = rest.join('|').trim();
        found = true;
        break;
      }
      if (found) break;
    }

    const inferred = !store;
    if (inferred) store = order[sections.length] || null;
    if (!store) continue;

    sections.push({ headerRow: r, tglCol, store, periodText, inferred });
  }

  return sections;
}

/* ---------------------------------------------------------------- */
/* one file → records                                                */
/* ---------------------------------------------------------------- */

function parseFile(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const grid = toGrid(html);
  const sections = findSections(grid);
  const out = {
    file: path.basename(filePath),
    // Urutan toko menurut sheet ("… – SLG | SE8 | MANJA"), bukan alfabetis.
    order: storeOrder(grid),
    stores: [],
    rows: [],
    promos: [],
    warnings: [],
  };

  if (!sections.length) {
    out.warnings.push('Tidak ada blok "Performance Report" ditemukan.');
    return out;
  }

  sections.forEach((sec, i) => {
    const { headerRow, tglCol } = sec;
    const at = (cells, key) => cells[tglCol + COLS[key]];

    // A section ends at the next section's *title*, not its header row. The
    // rows in between carry the next store's banner and promo titles, and
    // those would otherwise be read as data — a promo title sitting in a
    // User ID column looks exactly like a winner.
    const limit = i + 1 < sections.length ? sections[i + 1].headerRow : grid.length;
    let end = limit;
    for (let r = headerRow + 1; r < limit; r += 1) {
      const banner = (grid[r] || []).some((v) => {
        const s = String(v || '').trim();
        return /Performance Report/i.test(s) || PROMO_RE.test(s);
      });
      if (banner) { end = r; break; }
    }

    if (sec.inferred) {
      out.warnings.push(`${sec.store}: baris judul hilang di sheet — nama toko disimpulkan dari urutan.`);
    }

    // The filename is the most reliable period source; the in-sheet text is
    // sometimes stale (e.g. a July sheet still saying "01-Jun-2026").
    const period = parsePeriod(out.file) || parsePeriod(sec.periodText);
    if (!period) {
      out.warnings.push(`${sec.store}: periode tidak terbaca dari "${sec.periodText}" / "${out.file}".`);
      return;
    }
    const fromSheet = parsePeriod(sec.periodText);
    if (fromSheet && (fromSheet.year !== period.year || fromSheet.month !== period.month)) {
      out.warnings.push(
        `${sec.store}: judul sheet tertulis "${sec.periodText}" tetapi nama file menunjuk ` +
        `${period.year}-${String(period.month).padStart(2, '0')} — nama file yang dipakai.`
      );
    }

    const ym = { year: period.year, month: period.month };
    const blocks = promoBlocks(grid, headerRow, end, tglCol);
    const winners = blocks.map(() => []);
    const strays = [];

    let days = 0;
    let total = null;

    for (let r = headerRow + 1; r < end; r += 1) {
      const cells = grid[r];

      // Promo rows are independent of the daily rows — a leaderboard can run
      // longer or shorter than the calendar block beside it.
      blocks.forEach((b, bi) => {
        const user = String(cells[b.col] || '').trim();
        if (!user || /^user\s*id$/i.test(user) || user === '-') return;
        const { bonus_amount, bonus_label } = parseBonus(cells[b.col + 3]);
        const member_win = num(cells[b.col + 2]);
        const turnover = num(cells[b.col + 1]);

        // Sel User ID sesekali kena ketikan nyasar (angka telanjang tanpa satu
        // pun nilai pendamping). Itu bukan pemenang — dilewati tapi dicatat.
        if (/^\d+([.,]\d+)?$/.test(user) && turnover == null && member_win == null
          && bonus_amount == null && !bonus_label) {
          strays.push(`${b.name || `blok ${bi + 1}`} baris ${r + 1}: "${user}"`);
          return;
        }

        winners[bi].push({
          user,
          net_turnover: turnover,
          member_win,
          profit: member_win == null ? null : -member_win,
          bonus_amount,
          bonus_label,
        });
      });

      const first = String(at(cells, 'day') ?? '').trim();

      if (/^TOTAL$/i.test(first)) {
        total = {
          deposit_count_avg: num(at(cells, 'deposit_count')),
          deposit_amount_avg: num(at(cells, 'deposit_amount')),
          withdrawal_count_avg: num(at(cells, 'withdrawal_count')),
          withdrawal_amount_avg: num(at(cells, 'withdrawal_amount')),
          ftd_avg: num(at(cells, 'ftd')),
          member_win_sum: num(at(cells, 'member_win')),
          net_turnover_sum: num(at(cells, 'net_turnover')),
        };
        continue;
      }

      const day = num(first);
      if (!day || day < 1 || day > 31 || !Number.isInteger(day)) continue;

      const deposit_count = num(at(cells, 'deposit_count'));
      const deposit_amount = num(at(cells, 'deposit_amount'));
      const withdrawal_count = num(at(cells, 'withdrawal_count'));
      const withdrawal_amount = num(at(cells, 'withdrawal_amount'));
      const ftd = num(at(cells, 'ftd'));
      const member_win = num(at(cells, 'member_win'));
      const net_turnover = num(at(cells, 'net_turnover'));
      const remarks = parseRemarks(at(cells, 'remark'));

      const hasNumbers = [deposit_count, deposit_amount, withdrawal_count,
        withdrawal_amount, ftd, member_win, net_turnover].some((v) => v != null);

      // A day with only a remark is still worth keeping — it records a problem.
      if (!hasNumbers && !remarks.length) continue;

      out.rows.push({
        store: sec.store,
        date: `${period.year}-${String(period.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        ...ym,
        day,
        deposit_count,
        deposit_amount,
        withdrawal_count,
        withdrawal_amount,
        ftd,
        remarks,
        member_win,
        net_turnover,
        // Member Win is from the member's side: negative means the store kept it.
        profit: member_win == null ? null : -member_win,
        reported: hasNumbers,
      });
      if (hasNumbers) days += 1;
    }

    blocks.forEach((b, bi) => {
      if (!winners[bi].length) return;
      // Name may be null here; main() fills it from the same slot in another month.
      out.promos.push({ store: sec.store, ...ym, promo: b.name, slot: bi, winners: winners[bi] });
    });

    if (strays.length) {
      out.warnings.push(`${sec.store}: ${strays.length} sel User ID promo berisi ketikan nyasar — ${strays.join('; ')}.`);
    }

    out.stores.push({ store: sec.store, ...ym, days_reported: days, sheet_total: total });
  });

  return out;
}

/* ---------------------------------------------------------------- */
/* main                                                              */
/* ---------------------------------------------------------------- */

function main() {
  const srcDir = process.argv[2];
  const outFile = process.argv[3] || path.join(__dirname, '..', 'public', 'data', 'reports.json');

  if (!srcDir || !fs.existsSync(srcDir)) {
    console.error('Usage: node tools/parse-export.js <folder-with-html-exports> [outfile]');
    process.exit(1);
  }

  const files = fs.readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith('.html')).sort();
  if (!files.length) {
    console.error(`Tidak ada file .html di ${srcDir}`);
    process.exit(1);
  }

  const allRows = [];
  const allPromos = [];
  const monthly = [];
  const warnings = [];
  let sheetOrder = [];

  for (const f of files) {
    const res = parseFile(path.join(srcDir, f));
    if (res.order.length > sheetOrder.length) sheetOrder = res.order;
    allRows.push(...res.rows);
    allPromos.push(...res.promos);
    monthly.push(...res.stores.map((s) => ({ ...s, file: res.file })));
    warnings.push(...res.warnings.map((w) => `${res.file}: ${w}`));
    const reported = res.rows.filter((r) => r.reported).length;
    const prizes = res.promos.reduce((n, p) => n + p.winners.length, 0);
    console.log(
      `${res.file.padEnd(22)} ${String(res.stores.length).padStart(2)} toko · ` +
      `${String(reported).padStart(3)} hari terisi · ` +
      `${String(res.promos.length).padStart(2)} promo / ${String(prizes).padStart(3)} pemenang`
    );
  }

  // A promo block whose title row was deleted borrows the name that the same
  // store used in that slot in the months where the title survived.
  const bySlot = new Map();
  for (const p of allPromos) {
    if (!p.promo) continue;
    const key = `${p.store}#${p.slot}`;
    const tally = bySlot.get(key) || new Map();
    tally.set(p.promo, (tally.get(p.promo) || 0) + 1);
    bySlot.set(key, tally);
  }
  for (const p of allPromos) {
    if (p.promo) continue;
    const tally = bySlot.get(`${p.store}#${p.slot}`);
    const best = tally && [...tally].sort((a, b) => b[1] - a[1])[0];
    if (best) {
      p.promo = best[0];
      warnings.push(
        `${p.store} ${p.year}-${String(p.month).padStart(2, '0')}: judul promo hilang di sheet — ` +
        `dinamai "${p.promo}" mengikuti bulan lain.`
      );
    } else {
      p.promo = `PROMO ${p.slot + 1}`;
      warnings.push(`${p.store} ${p.year}-${String(p.month).padStart(2, '0')}: judul promo hilang dan tidak ada acuan bulan lain.`);
    }
  }

  allRows.sort((a, b) => a.date.localeCompare(b.date) || a.store.localeCompare(b.store));
  allPromos.sort((a, b) =>
    a.year - b.year || a.month - b.month || a.store.localeCompare(b.store) || a.promo.localeCompare(b.promo));

  // Toko tampil dalam urutan sheet; sisanya (kalau ada) menyusul alfabetis.
  const seen = [...new Set(allRows.map((r) => r.store))];
  const stores = [
    ...sheetOrder.filter((s) => seen.includes(s)),
    ...seen.filter((s) => !sheetOrder.includes(s)).sort(),
  ];
  const months = [...new Set(allRows.map((r) => `${r.year}-${String(r.month).padStart(2, '0')}`))].sort();

  const payload = {
    generated_at: new Date().toISOString(),
    source: 'html-export',
    // Sheet stores amounts in thousands of rupiah.
    amount_scale: 1000,
    stores,
    months,
    monthly_totals: monthly,
    rows: allRows,
    promos: allPromos,
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 1));

  const reported = allRows.filter((r) => r.reported);
  const promoNames = [...new Set(allPromos.map((p) => p.promo))].sort();
  console.log('');
  console.log(`Toko    : ${stores.join(', ')}`);
  console.log(`Bulan   : ${months[0]} … ${months[months.length - 1]} (${months.length})`);
  console.log(`Baris   : ${allRows.length} (${reported.length} terisi)`);
  console.log(`Promo   : ${promoNames.join(', ')}`);
  console.log(`Pemenang: ${allPromos.reduce((n, p) => n + p.winners.length, 0)}`);
  if (warnings.length) {
    console.log('');
    console.log('Peringatan:');
    warnings.forEach((w) => console.log('  ' + w));
  }
  console.log('');
  console.log(`Ditulis : ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)`);
}

if (require.main === module) main();

module.exports = { parseFile, num, parsePeriod, parseRemarks, toGrid };
