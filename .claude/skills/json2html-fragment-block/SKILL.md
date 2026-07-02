---
name: json2html-fragment-block
description: >-
  Turn a JSON data source into an AEM Edge Delivery fragment rendered by a real
  block, using the json2html overlay worker. Use this whenever the task is
  "render this JSON/API/spreadsheet as cards/a chart/a list on the site",
  "make a fragment from <data URL>", "wire <endpoint> through json2html", or
  any data-source → EDS-page pipeline on this project (hotels, things-to-do,
  local-weather all follow it). Also use when a json2html-backed fragment
  renders as unstyled default content, images 404, or a `/fragments/*` or
  `/hotels/*` path 404s after a template change — those are this pipeline's
  known failure modes. Covers the mustache template, json2html config, preview,
  and the decorating block JS/CSS.
---

# JSON data source → json2html → fragment with block

This project renders JSON data as native EDS pages without authoring them by
hand. The chain is:

**data source (JSON)** → **json2html worker** (fetches JSON + a mustache
template, returns HTML) → **AEM preview / BYOM overlay** (runs the HTML through
html2md into the content bus) → **EDS page** served at a `/fragments/...` (or
`/hotels/...`) path, embeddable via the `fragment` block → **a block** decorates
the result client-side.

The single most important consequence: **the HTML your template emits is not the
HTML that reaches the browser.** html2md normalizes it. Everything below exists
because of that. Read `references/pipeline.md` for the deep mechanics; this file
is the working procedure.

## Project coordinates

- org / site: `cpilsworth` / `json-bourne`; live host `main--json-bourne--cpilsworth.aem.{page,live}`
- json2html worker: `https://json2html.adobeaem.workers.dev`
- Admin token: `HLX_TOKEN` in `.env` (get/refresh via the `hlx-auth-token` skill; ~8h TTL)
- Templates live in the repo at `/templates/<name>.html` (served from the code bus)
- Blocks live at `/blocks/<name>/` as usual

## The five rules that make or break this (learned the hard way)

1. **Emit block-table markup, never `<ul>/<li>`.** html2md preserves a block only
   when it's `<div class="blockname">` → `<div>` rows → `<div>` cells. A block
   containing a list gets *flattened to plain default content* (all classes
   gone). Cards, charts, anything — model each item as a row of cells.

2. **Only the outer block class survives; decorate by position.** Inside the
   block, class names and wrapper divs are stripped. So the block JS reads
   `cells[0], cells[1], …` by index, not by class. Keep the cell order fixed
   across rows (emit empty `<div></div>` for absent fields) so positions are
   stable.

3. **json2html auth uses `authorization: token <jwt>`, not `Bearer`.** And a
   config POST **replaces the entire config array** — always re-POST *all*
   entries, or you'll wipe the others (this silently breaks their re-preview).

4. **json2html uses the full regex match (`match[0]`), not a capture group.**
   The regex must match *exactly* the id, and must survive the `.plain.html`
   suffix that the `fragment` block appends. A lookahead like
   `/\d+(?=\.plain\.html$|$)/` or `/[a-z0-9-]+(?=\.plain\.html$|$)/` is the
   reliable shape. Note a naive `/(\d+)/` grabs the first digit run anywhere in
   the path (e.g. the `2` in a branch name) — anchor to the end.

5. **Build icons and any computed layout in the block JS, not the template.**
   Mustache is logic-less (no arithmetic, no filtering an array by a variable).
   Bar heights, star counts, etc. are computed in JS. For icons, create empty
   `<span class="icon-…">` and colour them with a CSS `mask` using the SVG —
   `decorateIcons` runs *before* block JS so you can't rely on it, and an
   `<img>`-embedded SVG can't be recoloured by CSS. Or inline the SVG directly.

## Workflow

Work in this order — **prove the pipeline before writing the block**, because you
must see what html2md actually preserves before you can decorate it.

### 1. Understand the data source
Fetch the JSON. Identify the fields you need and the id that selects one item.
Two data shapes, two strategies:
- **Dynamic endpoint** (preferred): the endpoint URL takes the id and returns
  exactly that item, e.g. `.../hotels/by-path/{{id}}`. Clean; works standalone
  and embedded.
- **Static all-in-one** (e.g. an EDS spreadsheet `data/*.json` keyed by a short
  slug): the endpoint returns everything. json2html can't filter it —
  `{{id}}` is **not** exposed to the template, `arrayKey`/`pathKey` matches the
  field against the *full request path* (not the extracted id), and sheets don't
  filter by query param. So render the whole array as block rows and have the
  block pick the item (e.g. by URL slug). See the local-weather example.

### 2. Write the template → `/templates/<name>.html`
Emit block-table markup. Use the worked examples in `templates/` as the shape.
Absolute image URLs are auto-localized to the media bus by html2md; root-relative
ones need `relativeURLPrefix` in the config.

### 3. Push, then register the json2html config
Commit + push the template (it's served from the code bus — confirm it 200s at
`.../templates/<name>.html` before configuring). Then POST the config with **all**
entries. Read the current config first so you don't drop any:
```bash
HLX=$(grep '^HLX_TOKEN=' .env | cut -d= -f2)
curl -s "https://json2html.adobeaem.workers.dev/config/cpilsworth/json-bourne/main" \
  -H "authorization: token $HLX"        # <- copy existing entries, add yours
curl -s -X POST "https://json2html.adobeaem.workers.dev/config/cpilsworth/json-bourne/main" \
  -H "authorization: token $HLX" -H 'content-type: application/json' \
  -d '[ ...all entries... ]'
```
Config entry fields: `path`, `endpoint` (with `{{id}}`), `regex`, `template`,
optional `relativeURLPrefix`.

### 4. Verify the worker, then preview
Hit the worker directly first — it renders synchronously and its errors are
explicit:
```bash
curl "https://json2html.adobeaem.workers.dev/cpilsworth/json-bourne/main<path><id>"
```
A `520`/`404` here is the *endpoint fetch* failing (bot-blocked origin, wrong
URL). Fix that before previewing. Then preview to pull it into EDS:
```bash
curl -X POST "https://admin.hlx.page/preview/cpilsworth/json-bourne/main<path><id>" \
  -H "authorization: token $HLX"
```

### 5. Inspect what survived, THEN write the block
Fetch the previewed `.plain.html` and look at the real structure:
```bash
curl "https://main--json-bourne--cpilsworth.aem.page<path><id>.plain.html"
```
Confirm `class="<name>"` is present and count the cells per row. Write
`blocks/<name>/<name>.js` (`export default function decorate(block)`) and
`.css` against *that* structure — decorate by position. Test the block against
the real `.plain.html` locally before shipping (a static HTML harness + the
block JS/CSS is enough). Push; block JS/CSS deploy via code-sync and decorate
client-side — **no re-preview needed** for block/CSS changes (only for template
changes).

### 6. Re-preview after template changes
Any edit to the template or the pipeline means the previewed content is stale —
re-preview affected paths. If images come back as `about:error`, that's the
origin rate-limiting the pipeline's image fetch; just re-preview (it clears).

## Worked examples in this repo

- **hotels** — dynamic endpoint (j2api view), block-table, cards. `templates/hotels.html`, `blocks/hotel-cards/`.
- **things-to-do** — code-bus JSON (mirrored because the origin blocks server fetches), `blocks/things-to-do/`.
- **local-weather** — static spreadsheet, block picks the resort by URL slug and computes a bar chart. `templates/local-weather.html`, `blocks/local-weather/`. Reference design: the "Local weather" chart on jet2holidays destination pages.

`templates/local-weather.example.html` in this skill is a minimal, copyable
starting point.

## Auth failure modes
- `401`/`Unauthorized` from json2html or admin → the `HLX_TOKEN` expired; refresh
  via the `hlx-auth-token` skill and retry.
- Reading the token out of browser network traffic is blocked in auto mode; have
  the user paste it or complete the SSO, then write it to `.env`.
