// Cloudflare Worker:
//   GET /api/jet2/hotels/getfilteredhotels  → proxies to Jet2holidays' POST endpoint
//   GET /api/jet2/hotels/getcachedhotels    → answers from the local D1 cache (JSON)
//   GET /html/jet2/hotels/getcachedhotels   → same as cached, but rendered to HTML

import Mustache from 'mustache';
import OPENAPI_YAML from '../openapi.yaml';

// Default Mustache escape encodes "/" as "&#x2F;" which mangles URLs in href/src.
// Override to keep the XSS-relevant escapes and leave "/" alone.
Mustache.escape = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
//
// Supported query params (all optional, repeatable or comma-separated for arrays):
//   areas, boardBasisIds, roomTypeIds, starRatings, resorts, predefinedResorts
//   hotelOrder      (string, default "1": 1=Recommended, 2=Rating high→low, 3=low→high, 4=TripAdvisor)
//   page            (integer, default 0; page size = 10)
//   showVillasOnly  (True/False, default "False")
//
// Examples:
//   /api/jet2/hotels/getfilteredhotels?predefinedResorts=573,575&starRatings=4,5
//   /api/jet2/hotels/getcachedhotels?predefinedResorts=573,575&starRatings=4,5

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 200;

function readArray(params, key) {
  return params
    .getAll(key)
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function normalizeBool(value) {
  if (value == null) return 'False';
  const v = String(value).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' ? 'True' : 'False';
}

function buildBody(params) {
  return {
    areas: readArray(params, 'areas'),
    boardBasisIds: readArray(params, 'boardBasisIds'),
    roomTypeIds: readArray(params, 'roomTypeIds'),
    starRatings: readArray(params, 'starRatings'),
    resorts: readArray(params, 'resorts'),
    hotelOrder: params.get('hotelOrder') ?? '1',
    page: Number.parseInt(params.get('page') ?? '0', 10) || 0,
    predefinedResorts: readArray(params, 'predefinedResorts'),
    showVillasOnly: normalizeBool(params.get('showVillasOnly')),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'Method not allowed. Use GET.' }, 405, origin);
    }

    if (url.pathname === env.UPSTREAM_PATH) {
      return handleProxy(request, env, url);
    }
    if (url.pathname === env.CACHED_PATH) {
      return handleCached(env, url, origin);
    }
    if (url.pathname === '/html/jet2/hotels/getcachedhotels') {
      return handleCachedHtml(env, url, origin);
    }
    if (url.pathname === '/' || url.pathname === '/try') {
      return new Response(FORM_HTML, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    if (url.pathname === '/openapi.yaml' || url.pathname === '/openapi.yml') {
      return new Response(OPENAPI_YAML, {
        headers: {
          ...corsHeaders(origin),
          'content-type': 'application/yaml; charset=utf-8',
        },
      });
    }
    return json({ error: 'Not found' }, 404, origin);
  },
};

const FORM_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>j2api — try it</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; display: grid; grid-template-rows: auto 1fr; height: 100vh; }
  form { padding: 12px 16px; border-bottom: 1px solid #8884; display: grid;
         grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px 14px; align-items: end; }
  fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }
  label { font-size: 12px; opacity: 0.75; }
  input, select, textarea { font: inherit; padding: 4px 6px; }
  textarea { min-height: 50px; resize: vertical; font-family: ui-monospace, monospace; font-size: 12px; }
  .row-checkbox { flex-direction: row; align-items: center; gap: 6px; }
  .row-checkbox label { font-size: 14px; opacity: 1; }
  .submit { display: flex; gap: 8px; }
  button { padding: 6px 14px; font: inherit; cursor: pointer; }
  iframe { width: 100%; height: 100%; border: 0; }
  .url { grid-column: 1 / -1; font-family: ui-monospace, monospace; font-size: 12px;
         word-break: break-all; opacity: 0.7; }
  .url a { color: inherit; }
</style>
</head>
<body>
<form id="f">
  <fieldset>
    <label for="hotelOrder">Sort (hotelOrder)</label>
    <select id="hotelOrder" name="hotelOrder">
      <option value="1">1 — Recommended</option>
      <option value="2">2 — Our rating high→low</option>
      <option value="3">3 — Our rating low→high</option>
      <option value="4">4 — TripAdvisor rating</option>
    </select>
  </fieldset>
  <fieldset>
    <label for="page">page</label>
    <input id="page" name="page" type="number" min="0" value="0">
  </fieldset>
  <fieldset>
    <label for="pageSize">pageSize (max 200)</label>
    <input id="pageSize" name="pageSize" type="number" min="1" max="200" value="10">
  </fieldset>
  <fieldset>
    <label for="starRatings">starRatings (csv, e.g. 4,5)</label>
    <input id="starRatings" name="starRatings" placeholder="">
  </fieldset>
  <fieldset>
    <label for="areas">areas (csv)</label>
    <input id="areas" name="areas" placeholder="e.g. Algarve">
  </fieldset>
  <fieldset>
    <label for="resorts">resorts (csv)</label>
    <input id="resorts" name="resorts">
  </fieldset>
  <fieldset class="row-checkbox">
    <input id="showVillasOnly" name="showVillasOnly" type="checkbox" value="True">
    <label for="showVillasOnly">showVillasOnly</label>
  </fieldset>
  <fieldset style="grid-column: 1 / -1;">
    <label for="predefinedResorts">predefinedResorts (csv) — defaults to Algarve</label>
    <textarea id="predefinedResorts" name="predefinedResorts">573,575,577,578,2153,579,2245,1845,1624,2046,1835,2246,2247,580,581,1846,1621,582,1306,583,586,1291,2129,587,588,1590,1879,2248,589,590,2249,2093,592</textarea>
  </fieldset>
  <div class="submit">
    <button type="submit">Load</button>
    <button type="button" id="clear">Clear filters</button>
  </div>
  <div class="url"><a id="urlOut" target="result"></a></div>
</form>
<iframe name="result" id="result"></iframe>
<script>
  const form = document.getElementById('f');
  const urlOut = document.getElementById('urlOut');
  const frame = document.getElementById('result');
  const ENDPOINT = '/api/jet2/hotels/getcachedhotels';
  const ARRAY_FIELDS = ['areas','starRatings','resorts','predefinedResorts'];

  function buildUrl() {
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const [k, v] of data.entries()) {
      if (!v || v === '') continue;
      if (ARRAY_FIELDS.includes(k)) {
        v.split(',').map((s) => s.trim()).filter(Boolean).forEach((x) => params.append(k, x));
      } else {
        params.set(k, v);
      }
    }
    return ENDPOINT + (params.toString() ? '?' + params : '');
  }

  function refreshUrl() {
    const u = buildUrl();
    urlOut.textContent = u;
    urlOut.href = u;
  }

  form.addEventListener('input', refreshUrl);
  form.addEventListener('change', refreshUrl);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    frame.src = buildUrl();
  });
  document.getElementById('clear').addEventListener('click', () => {
    form.querySelectorAll('input[type=text], input[type=number], input:not([type]), textarea')
      .forEach((el) => { el.value = el.defaultValue || ''; });
    form.querySelectorAll('input[type=checkbox]').forEach((el) => { el.checked = false; });
    refreshUrl();
  });

  refreshUrl();
  frame.src = buildUrl();
</script>
</body>
</html>
`;

async function handleProxy(request, env, url) {
  const origin = request.headers.get('origin');
  const body = buildBody(url.searchParams);
  const upstreamUrl = `${env.UPSTREAM_BASE}${env.UPSTREAM_PATH}`;

  // Browsers forbid setting `Cookie` on fetch(), so callers can pass cookies
  // via `x-forwarded-cookie` instead. Same for user-agent.
  const cookie =
    request.headers.get('x-forwarded-cookie') ?? request.headers.get('cookie');
  const userAgent =
    request.headers.get('x-forwarded-user-agent') ??
    request.headers.get('user-agent') ??
    'j2api-worker/1.0';

  const upstreamHeaders = {
    'content-type': 'application/json',
    accept: 'application/json',
    'user-agent': userAgent,
    referer: `${env.UPSTREAM_BASE}/`,
    origin: env.UPSTREAM_BASE,
  };
  if (cookie) upstreamHeaders.cookie = cookie;

  const upstream = await fetch(upstreamUrl, {
    method: 'POST',
    headers: upstreamHeaders,
    body: JSON.stringify(body),
  });

  const headers = new Headers(corsHeaders(origin));
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('x-j2api-upstream-status', String(upstream.status));

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

async function queryCached(env, url) {
  const body = buildBody(url.searchParams);
  const { where, args } = buildWhere(body);
  const orderBy = buildOrderBy(body.hotelOrder);
  const pageSize = clampPageSize(url.searchParams.get('pageSize'));
  const offset = body.page * pageSize;

  const resortFilter = body.predefinedResorts.length + body.resorts.length > 0;
  const fromClause = resortFilter
    ? 'FROM hotels h JOIN hotel_resorts hr ON hr.hotel_id = h.id'
    : 'FROM hotels h';

  const countSql = `SELECT COUNT(DISTINCT h.id) AS n ${fromClause} ${where}`;
  const listSql = `
    SELECT DISTINCT h.* ${fromClause}
    ${where}
    ${orderBy}
    LIMIT ? OFFSET ?
  `;

  const [{ results: countRows }, { results: hotelRows }] = await env.DB.batch([
    env.DB.prepare(countSql).bind(...args),
    env.DB.prepare(listSql).bind(...args, pageSize, offset),
  ]);

  return {
    Hotels: hotelRows.map(rowToHotel),
    HotelCountForSelectedFilters: countRows[0]?.n ?? 0,
    Page: body.page,
    PageSize: pageSize,
  };
}

async function handleCached(env, url, origin) {
  const data = await queryCached(env, url);
  // Don't leak Page/PageSize on the JSON endpoint — keep shape identical to upstream.
  return json({
    Hotels: data.Hotels,
    HotelCountForSelectedFilters: data.HotelCountForSelectedFilters,
  }, 200, origin);
}

async function handleCachedHtml(env, url, origin) {
  const data = await queryCached(env, url);
  const view = buildTeaserView(data);
  const html = Mustache.render(CARDS_TEMPLATE, view);
  return new Response(html, {
    headers: {
      ...corsHeaders(origin),
      'content-type': 'text/html; charset=utf-8',
    },
  });
}

const IMG_BREAKPOINTS = [
  { media: '(min-width: 992px)', x1w: 425, x1h: 239, x2w: 850,  x2h: 478 },
  { media: '(min-width: 768px)', x1w: 446, x1h: 251, x2w: 892,  x2h: 502 },
  { media: '(min-width: 576px)', x1w: 733, x1h: 435, x2w: 1466, x2h: 870 },
  { media: '(min-width: 414px)', x1w: 541, x1h: 304, x2w: 1082, x2h: 608 },
];
const IMG_DEFAULT_W = 380;
const IMG_DEFAULT_H = 213;

function imgVariant(base, w, h) {
  if (!base) return '';
  return `${base}?wid=${w}&hei=${h}&qlt=60&fit=wrap`;
}

function brandClass(brand) {
  if (!brand) return '';
  const first = brand.trim().split(/\s+/)[0].toLowerCase();
  // Common observed mapping: "Luxe Collection" → "luxe". Fall back to first word.
  return first.replace(/[^a-z0-9-]/g, '');
}

function buildTeaserView(data) {
  // Title mirrors Jet2's "Hotels in {Region}" header when results share a region,
  // otherwise falls back to a generic label.
  const regions = new Set(data.Hotels.map((h) => h.Region).filter(Boolean));
  const title =
    regions.size === 1 ? `Hotels in ${[...regions][0]}` : 'Hotels';

  return {
    Title: title,
    HotelCountForSelectedFilters: data.HotelCountForSelectedFilters,
    HasHotels: data.Hotels.length > 0,
    ShowAllLink: '?category=all#tabs%7Cmain:accommodation',
    Hotels: data.Hotels.map((h) => decorateHotel(h)),
  };
}

function decorateHotel(h) {
  const ratingNum = Number.parseFloat(h.StarRating);
  const full = Number.isFinite(ratingNum) ? Math.floor(ratingNum) : 0;
  const plus = Number.isFinite(ratingNum) && ratingNum - full >= 0.5;
  const reviews = h.Rating?.NumberOfReviews ?? h.ReviewCount ?? 0;
  const ksps = Array.isArray(h.KeySellingPoints) ? h.KeySellingPoints : [];

  return {
    Id: h.Id,
    Name: h.Name,
    Url: h.Url,
    Resort: h.Resort,
    Area: h.Area,
    StarRating: h.StarRating,
    StarsFull: Array.from({ length: full }, (_, i) => ({ idx: i + 1 })),
    StarsPlus: plus,
    HasBrand: !!h.Brand,
    Brand: h.Brand,
    BrandClass: brandClass(h.Brand),
    HasReviews: reviews > 0,
    NumberOfReviews: reviews,
    RatingValue: h.Rating?.RatingValue ?? '',
    RatingImageUrl: h.Rating?.RatingImageUrl ?? '',
    HasKeySellingPoints: ksps.length > 0,
    KeySellingPoints: ksps,
    PictureSources: IMG_BREAKPOINTS.map((bp) => ({
      media: bp.media,
      srcset:
        `${imgVariant(h.Image, bp.x1w, bp.x1h)} 1x, ` +
        `${imgVariant(h.Image, bp.x2w, bp.x2h)} 2x`,
    })),
    ImageDefault: imgVariant(h.Image, IMG_DEFAULT_W, IMG_DEFAULT_H),
  };
}

// Icons are inlined so the SSR output is self-contained — no sprite needed on the host page.
// .icon class is intentionally omitted so AEM's decorateIcons doesn't append a 404'ing <img>.
const ICON_PIN = `<span class="icon-pin"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 8a30 30 0 0 0-30 30c0 22.5 30 54 30 54s30-31.5 30-54A30 30 0 0 0 50 8zm0 42a12 12 0 1 1 0-24 12 12 0 0 1 0 24z"/></svg></span>`;
const ICON_STAR = `<span class="icon-star-fill"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5l2.7 5.5 6.1.9-4.4 4.3 1 6L10 15.4l-5.4 2.8 1-6L1.2 7.9l6.1-.9z"/></svg></span>`;

const CARDS_TEMPLATE = `<div class="accommodation-teaser block" data-block-name="accommodation-teaser" data-block-status="initialized"><h2>{{Title}}</h2>{{#HasHotels}}<ul class="cards">{{#Hotels}}<li class="card" data-accommodation-id="{{Id}}"><div class="cards-card-image"><picture>{{#PictureSources}}<source media="{{media}}" srcset="{{srcset}}">{{/PictureSources}}<img loading="lazy" alt="" src="{{ImageDefault}}"></picture>{{#HasBrand}}<span class="cards-card-badge {{BrandClass}}">{{Brand}}</span>{{/HasBrand}}</div><div class="cards-card-body"><div class="cards-card-body-header"><h3><a href="{{Url}}" title="{{Name}}">{{Name}}</a></h3><button class="card-map-btn" aria-label="View {{Name}} on the map">${ICON_PIN}{{Resort}}, {{Area}}</button><div class="accommodation-ratings"><div class="accommodation-star-rating"><span class="star-ratings">{{#StarsFull}}${ICON_STAR}{{/StarsFull}}{{#StarsPlus}}<span class="star-ratings-plus" aria-hidden="true">plus</span>{{/StarsPlus}}<span class="sr-text">{{StarRating}} stars</span></span><p>Our rating</p></div>{{#HasReviews}}<div class="accommodation-rating"><img src="{{RatingImageUrl}}" alt="TripAdvisor rating: {{RatingValue}}"><p>{{NumberOfReviews}} reviews</p></div>{{/HasReviews}}</div></div>{{#HasKeySellingPoints}}<div class="cards-card-body-footer"><ul class="accommodation-features">{{#KeySellingPoints}}<li><p>{{.}}</p></li>{{/KeySellingPoints}}</ul></div>{{/HasKeySellingPoints}}</div></li>{{/Hotels}}</ul><a href="{{ShowAllLink}}" class="button">Show all ({{HotelCountForSelectedFilters}}) and filter options</a>{{/HasHotels}}{{^HasHotels}}<p class="accommodation-teaser-empty">No hotels match the selected filters.</p>{{/HasHotels}}</div>`;

function clampPageSize(raw) {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

function buildWhere(body) {
  const clauses = [];
  const args = [];

  // Combine resorts + predefinedResorts — both filter on resort_id.
  const resortIds = [...body.predefinedResorts, ...body.resorts]
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isFinite(n));
  if (resortIds.length) {
    clauses.push(`hr.resort_id IN (${resortIds.map(() => '?').join(',')})`);
    args.push(...resortIds);
  }

  if (body.areas.length) {
    clauses.push(`h.area IN (${body.areas.map(() => '?').join(',')})`);
    args.push(...body.areas);
  }

  if (body.starRatings.length) {
    const stars = body.starRatings
      .map((v) => Number.parseFloat(v))
      .filter((n) => Number.isFinite(n));
    if (stars.length) {
      clauses.push(`h.star_rating IN (${stars.map(() => '?').join(',')})`);
      args.push(...stars);
    }
  }

  if (body.showVillasOnly === 'True') {
    clauses.push('h.is_villa = 1');
  }

  // boardBasisIds and roomTypeIds aren't stored on the hotel record
  // (they're booking-time attributes), so they're ignored in the cached path.

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    args,
  };
}

function buildOrderBy(hotelOrder) {
  switch (String(hotelOrder)) {
    case '2':
      return 'ORDER BY h.star_rating DESC, h.review_count DESC';
    case '3':
      return 'ORDER BY h.star_rating ASC, h.review_count DESC';
    case '4':
      return 'ORDER BY h.rating_value DESC, h.review_count DESC';
    case '1':
    default:
      return 'ORDER BY h.review_count DESC, h.star_rating DESC';
  }
}

function rowToHotel(r) {
  return {
    Id: r.id,
    Name: r.name,
    Image: r.image,
    Url: r.url,
    Resort: r.resort,
    Area: r.area,
    Region: r.region,
    Brand: r.brand ?? '',
    BrandId: r.brand_id ?? 0,
    StarRating: String(r.star_rating),
    KeySellingPoints: safeJson(r.key_selling_points, []),
    VillaFeatures: safeJson(r.villa_features, []),
    Rating: {
      RatingValue: r.rating_value == null ? '' : String(r.rating_value),
      RatingImageUrl: r.rating_image_url ?? '',
      NumberOfReviews: r.review_count ?? 0,
      Jet2HotelId: r.id,
      Awards: safeJson(r.awards, []),
      Jet2Awards: safeJson(r.jet2_awards, []),
    },
    ReviewCount: r.review_count ?? 0,
    IsVilla: !!r.is_villa,
  };
}

function safeJson(text, fallback) {
  if (text == null || text === '') return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function json(payload, status = 200, origin) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(origin),
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

// Allow the deployed AEM live/page hosts for this project, plus DA editor and
// localhost dev. Pattern matches main--<repo>--<owner>.aem.{live,page} so
// branch previews work too.
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-z0-9-]+--j2-da-blocks--cpilsworth\.aem\.(live|page)$/i,
  /^https:\/\/(?:[a-z0-9-]+\.)?da\.live$/i,
  /^http:\/\/localhost(?::\d+)?$/i,
];

function isAllowedOrigin(origin) {
  return !!origin && ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

function corsHeaders(origin) {
  const allowOrigin = isAllowedOrigin(origin) ? origin : '*';
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    'access-control-allow-headers':
      'content-type, x-forwarded-cookie, x-forwarded-user-agent',
    vary: 'Origin',
  };
}
