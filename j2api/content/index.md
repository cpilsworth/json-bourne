# json-bourne

A walk-through of how a request for `/hotels/portugal/algarve/vilamoura` becomes a rendered page on this site. Five layers, each owning one job.

## The layers

### 1. D1 database

A Cloudflare D1 (SQLite) database holds the canonical hotel catalogue: name, brand, image, star rating, review count, country (`region`), area, resort, key selling points, and a few booking-time attributes. ~444 hotels at the time of writing, harvested from the Jet2holidays upstream and cached locally so we never call the live booking API at render time.

### 2. JSON API — `j2api` Cloudflare Worker

Reads D1 and exposes a small set of HTTP endpoints at `https://j2api.cpilsworth.workers.dev`:

- `GET /api/jet2/hotels/getcachedhotels` — raw JSON matching the upstream Jet2 shape.
- `GET /view/jet2/hotels/getcachedhotels` — the same data **decorated for the template** (precomputed star arrays, responsive `<picture>` srcsets, brand class names, etc.).
- `GET /view/jet2/hotels/by-path/{country}[/{region}[/{resort}]]` — the path-based variant. The handler slugifies stored place names ("Olhos D'Agua (Albufeira)" → `olhos-dagua-albufeira`) so URL slugs match without a separate slug column.
- `GET /templates/cards-page.mustache` — the Mustache template, served as plain text.
- `GET /reference.json` — filter taxonomies for the URL builder UI.

The view endpoint is deliberately separate from the raw JSON: AEM Live's renderer needs data already shaped for the template, not the upstream wire format.

### 3. json2html worker

[`adobe/helix-json2html`](https://github.com/adobe/helix-json2html) is a generic Adobe-hosted worker that fetches a JSON endpoint, fetches a Mustache template, renders them together, and returns HTML. Its config for this site lives at `https://json2html.adobeaem.workers.dev/config/cpilsworth/json-bourne/main` and looks like:

```json
[{
  "path": "/hotels/",
  "regex": "/(?<=\\/hotels\\/).+$/",
  "endpoint": "https://j2api.cpilsworth.workers.dev/view/jet2/hotels/by-path/{{id}}",
  "template": "https://j2api.cpilsworth.workers.dev/templates/cards-page.mustache"
}]
```

The lookbehind regex captures everything after `/hotels/` — json2html substitutes that into `{{id}}` and fetches the j2api view endpoint. One gotcha worth knowing: json2html uses `match()[0]` (the whole match), **not capture groups**, so the regex must match exactly the substring you want, not just contain it.

### 4. AEM Live preview overlay

The json-bourne site config has an overlay pointing at the json2html worker:

```json
"overlay": {
  "type": "markup",
  "url": "https://json2html.adobeaem.workers.dev/cpilsworth/json-bourne/main"
}
```

When AEM admin previews a path that doesn't exist in DA — `/hotels/portugal/algarve/vilamoura`, say — it falls through to the overlay, fetches the HTML there, runs it through `helix-html2md` to extract semantic content into the content bus, and stores the page. From then on the path is a normal previewed page.

### 5. Edge Delivery Services (EDS)

`main--json-bourne--cpilsworth.aem.page` serves the previewed pages. The boilerplate JS (`scripts/aem.js`) rewrites images to the optimized media pipeline, decorates icons, and renders authored blocks. For the hotel pages the result is the same DOM as if an author had typed the cards into the document — except the data came from D1 via four hops.

## Why this shape

- **The database stays canonical.** Whenever the cached catalogue is refreshed, every preview regenerates against fresh data on the next preview action.
- **Pages aren't pre-built.** There are 444 hotels and 28 resort slugs; we don't need to ship a static page per combination. Any path under `/hotels/{country}/{region}/{resort}` materializes on demand.
- **The template lives with the data shape.** Both `view` JSON and `cards-page.mustache` are served by the same worker, so they can't drift out of sync with a deploy.
- **html2md is the lossy step.** Block classes and data attributes don't survive — the page wrapper template uses standard HTML (`<h1>`, `<ul>`, `<picture>`) so html2md preserves the content even if it strips the block wrappers.

## Try it

- [Portugal (all)](/hotels/portugal)
- [Algarve (all)](/hotels/portugal/algarve)
- [Vilamoura](/hotels/portugal/algarve/vilamoura) — 59 hotels
- [Montegordo](/hotels/portugal/algarve/montegordo) — 5 hotels
- [Castelo (Albufeira)](/hotels/portugal/algarve/castelo-albufeira) — 16 hotels
