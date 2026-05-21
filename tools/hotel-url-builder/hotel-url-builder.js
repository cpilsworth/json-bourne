// DA App: Hotel URL Builder
// Reads the j2api OpenAPI schema and renders a form for crafting a hotel-search URL
// that can be pasted into a DA page (or copied as JSON / HTML endpoints).
//
// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
// eslint-disable-next-line import/no-unresolved
import jsYaml from 'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm';

const DEFAULT_API_BASE = 'https://j2api.cpilsworth.workers.dev';
const STORAGE_KEY = 'hotel-url-builder:apiBase';

// Static option lists for IDs that aren't enumerated in the OpenAPI schema.
// All values lifted from the live Jet2holidays /destinations/portugal filter
// dialog (board-basis_*, room-type_*, location_*, our-rating_* inputs).
//
// A grouped list is rendered with <optgroup>; a flat list is rendered as
// plain <option>s.
const RESORT_OPTIONS = [
  {
    group: 'Algarve',
    options: [
      { id: 573, label: 'Albufeira' },
      { id: 575, label: 'Almancil' },
      { id: 577, label: 'Alvor' },
      { id: 578, label: 'Armação de Pêra' },
      { id: 2153, label: 'Bordeira' },
      { id: 579, label: 'Carvoeiro' },
      { id: 2245, label: 'Castelo (Albufeira)' },
      { id: 1845, label: 'Castro Marim' },
      { id: 1624, label: 'Estoi' },
      { id: 2046, label: 'Faro' },
      { id: 1835, label: 'Ferragudo' },
      { id: 2246, label: 'Galé (Albufeira)' },
      { id: 2247, label: 'Guia (Albufeira)' },
      { id: 580, label: 'Lagos' },
      { id: 581, label: 'Loulé' },
      { id: 1846, label: 'Moncarapacho' },
      { id: 1621, label: 'Monchique' },
      { id: 582, label: 'Monte Gordo' },
      { id: 1306, label: 'Olhão' },
      { id: 583, label: 'Olhos d’Água (Albufeira)' },
      { id: 586, label: 'Praia da Rocha' },
      { id: 1291, label: 'Praia do Vau' },
      { id: 2129, label: 'Praia Verde' },
      { id: 587, label: 'Quarteira' },
      { id: 588, label: 'Quinta do Lago' },
      { id: 1590, label: 'Salema' },
      { id: 1879, label: 'São Brás' },
      { id: 2248, label: 'São Rafael (Albufeira)' },
      { id: 589, label: 'Silves' },
      { id: 590, label: 'Tavira' },
      { id: 2249, label: 'Vale de Parra (Albufeira)' },
      { id: 2093, label: 'Vila Nova de Cacela' },
      { id: 592, label: 'Vilamoura' },
    ],
  },
  {
    group: 'Costa Verde',
    options: [
      { id: 2195, label: 'Barcelos' },
      { id: 2192, label: 'Caminha' },
      { id: 2194, label: 'Esposende' },
      { id: 2193, label: 'Paredes de Coura' },
      { id: 2197, label: 'Ponte de Lima' },
      { id: 2196, label: 'Viana do Castelo' },
    ],
  },
  {
    group: 'Madeira',
    options: [
      { id: 1357, label: 'Calheta' },
      { id: 1954, label: 'Câmara de Lobos' },
      { id: 1400, label: 'Caniçal' },
      { id: 534, label: 'Caniço' },
      { id: 535, label: 'Funchal' },
      { id: 537, label: 'Machico' },
      { id: 2023, label: 'Madalena do Mar' },
      { id: 1673, label: 'Ponta do Sol' },
      { id: 2186, label: 'Porto Moniz' },
      { id: 1880, label: 'Prazeres' },
      { id: 539, label: 'Ribeira Brava' },
      { id: 1330, label: 'Santa Cruz (Madeira)' },
      { id: 1723, label: 'Santana' },
      { id: 540, label: 'Santo da Serra' },
      { id: 1724, label: 'São Vicente' },
    ],
  },
];

// The cached endpoint matches `areas` against the hotel's area NAME (string),
// so values are the names not the upstream numeric IDs (139/2191/129).
const AREA_OPTIONS = [
  { id: 'Algarve', label: 'Algarve' },
  { id: 'Costa Verde', label: 'Costa Verde' },
  { id: 'Madeira', label: 'Madeira' },
];

const BOARD_BASIS_OPTIONS = [
  { id: 5, label: 'All Inclusive' },
  { id: 8, label: 'All Inclusive Plus' },
  { id: 1, label: 'Bed & Breakfast' },
  { id: 3, label: 'Full Board' },
  { id: 11, label: 'Full Board Plus' },
  { id: 2, label: 'Half Board' },
  { id: 10, label: 'Half Board Plus' },
  { id: 6, label: 'Room Only' },
  { id: 4, label: 'Self Catering' },
];

const ROOM_TYPE_OPTIONS = [
  { id: 22, label: '1 Bedroom Suite' },
  { id: 21, label: '2 Bedroom Suite' },
  { id: 2, label: 'Double' },
  { id: 13, label: 'Double/Twin' },
  { id: 4, label: 'Family Room' },
  { id: 23, label: 'Interconnecting Room' },
  { id: 19, label: 'Junior Suite' },
  { id: 5, label: 'One Bed Apt' },
  { id: 20, label: 'Quad' },
  { id: 1, label: 'Single' },
  { id: 8, label: 'Studio' },
  { id: 15, label: 'Superior' },
  { id: 17, label: 'Townhouse' },
  { id: 7, label: 'Triple' },
  { id: 6, label: 'Two Bed Apt' },
  { id: 16, label: 'Villa' },
];

const STAR_RATING_OPTIONS = [
  { id: 2, label: '2 stars' },
  { id: 3, label: '3 stars' },
  { id: 4, label: '4 stars' },
  { id: 5, label: '5 stars' },
];

const STATIC_OPTIONS = {
  resorts: RESORT_OPTIONS,
  predefinedResorts: RESORT_OPTIONS,
  areas: AREA_OPTIONS,
  boardBasisIds: BOARD_BASIS_OPTIONS,
  roomTypeIds: ROOM_TYPE_OPTIONS,
  starRatings: STAR_RATING_OPTIONS,
};

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

function resolveRef(spec, ref) {
  if (!ref?.startsWith('#/')) return null;
  return ref.slice(2).split('/').reduce((acc, key) => acc?.[key], spec);
}

// Pull the GET parameter list off the cached-hotels path — it's the superset of
// what both cached endpoints accept, and the only fields useful for crafting a
// browseable URL (the proxy path also takes header params we don't expose).
function paramsFromSpec(spec) {
  const op = spec?.paths?.['/api/jet2/hotels/getcachedhotels']?.get;
  if (!op?.parameters) return [];
  return op.parameters
    .map((p) => (p.$ref ? resolveRef(spec, p.$ref) : p))
    .filter((p) => p && p.in === 'query');
}

// `showVillasOnly` and friends declare an enum of true/false-ish strings —
// detect that so we can render a checkbox instead of a long dropdown.
function isBooleanEnum(p) {
  const e = p.schema?.enum;
  if (!Array.isArray(e) || e.length === 0) return false;
  return e.every((v) => /^(true|false|0|1|yes|no)$/i.test(String(v)));
}

function paramKind(p) {
  const s = p.schema || {};
  if (s.type === 'array') return 'array';
  if (s.enum) return 'enum';
  if (s.type === 'integer' || s.type === 'number') return 'number';
  if (s.type === 'boolean') return 'boolean';
  // String enum-ish (showVillasOnly) is treated as enum if it has one.
  return 'string';
}

function fieldFor(p) {
  const kind = paramKind(p);
  const id = `f-${p.name}`;
  const isWide = p.name === 'predefinedResorts' || p.name === 'resorts';
  const fs = el('fieldset', { class: isWide ? 'wide' : '' });

  // Treat boolean-shaped params (true/False enums or explicit booleans) as
  // checkboxes that emit a literal `true` or `false` value.
  if (kind === 'boolean' || isBooleanEnum(p)) {
    const wrap = el('fieldset', { class: 'row-checkbox' });
    const cb = el('input', { type: 'checkbox', id, name: p.name });
    cb.dataset.kind = 'tri-bool';
    wrap.append(cb, el('label', { for: id }, p.name));
    return wrap;
  }

  fs.append(el('label', { for: id }, [
    p.name,
    p.required ? el('span', { class: 'req' }, ' *') : null,
  ]));

  let control;
  if (kind === 'enum') {
    control = el('select', { id, name: p.name });
    control.dataset.kind = 'enum';
    const def = p.schema.default;
    // Skip the "(default)" placeholder when the schema names a real default —
    // we'll just pre-select it so the URL always includes a value.
    if (def == null) {
      control.append(el('option', { value: '' }, '(default)'));
    }
    for (const v of p.schema.enum) {
      const opt = el('option', { value: v }, enumLabel(p.name, v));
      if (def != null && String(v) === String(def)) opt.selected = true;
      control.append(opt);
    }
  } else if ((kind === 'array' || kind === 'enum') && STATIC_OPTIONS[p.name]) {
    const opts = STATIC_OPTIONS[p.name];
    const flat = opts.flatMap((o) => (o.group ? o.options : [o]));
    control = el('select', {
      id, name: p.name, multiple: 'multiple', size: Math.min(flat.length, 10),
    });
    control.dataset.kind = 'multi';
    for (const o of opts) {
      if (o.group) {
        const og = el('optgroup', { label: o.group });
        for (const sub of o.options) og.append(el('option', { value: String(sub.id) }, sub.label));
        control.append(og);
      } else {
        control.append(el('option', { value: String(o.id) }, o.label));
      }
    }
  } else if (kind === 'array') {
    const long = (p.schema?.items?.type === 'integer') && p.name === 'predefinedResorts';
    control = el(long ? 'textarea' : 'input', { id, name: p.name, placeholder: 'comma-separated' });
    control.dataset.kind = 'array';
  } else if (kind === 'number') {
    control = el('input', {
      id, name: p.name, type: 'number',
      min: p.schema.minimum, max: p.schema.maximum,
      placeholder: p.schema.default != null ? String(p.schema.default) : '',
    });
    control.dataset.kind = 'number';
  } else {
    control = el('input', { id, name: p.name, type: 'text' });
    control.dataset.kind = 'string';
  }

  fs.append(control);
  if (p.description) {
    const short = p.description.replace(/\n+/g, ' ').trim().slice(0, 160);
    fs.append(el('div', { class: 'desc' }, short));
  }
  return fs;
}

// Hand-tweaked labels for hotelOrder; everything else just shows the raw value.
const HOTEL_ORDER_LABELS = {
  1: '1 — Recommended',
  2: '2 — Our rating high→low',
  3: '3 — Our rating low→high',
  4: '4 — TripAdvisor rating',
};

function enumLabel(name, value) {
  if (name === 'hotelOrder' && HOTEL_ORDER_LABELS[value]) return HOTEL_ORDER_LABELS[value];
  return String(value);
}

function collectValues(form) {
  const out = new URLSearchParams();
  for (const control of form.querySelectorAll('[name]')) {
    const { name } = control;
    const kind = control.dataset.kind;
    if (kind === 'tri-bool') {
      out.set(name, control.checked ? 'true' : 'false');
      continue;
    }
    if (kind === 'boolean') {
      if (control.checked) out.set(name, 'true');
      continue;
    }
    if (kind === 'multi') {
      for (const opt of control.selectedOptions) out.append(name, opt.value);
      continue;
    }
    const raw = control.value?.trim();
    if (!raw) continue;
    if (kind === 'array') {
      raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((v) => out.append(name, v));
    } else {
      out.set(name, raw);
    }
  }
  return out;
}

function buildUrls(apiBase, params) {
  const qs = params.toString();
  const suffix = qs ? `?${qs}` : '';
  return {
    json: `${apiBase}/api/jet2/hotels/getcachedhotels${suffix}`,
    html: `${apiBase}/html/jet2/hotels/getcachedhotels${suffix}`,
    proxy: `${apiBase}/api/jet2/hotels/getfilteredhotels${suffix}`,
  };
}

function showToast(msg) {
  let t = $('.toast');
  if (!t) {
    t = el('div', { class: 'toast' });
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.remove('show'), 1400);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied');
  } catch {
    showToast('Copy failed');
  }
}

async function loadSpec(apiBase) {
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/openapi.yaml`);
  if (!res.ok) throw new Error(`Failed to load schema (${res.status})`);
  return jsYaml.load(await res.text());
}

function render(spec, apiBase, context) {
  const root = $('#app');
  root.replaceChildren();
  root.removeAttribute('aria-busy');

  const header = el('header', { class: 'app-header' }, [
    el('h1', {}, spec.info?.title ? `${spec.info.title} — URL builder` : 'Hotel URL Builder'),
    el('div', { class: 'ctx' }, context?.org && context?.repo ? `${context.org}/${context.repo}` : ''),
  ]);

  const form = el('form', { id: 'filters' });
  const params = paramsFromSpec(spec);
  for (const p of params) form.append(fieldFor(p));

  const urlJson = el('div', { class: 'url', id: 'url-json' });
  const urlHtml = el('div', { class: 'url', id: 'url-html' });

  const footer = el('footer', { class: 'preview' }, [
    el('div', { class: 'endpoint-row' }, [
      el('label', {}, 'JSON'),
      urlJson,
      el('button', { type: 'button', id: 'copy-json' }, 'Copy'),
      el('button', { type: 'button', id: 'open-json' }, 'Open'),
    ]),
    el('div', { class: 'endpoint-row' }, [
      el('label', {}, 'HTML'),
      urlHtml,
      el('button', { type: 'button', id: 'copy-html', class: 'primary' }, 'Copy HTML URL'),
      el('button', { type: 'button', id: 'open-html' }, 'Open'),
    ]),
  ]);

  root.append(header, form, footer);

  function refresh() {
    const urls = buildUrls(apiBase, collectValues(form));
    urlJson.textContent = urls.json;
    urlHtml.textContent = urls.html;
    urlJson.dataset.url = urls.json;
    urlHtml.dataset.url = urls.html;
  }

  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);

  $('#copy-json').addEventListener('click', () => copy(urlJson.dataset.url));
  $('#copy-html').addEventListener('click', () => copy(urlHtml.dataset.url));
  $('#open-json').addEventListener('click', () => window.open(urlJson.dataset.url, '_blank', 'noopener'));
  $('#open-html').addEventListener('click', () => window.open(urlHtml.dataset.url, '_blank', 'noopener'));

  refresh();
}

function fail(apiBase, message, retry) {
  const root = $('#app');
  root.removeAttribute('aria-busy');
  const input = el('input', { id: 'api-base', type: 'url', value: apiBase });
  const button = el('button', { type: 'button', class: 'primary' }, 'Retry');
  button.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, input.value);
    retry(input.value.trim().replace(/\/$/, ''));
  });
  root.replaceChildren(
    el('p', { class: 'status error' }, message),
    el('div', { class: 'api-base' }, [
      el('label', { for: 'api-base' }, 'API base'),
      input,
      button,
    ]),
  );
}

(async function init(startBase) {
  const root = $('#app');
  root.setAttribute('aria-busy', 'true');
  root.replaceChildren(el('p', { class: 'status' }, 'Loading schema…'));

  let context;
  try {
    ({ context } = await DA_SDK);
  } catch {
    context = null;
  }

  const apiBase = (startBase || localStorage.getItem(STORAGE_KEY) || DEFAULT_API_BASE).replace(/\/$/, '');

  try {
    const spec = await loadSpec(apiBase);
    render(spec, apiBase, context);
  } catch (err) {
    fail(apiBase, `Could not load OpenAPI schema from ${apiBase}/openapi.yaml — ${err.message}.`, init);
  }
}());
