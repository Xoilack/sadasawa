'use strict';

/**
 * Cross-checks the parsed JSON against the TOTAL row each sheet already
 * computed. If our arithmetic disagrees with the sheet's own footer, the
 * parser is reading the wrong columns.
 *
 * Sheet convention: TOTAL is an AVERAGE for the daily columns, but a SUM for
 * Member Win and Net Turnover.
 */

const fs = require('node:fs');
const path = require('node:path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'reports.json'), 'utf8'));

const key = (r) => `${r.store}|${r.year}-${String(r.month).padStart(2, '0')}`;
const groups = new Map();
for (const r of data.rows) {
  if (!r.reported) continue;
  if (!groups.has(key(r))) groups.set(key(r), []);
  groups.get(key(r)).push(r);
}

const avg = (rows, f) => {
  const vals = rows.map(f).filter((v) => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};
const sum = (rows, f) => rows.map(f).filter((v) => v != null).reduce((a, b) => a + b, 0);

const near = (a, b, tol = 0.02) => {
  if (a == null || b == null) return a == null && b == null;
  if (b === 0) return Math.abs(a) < 1;
  return Math.abs(a - b) / Math.abs(b) <= tol;
};

let checked = 0;
let failed = 0;

console.log('STORE / BULAN            HARI  CEK');
console.log('-'.repeat(78));

for (const mt of data.monthly_totals) {
  const k = `${mt.store}|${mt.year}-${String(mt.month).padStart(2, '0')}`;
  const rows = groups.get(k) || [];
  const t = mt.sheet_total;
  if (!t || !rows.length) {
    console.log(`${k.padEnd(24)} ${String(rows.length).padStart(4)}  (tidak ada baris TOTAL)`);
    continue;
  }

  const checks = [
    ['dep.count',  avg(rows, (r) => r.deposit_count),      t.deposit_count_avg],
    ['dep.amount', avg(rows, (r) => r.deposit_amount),     t.deposit_amount_avg],
    ['wd.count',   avg(rows, (r) => r.withdrawal_count),   t.withdrawal_count_avg],
    ['wd.amount',  avg(rows, (r) => r.withdrawal_amount),  t.withdrawal_amount_avg],
    ['ftd',        avg(rows, (r) => r.ftd),                t.ftd_avg],
    ['memberwin',  sum(rows, (r) => r.member_win),         t.member_win_sum],
    ['turnover',   sum(rows, (r) => r.net_turnover),       t.net_turnover_sum],
  ];

  const bad = checks.filter(([, mine, sheet]) => !near(mine, sheet));
  checked += checks.length;
  failed += bad.length;

  const mark = bad.length ? '✗ ' + bad.map(([n, mine, sheet]) =>
    `${n}: kita ${Math.round(mine)} vs sheet ${sheet}`).join('; ') : '✓ semua cocok';
  console.log(`${k.padEnd(24)} ${String(rows.length).padStart(4)}  ${mark}`);
}

console.log('-'.repeat(78));
console.log(`${checked - failed}/${checked} pemeriksaan cocok`);
process.exit(failed ? 1 : 0);
