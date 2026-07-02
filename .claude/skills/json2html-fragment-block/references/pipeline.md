# json2html + BYOM pipeline — mechanics

Read this when you need to understand *why* the rules in SKILL.md exist, or when
debugging something the procedure didn't cover.

## The chain, in detail

1. **json2html worker** (`json2html.adobeaem.workers.dev`) holds a per-branch
   config: an array of `{path, endpoint, regex, template, ...}`. On a request it
   matches `path`, extracts an id from the URL with `regex`, substitutes it into
   `endpoint` (`{{id}}`), fetches that JSON, fetches `template`, renders them with
   a dependency-free mustache, and returns HTML.
   - Serves at `https://json2html.adobeaem.workers.dev/<org>/<site>/<branch>/<path>`.
   - Errors are plain text and explicit — `Failed to fetch endpoint data: 520`
     means it matched + extracted the id fine but the *endpoint* fetch failed.

2. **BYOM overlay**: the site config points at the worker as a `markup` source.
   When AEM `preview` hits a path with no authored doc, it falls through to the
   overlay, fetches the worker HTML, and runs it through **helix-html2md** to
   extract semantic content into the content bus. From then on it's a normal
   previewed page (served at `.aem.page`/`.aem.live`, `.plain.html` available).

3. **The `fragment` block** (`blocks/fragment/fragment.js`) fetches
   `<path>.plain.html`, sets it as a `<main>`, then runs `decorateMain` +
   `loadSections` — so a fragment is decorated exactly like a normal page, and
   **any block inside it loads and runs its JS/CSS**. Fragments can contain
   blocks; that was never the constraint.

## html2md is the lossy step — the crux

html2md converts HTML → markdown → (later) HTML. What survives:

| Emitted | After html2md |
|---|---|
| `<div class="x">` → `<div>` rows → `<div>` cells | **preserved** (block table), outer class kept |
| `<div class="x"><ul><li>…` | **flattened** to a plain `<ul>` — block class + inner classes gone |
| block-internal classes (`x-foo`) | **stripped** |
| text / `<a>` / `<picture>` / `<img>` in a cell | preserved |
| multiple `<p>` in a cell | preserved (use for lists-in-a-cell) |
| `<input>`, `<label>`, arbitrary interactive markup | stripped |
| absolute external image URL | **localized** to the media bus as an optimized `<picture>` |
| root-relative image URL | needs `relativeURLPrefix` to first become absolute |

So: model a block as a table. One row per item, one datum per cell, fixed cell
count. The block JS re-reads cells **by position** and rebuilds the real DOM +
classes. This is why hotels, things-to-do and local-weather all decorate by index.

## Selecting one item from the data

- `{{id}}` is substituted **only in the endpoint URL**, never exposed to the
  template. (Verified: a template `{{id}}` renders empty.)
- Without `arrayKey`, the template receives the whole JSON as root context, so
  `{{#data}}…{{/data}}` iterates an array field.
- `arrayKey` + `pathKey` filters the array — but `pathKey` matches the item field
  against the **full request path** (e.g. `/fragments/local-weather/algarve`),
  *not* the regex-extracted id. Only useful when a data field literally holds that
  path.
- EDS spreadsheets (`data/*.json`) do **not** filter by query param.

Consequences:
- **Per-item data available at a URL?** Use a dynamic `endpoint` with `{{id}}`
  (hotels: `.../hotels/by-path/{{id}}`). Cleanest; works embedded.
- **Static all-in-one lookup table (short-slug keyed)?** You cannot filter
  server-side. Render the whole array as rows and pick the item in the block —
  e.g. by the URL slug (local-weather). Caveat: a standalone preview of
  `/fragments/x/algarve` gets *all* rows (identical for every id), so per-id
  differentiation only happens client-side; for true per-id routing you need a
  dynamic endpoint.
- **Origin blocks server-side fetches?** (e.g. bot-protected sites return 520 to
  the worker.) Mirror the JSON into the code bus at a repo path and point the
  endpoint there (things-to-do does this with `/pois/<id>.json`).

## Mustache is logic-less

No arithmetic, no conditionals beyond section presence, no filtering an array by a
variable. Anything computed — bar heights ∝ value, star counts, deriving labels —
happens in the block JS. Emit the raw values in cells; compute the view in JS.

## Icons

`decorateIcons` swaps `<span class="icon icon-x">` for `<img src="/icons/x.svg">`
during `decorateMain`, which runs **before** block JS. An `<img>`-embedded SVG
can't be recoloured by CSS `color`. Two reliable options:
- Create an empty `<span class="icon-x">` in the block JS and paint it with a CSS
  `mask`: `mask: url("/icons/x.svg") center/contain no-repeat; background: <color>`.
- Inline the SVG markup directly in the block JS (best when the icon isn't in
  `/icons/` — e.g. the weather sun).

## Config POST replaces the whole array

`POST /config/<org>/<site>/<branch>` overwrites the config. GET it first, keep the
existing entries, add yours. A single-entry POST silently wipes the rest — which
breaks *their* re-preview (existing previewed pages keep working off the content
bus until re-previewed, so the breakage is invisible until then).
