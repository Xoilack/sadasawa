// Lapisan DOM tipis — tanpa framework, tanpa build step.

export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

const ICONS = {
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  'arrow-in': '<path d="M12 3v13"/><path d="M7 11l5 5 5-5"/><path d="M4 21h16"/>',
  'arrow-out': '<path d="M12 21V8"/><path d="M7 13l5-5 5 5"/><path d="M4 3h16"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2"/><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><path d="M17 13h.01"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>',
  trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3"/><path d="M17 6h3v2a3 3 0 0 1-3 3"/>',
  bug: '<path d="M8 6a4 4 0 0 1 8 0"/><rect x="6" y="6" width="12" height="12" rx="6"/><path d="M3 11h3M18 11h3M3 17h3M18 17h3M4 6l2 1M20 6l-2 1"/>',
  gift: '<path d="M20 12v9H4v-9"/><path d="M2 7h20v5H2z"/><path d="M12 21V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
  store: '<path d="M4 9h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M3 9l1.5-5h15L21 9"/><path d="M9 21v-6h6v6"/>',
  coins: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
};

export function icon(name, cls = 'ico') {
  const body = ICONS[name] || ICONS.chart;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function emptyState(message, hint = '') {
  return `
    <div class="empty">
      ${icon('inbox', 'ico')}
      <div class="big">${esc(message)}</div>
      ${hint ? `<div>${esc(hint)}</div>` : ''}
    </div>`;
}

let toastHost;
export function toast(title, body = '', kind = '') {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toasts';
    document.body.appendChild(toastHost);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<b>${esc(title)}</b>${body ? `<div class="body">${esc(body)}</div>` : ''}`;
  toastHost.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => el.remove(), 320);
  }, kind === 'err' ? 8000 : 4000);
}

/* gerak ----------------------------------------------------------- */

export const reducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Menghitung naik angka dari nol ke nilai akhirnya.
 *
 * Elemen menandai dirinya lewat `data-num` (nilai mentah) dan `data-fmt`
 * (nama pemformat). Nilai akhir selalu ditulis ulang di frame terakhir supaya
 * yang terbaca persis sama dengan hasil pemformatan biasa — animasi tidak
 * pernah boleh mengubah angka yang dilihat orang.
 */
export function countUp(root, formatters, duration = 620) {
  const targets = root.querySelectorAll('[data-num]');
  if (!targets.length) return;

  for (const el of targets) {
    const to = Number(el.dataset.num);
    const render = formatters[el.dataset.fmt];
    if (!render || !Number.isFinite(to)) continue;

    if (reducedMotion()) { el.textContent = render(to); continue; }

    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      if (p >= 1) { el.textContent = render(to); return; }
      // easeOutCubic — cepat di awal, melambat di ujung.
      el.textContent = render(to * (1 - (1 - p) ** 3));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

/* token ----------------------------------------------------------- */

export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
