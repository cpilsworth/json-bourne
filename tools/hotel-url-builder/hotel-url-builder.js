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

// Populated at boot from `${apiBase}/reference.json`. Each entry is either a
// flat array of {id, label} options or an array of {group, options} groups
// (rendered as <optgroup>).
let STATIC_OPTIONS = {};

function resolveReference(ref) {
  const out = {};
  for (const [k, v] of Object.entries(ref)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.$ref === 'string') {
      out[k] = ref[v.$ref] ?? [];
    } else {
      out[k] = v;
    }
  }
  return out;
}

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

function enumLabel(name, value) {
  const ref = STATIC_OPTIONS[name];
  if (Array.isArray(ref)) {
    const match = ref.find((o) => !o.group && String(o.id) === String(value));
    if (match) return `${value} — ${match.label}`;
  }
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

async function loadReference(apiBase) {
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/reference.json`);
  if (!res.ok) throw new Error(`Failed to load reference (${res.status})`);
  return resolveReference(await res.json());
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
    const [spec, reference] = await Promise.all([
      loadSpec(apiBase),
      loadReference(apiBase).catch((err) => {
        // Reference is nice-to-have — without it the fields fall back to
        // free-text inputs. Don't fail the whole boot.
        // eslint-disable-next-line no-console
        console.warn('reference.json not loaded:', err);
        return {};
      }),
    ]);
    STATIC_OPTIONS = reference;
    render(spec, apiBase, context);
  } catch (err) {
    fail(apiBase, `Could not load OpenAPI schema from ${apiBase}/openapi.yaml — ${err.message}.`, init);
  }
}());
