/*
 * Local Weather block
 * Rendered from a weather sheet (templates/local-weather.html) as a block-table:
 * one row per resort with cells [Resort, Jan, Feb, ... Dec] (13 cells).
 * The sheet can't be filtered server-side (static all-in-one, logic-less
 * template), so this block picks the resort from the fragment's URL slug and
 * draws a monthly temperature bar chart. Bar heights are computed here because
 * mustache can't do arithmetic.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MIN_BAR = 90;
const MAX_BAR = 260;

const SUN_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="5"></circle>
  <g stroke-width="2" stroke-linecap="round">
    <line x1="12" y1="1" x2="12" y2="4"></line><line x1="12" y1="20" x2="12" y2="23"></line>
    <line x1="1" y1="12" x2="4" y2="12"></line><line x1="20" y1="12" x2="23" y2="12"></line>
    <line x1="4.2" y1="4.2" x2="6.3" y2="6.3"></line><line x1="17.7" y1="17.7" x2="19.8" y2="19.8"></line>
    <line x1="4.2" y1="19.8" x2="6.3" y2="17.7"></line><line x1="17.7" y1="6.3" x2="19.8" y2="4.2"></line>
  </g>
</svg>`;

export default function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  // Pick the resort matching the last URL slug; fall back to the first row.
  const slug = (window.location.pathname.split('/').filter(Boolean).pop() || '')
    .replace(/\.plain\.html$/, '').toLowerCase();
  let row = rows.find((r) => r.children[0]
    && r.children[0].textContent.trim().toLowerCase() === slug);
  if (!row) [row] = rows;

  const cells = [...row.children];
  const temps = MONTHS.map((_, i) => parseInt((cells[i + 1] || {}).textContent, 10))
    .map((t) => (Number.isFinite(t) ? t : null));
  const valid = temps.filter((t) => t !== null);
  const max = Math.max(...valid);
  const min = Math.min(...valid);
  const height = (t) => (max === min ? (MIN_BAR + MAX_BAR) / 2
    : MIN_BAR + ((t - min) / (max - min)) * (MAX_BAR - MIN_BAR));

  const chart = document.createElement('div');
  chart.className = 'local-weather-chart';

  MONTHS.forEach((label, i) => {
    const t = temps[i];
    if (t === null) return;
    const col = document.createElement('div');
    col.className = 'local-weather-month';

    const bar = document.createElement('div');
    bar.className = 'local-weather-bar';
    bar.style.height = `${Math.round(height(t))}px`;

    const sun = document.createElement('span');
    sun.className = 'local-weather-sun';
    sun.innerHTML = SUN_SVG;

    const temp = document.createElement('span');
    temp.className = 'local-weather-temp';
    temp.textContent = `${t}°C`;

    bar.append(sun, temp);

    const lbl = document.createElement('span');
    lbl.className = 'local-weather-label';
    lbl.textContent = label;

    col.append(bar, lbl);
    chart.append(col);
  });

  block.replaceChildren(chart);
}
