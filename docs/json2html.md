# json2html — data-driven fragments

How this site turns JSON data sources into native Edge Delivery pages, without
authoring them by hand. Three features use it today: **hotels**, **things to
do**, and **local weather**.

> This folder is excluded from the code bus via `.hlxignore` (`docs/*` and the
> existing `*.md`), so nothing here is served on the site.

## The pipeline

```
data source (JSON)
  → json2html worker        fetch JSON + a mustache template, render → HTML
  → AEM preview / BYOM overlay   run HTML through html2md into the content bus
  → EDS page                 served at /fragments/… (or /hotels/…), embeddable
  → block                    decorates the result client-side (blocks/<name>/)
```

The load-bearing fact: **the HTML the template emits is not the HTML that
reaches the browser** — `html2md` normalizes it on the way into the content
bus. Every rule below follows from that.

- **json2html worker:** `https://json2html.adobeaem.workers.dev`
- **org / site:** `cpilsworth` / `json-bourne`
- **live host:** `main--json-bourne--cpilsworth.aem.{page,live}`
- **templates:** in this repo at `/templates/<name>.html` (served from the code bus)
- **blocks:** `/blocks/<name>/` as usual

## The configuration (what gets POSTed)

json2html holds a **per-branch** config: an array of route objects. The current
`main` config is:

```json
[
  {
    "path": "/hotels/",
    "regex": "/(?<=\\/hotels\\/).+$/",
    "endpoint": "https://j2api.cpilsworth.workers.dev/view/j2/hotels/by-path/{{id}}",
    "template": "/templates/hotels.html"
  },
  {
    "path": "/fragments/things-to-do/",
    "regex": "/\\d+(?=\\.plain\\.html$|$)/",
    "endpoint": "https://main--json-bourne--cpilsworth.aem.live/pois/{{id}}.json",
    "template": "/templates/things-to-do.html",
    "relativeURLPrefix": "https://www.jet2holidays.com"
  },
  {
    "path": "/fragments/local-weather/",
    "regex": "/[a-z0-9-]+(?=\\.plain\\.html$|$)/",
    "endpoint": "https://main--json-bourne--cpilsworth.aem.live/data/weather/portugal.json",
    "template": "/templates/local-weather.html"
  }
]
```

### Posting / updating it

```bash
# HLX_TOKEN is an admin.hlx.page token (get/refresh via the hlx-auth-token skill)
HLX=$(grep '^HLX_TOKEN=' .env | cut -d= -f2)

# 1. READ the current config first — a POST REPLACES THE WHOLE ARRAY.
curl -s "https://json2html.adobeaem.workers.dev/config/cpilsworth/json-bourne/main" \
  -H "authorization: token $HLX"

# 2. POST the full array (existing entries + your new one).
curl -s -X POST "https://json2html.adobeaem.workers.dev/config/cpilsworth/json-bourne/main" \
  -H "authorization: token $HLX" \
  -H 'content-type: application/json' \
  -d '[ ...all entries... ]'
```

Two things that will bite you:
- **Auth scheme is `authorization: token <jwt>`, not `Bearer`.** A `Bearer`
  header returns `401`.
- **A POST replaces the entire config array.** Always GET first and re-post all
  entries — a single-entry POST silently wipes the others. (Existing previewed
  pages keep working off the content bus until re-previewed, so the breakage is
  invisible until then.)

### Config field reference

| field | meaning |
|---|---|
| `path` | URL prefix this route matches (after the `/org/site/branch` part). |
| `endpoint` | JSON data URL. `{{id}}` is substituted from the `regex` match. |
| `regex` | Extracts the id from the request URL. json2html uses the **full match** (`match[0]`), *not* a capture group — the regex must match *exactly* the id. Anchor to the end and allow the `.plain.html` suffix the `fragment` block appends, e.g. `/\d+(?=\.plain\.html$|$)/`. A naive `/(\d+)/` grabs the first digit run anywhere in the path (e.g. the `2` in a branch name). |
| `template` | Repo-relative path to the mustache template on the code bus. |
| `relativeURLPrefix` | Optional. Prefixes root-relative asset URLs (`/…`) so html2md can localize them. Absolute URLs are localized without it. |

`{{id}}` is available **only in `endpoint`** — it is *not* exposed to the
template. `arrayKey`/`pathKey` exist but match a data field against the **full
request path**, not the extracted id, so they only help when a field literally
holds that path (rarely). See per-fragment notes for how each route selects its
item.

## Template pattern — emit a block-table

`html2md` preserves a block **only** when it's `<div class="blockname">` →
`<div>` rows → `<div>` cells. A block containing a `<ul>/<li>` gets *flattened*
to plain default content (all classes gone). So model each item as a **row of
cells**, one datum per cell, with a fixed cell count across rows (emit empty
`<div></div>` for absent fields so cell positions stay stable). Mustache is
logic-less: emit raw values; compute the view (bar heights, star counts) in the
block. See `/templates/*.html`.

## Block pattern — decorate by position

Inside the block, class names and wrapper divs are stripped by html2md — **only
the outer block class survives**. So the block reads `cells[0]`, `cells[1]`, …
by index, not by class, and rebuilds the real DOM. Icons: create empty
`<span class="icon-…">` and colour them with a CSS `mask` (`decorateIcons` runs
before block JS, and an `<img>`-embedded SVG can't be recoloured), or inline the
SVG. See `/blocks/{hotel-cards,things-to-do,local-weather}/`.

## Per-fragment notes

| feature | route | data source | item selection | block |
|---|---|---|---|---|
| **Hotels** | `/hotels/{country}/{region}/{resort}` | j2api view worker (dynamic) | `endpoint` `{{id}}` returns exactly that resort's hotels | `blocks/hotel-cards` |
| **Things to do** | `/fragments/things-to-do/{poi-id}` | code-bus JSON `/pois/{id}.json` | `endpoint` `{{id}}` picks the file (mirrored to the code bus because the live jet2 origin blocks server-side fetches — returns 520) | `blocks/things-to-do` |
| **Local weather** | `/fragments/local-weather/{resort}` | code-bus spreadsheet `/data/weather/portugal.json` (static, all resorts) | can't filter server-side, so the template renders the whole sheet and the block picks the resort by URL slug | `blocks/local-weather` |

## Preview workflow

Templates and blocks are code — commit + push, and confirm the template 200s at
`…/templates/<name>.html` before configuring. Then:

```bash
# render check — the worker is synchronous and its errors are explicit
curl "https://json2html.adobeaem.workers.dev/cpilsworth/json-bourne/main<path><id>"
#   "Failed to fetch endpoint data: 520/404" => the ENDPOINT fetch failed

# pull it into EDS
curl -X POST "https://admin.hlx.page/preview/cpilsworth/json-bourne/main<path><id>" \
  -H "authorization: token $HLX"

# inspect what html2md kept, then write/adjust the block against THAT structure
curl "https://main--json-bourne--cpilsworth.aem.page<path><id>.plain.html"
```

- **Re-preview after any template change** (previewed content goes stale).
  Block/CSS changes decorate client-side and need no re-preview.
- **Images** come back as `about:error` when the origin rate-limits the
  pipeline's image fetch — just re-preview; it clears.
- **Bulk previews get throttled.** Rapid preview POSTs in a tight loop hang;
  space them out (a short `sleep` between calls) — individual and read-only GET
  calls are always fast.
- **`401`** from json2html or admin ⇒ the `HLX_TOKEN` expired; refresh via the
  `hlx-auth-token` skill.

## See also

The `json2html-fragment-block` skill (`.claude/skills/`) automates this
end-to-end and carries the same rules with worked examples.
