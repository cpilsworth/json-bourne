#!/usr/bin/env node
// Paginates the Jet2holidays accommodation API per resort_id, collects every
// hotel, and emits SQL upserts to scripts/seed.sql. Run with:
//   node scripts/scrape.mjs                            # default: Algarve
//   node scripts/scrape.mjs 573,575,577                # custom resort IDs
//   J2_DELAY_MS=4000 node scripts/scrape.mjs           # tune delay
//
// After scraping, apply with:
//   wrangler d1 execute j2api-cache --remote --file=scripts/seed.sql

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const ENDPOINT = 'https://www.jet2holidays.com/api/jet2/hotels/getfilteredhotels';
const PAGE_SIZE = 10;
const DELAY_MS = Number.parseInt(process.env.J2_DELAY_MS ?? '3000', 10);
const MAX_PAGES_PER_RESORT = 50; // safety cap (≈500 hotels per resort)

// Algarve predefined resorts captured from the destination page.
const DEFAULT_RESORTS = [
  573, 575, 577, 578, 2153, 579, 2245, 1845, 1624, 2046, 1835, 2246, 2247,
  580, 581, 1846, 1621, 582, 1306, 583, 586, 1291, 2129, 587, 588, 1590,
  1879, 2248, 589, 590, 2249, 2093, 592,
];

const resortIds = (process.argv[2] ?? '')
  .split(',')
  .map((s) => Number.parseInt(s.trim(), 10))
  .filter(Number.isFinite);
const resorts = resortIds.length ? resortIds : DEFAULT_RESORTS;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sqlString(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlNumber(v) {
  if (v == null || v === '') return 'NULL';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : 'NULL';
}

async function fetchPage(resortId, page) {
  const body = {
    areas: [],
    boardBasisIds: [],
    roomTypeIds: [],
    starRatings: [],
    resorts: [],
    hotelOrder: '1',
    page,
    predefinedResorts: [String(resortId)],
    showVillasOnly: 'False',
  };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
      referer: 'https://www.jet2holidays.com/',
      origin: 'https://www.jet2holidays.com',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Upstream ${res.status} for resort ${resortId} p${page}`);
  return res.json();
}

const hotels = new Map(); // id → hotel
const memberships = new Set(); // `${hotel_id}:${resort_id}`

let totalRequests = 0;
const startedAt = Date.now();

for (const resortId of resorts) {
  let collected = 0;
  let expected = null;

  for (let page = 0; page < MAX_PAGES_PER_RESORT; page++) {
    if (totalRequests > 0) await sleep(DELAY_MS);
    totalRequests++;

    let data;
    try {
      data = await fetchPage(resortId, page);
    } catch (err) {
      console.error(`  ! ${err.message} — retrying in ${DELAY_MS * 2}ms`);
      await sleep(DELAY_MS * 2);
      data = await fetchPage(resortId, page);
    }

    expected = expected ?? data.HotelCountForSelectedFilters ?? 0;
    const pageHotels = data.Hotels ?? [];
    for (const h of pageHotels) {
      hotels.set(h.Id, h);
      memberships.add(`${h.Id}:${resortId}`);
    }
    collected += pageHotels.length;

    process.stdout.write(
      `  resort ${resortId} page ${page}: +${pageHotels.length} (${collected}/${expected})\n`,
    );

    if (pageHotels.length === 0 || collected >= expected) break;
  }
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(
  `\nScraped ${hotels.size} unique hotels, ${memberships.size} (hotel,resort) pairs ` +
    `in ${totalRequests} requests (${elapsed}s).`,
);

// Emit SQL (D1 wraps each --file execute in its own transaction, so no BEGIN here)
const lines = [];

for (const h of hotels.values()) {
  const cols = [
    'id', 'name', 'image', 'url', 'resort', 'area', 'region',
    'brand', 'brand_id', 'star_rating',
    'key_selling_points', 'villa_features',
    'rating_value', 'rating_image_url', 'review_count',
    'awards', 'jet2_awards',
    'is_villa', 'updated_at',
  ];
  const vals = [
    sqlNumber(h.Id),
    sqlString(h.Name),
    sqlString(h.Image),
    sqlString(h.Url),
    sqlString(h.Resort),
    sqlString(h.Area),
    sqlString(h.Region),
    sqlString(h.Brand ?? ''),
    sqlNumber(h.BrandId ?? 0),
    sqlNumber(h.StarRating),
    sqlString(JSON.stringify(h.KeySellingPoints ?? [])),
    sqlString(JSON.stringify(h.VillaFeatures ?? [])),
    sqlNumber(h.Rating?.RatingValue),
    sqlString(h.Rating?.RatingImageUrl ?? ''),
    sqlNumber(h.ReviewCount ?? h.Rating?.NumberOfReviews),
    sqlString(JSON.stringify(h.Rating?.Awards ?? [])),
    sqlString(JSON.stringify(h.Rating?.Jet2Awards ?? [])),
    h.IsVilla ? '1' : '0',
    `(unixepoch())`,
  ];
  lines.push(
    `INSERT INTO hotels (${cols.join(',')}) VALUES (${vals.join(',')}) ` +
      `ON CONFLICT(id) DO UPDATE SET ` +
      cols
        .filter((c) => c !== 'id')
        .map((c) => `${c}=excluded.${c}`)
        .join(',') +
      ';',
  );
}

for (const pair of memberships) {
  const [hotelId, resortId] = pair.split(':');
  lines.push(
    `INSERT INTO hotel_resorts (hotel_id, resort_id) VALUES (${hotelId}, ${resortId}) ` +
      `ON CONFLICT(hotel_id, resort_id) DO NOTHING;`,
  );
}

const outPath = 'scripts/seed.sql';
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, lines.join('\n') + '\n');
console.log(`Wrote ${outPath} (${lines.length} statements).`);
