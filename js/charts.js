// Pembungkus Chart.js. Semua grafik digambar ulang saat tema diganti.

import { cssVar, reducedMotion } from './ui.js';
import * as fmt from './format.js';

const registry = new Map();

function palette() {
  return {
    text: cssVar('--text'),
    text2: cssVar('--text-2'),
    text3: cssVar('--text-3'),
    grid: cssVar('--grid'),
    surface: cssVar('--surface'),
    border: cssVar('--border'),
    accent: cssVar('--accent'),
    info: cssVar('--info'),
    pos: cssVar('--pos'),
    neg: cssVar('--neg'),
  };
}

/** Sumbu & tooltip bekerja dalam rupiah sebenarnya, bukan nilai sheet. */
function baseOptions(p, spec) {
  const asMoney = spec.kind === 'money';
  return {
    responsive: true,
    maintainAspectRatio: false,
    // Batang dan garis tumbuh dari garis nol sekali saat digambar. Sumbu X
    // tidak ikut beranimasi supaya label tidak bergeser-geser.
    animation: reducedMotion() ? false : { duration: 620, easing: 'easeOutQuart' },
    animations: reducedMotion() ? { colors: false, x: false, y: false } : {
      colors: false,
      x: false,
      y: { from: (ctx) => (ctx.type === 'data' && ctx.mode === 'default' ? ctx.chart.scales.y.getPixelForValue(0) : undefined) },
    },
    transitions: { active: { animation: { duration: 0 } }, resize: { animation: { duration: 0 } } },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: !spec.hideLegend,
        position: 'top',
        align: 'end',
        labels: {
          boxWidth: 9, boxHeight: 9, usePointStyle: true, pointStyle: 'circle',
          color: p.text2, font: { size: 11, weight: '600' }, padding: 14,
        },
      },
      tooltip: {
        backgroundColor: p.surface,
        titleColor: p.text,
        bodyColor: p.text2,
        borderColor: p.border,
        borderWidth: 1,
        padding: 11,
        cornerRadius: 8,
        usePointStyle: true,
        boxWidth: 8,
        boxHeight: 8,
        titleFont: { size: 12, weight: '700' },
        bodyFont: { size: 12 },
        callbacks: {
          label(ctx) {
            const v = ctx.parsed.y;
            const shown = asMoney ? fmt.rpFull(v) : ctx.dataset.kind === 'percent' ? fmt.percent(v) : fmt.full(v);
            return `  ${ctx.dataset.label}: ${shown}`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: !!spec.stacked,
        grid: { display: false },
        border: { color: p.grid },
        ticks: { color: p.text3, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 12 },
      },
      y: {
        stacked: !!spec.stacked,
        beginAtZero: true,
        grid: { color: p.grid },
        border: { display: false },
        ticks: {
          color: p.text3,
          font: { size: 11 },
          padding: 6,
          callback: (v) => (asMoney ? fmt.rp(v) : fmt.compact(v)),
        },
      },
    },
  };
}

function gradient(ctx, color, area) {
  if (!area) return `${color}22`;
  const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, `${color}38`);
  g.addColorStop(1, `${color}03`);
  return g;
}

function build(canvas, spec) {
  const p = palette();
  const opts = baseOptions(p, spec);
  if (spec.optionsPatch) spec.optionsPatch(opts, p);

  const datasets = spec.datasets.map((ds, i) => {
    const color = (typeof ds.color === 'function' ? ds.color() : ds.color)
      || [p.accent, p.info, p.pos, p.neg][i % 4];
    const isBar = (ds.type || spec.type) === 'bar';
    return {
      label: ds.label,
      data: ds.data,
      kind: ds.kind,
      type: ds.type,
      borderColor: color,
      backgroundColor: isBar
        ? color
        : (c) => (ds.fill === false ? 'transparent' : gradient(c.chart.ctx, color, c.chart.chartArea)),
      fill: isBar ? true : ds.fill !== false,
      borderWidth: isBar ? 0 : 2,
      borderRadius: isBar ? 4 : 0,
      maxBarThickness: 40,
      tension: 0.32,
      pointRadius: spec.labels.length > 40 ? 0 : 2.4,
      pointHoverRadius: 5,
      pointBackgroundColor: color,
      pointBorderColor: p.surface,
      pointBorderWidth: 1.5,
      spanGaps: false,
    };
  });

  return new window.Chart(canvas.getContext('2d'), {
    type: spec.type || 'line',
    data: { labels: spec.labels, datasets },
    options: opts,
  });
}

export function draw(canvasId, spec) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return null;
  destroy(canvasId);
  registry.set(canvasId, { chart: build(canvas, spec), spec });
  return registry.get(canvasId).chart;
}

export function destroy(id) {
  const e = registry.get(id);
  if (e) { e.chart.destroy(); registry.delete(id); }
}

export function destroyAll() {
  for (const [id] of [...registry.entries()]) destroy(id);
}
