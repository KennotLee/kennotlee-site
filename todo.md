# Editing the "line map" (`.prereq-map`) — where things live

You said the line map isn't behaving when you adjust it by hand. This is a
map of exactly which block in `stylesheets/style.css` controls which visual
piece, plus the one thing that's most likely biting you: several pixel
offsets in the branch code are **hand-derived from the dot/label size, not
CSS variables** — change the size and those numbers silently go stale.

## Where each visual piece lives (`stylesheets/style.css`)

| What you want to change | Edit here |
|---|---|
| Per-theme cartography (dot size/shape, line thickness, ring) for the CURRENT city theme | `:root` block, lines 61–68 (`--prereq-dot-width/height/radius/border/fill/ring`, `--prereq-line-height`) |
| Same, but for a specific city (NYC/Chicago/Tokyo/Seoul) | Each `html[data-city-theme="..."]` block, ~lines 109–186 — these OVERRIDE the `:root` defaults above, only for that theme |
| The station box itself (size, gap, hover) | `.prereq-station`, line 973 |
| The dot/circle | `.prereq-dot`, line 1048 |
| The connecting line between two plain stations | `.prereq-map > .prereq-station:not(:last-child)::after`, line 1001 (and the matching `:first-child::before` / `:last-child::after` end-caps just below it) |
| Grayed "already done" styling | `.prereq-station.prereq .prereq-dot` / `.prereq-station.prereq .prereq-label`, lines ~1063–1069 |
| "You are here" (current) styling | `.prereq-station.current .prereq-dot`, line ~1075 |
| Hover animation | `a.prereq-station:hover .prereq-dot`, line ~1103 (just fixed — see note below) |
| The OR-branch merge shape (the curved turnout) | `>>> BRANCH CODE START <<<`, line 1112 onward — `.prereq-branch`, `.prereq-branch-arm-top/bottom`, `.prereq-branch-curve-top/bottom` |

## The fragile part: branch geometry uses hardcoded numbers

`.prereq-branch`'s curve math (lines ~1155–1223) is derived from one
assumption, spelled out in the comment right above `.prereq-branch` (line
~1110): with the *default* dot height (28px) + label (16px line-height) +
station gap (8px), the merge point sits at `dot-height + 19px` from the
branch's top. That `19` and the `24` next to it are **plain numbers typed
into the CSS**, not `calc()`'d from the variables that actually produce
them (`--prereq-dot-height`, the label's `line-height: 16px` on line 1083,
the station's `gap: 8px` on line 973).

So: if you change `--prereq-dot-height` for a theme, or the label's
font/line-height, or the station's gap, **the branch's curve will stop
lining up with the dots** — that's almost certainly what "not working"
looks like. To fix it properly you'd need to either:
- keep dot-height/label-height/gap the same across all themes that use
  `.prereq-branch` (simplest — don't touch those three for now), or
- turn `19px`/`24px` into `calc()` expressions built from the same three
  variables (bigger change, not done yet).

## Just fixed for you

`a.prereq-station:hover` used to `transform: translateY(-4px)` on the
**whole station**, which also dragged that station's own connector-line
pseudo-element up with it (the connector is `::after`/`::before` on the
station itself), kinking the line right at whichever station you hovered.
Now only `.prereq-dot` lifts on hover — the line stays put. See the comment
right above `a.prereq-station:hover .prereq-dot` (~line 1103).

## If you outgrow hand-placed HTML+SVG diagrams

The gallery pages (`pages/prereq-styles.html`, `pages/prereq-tree-styles.html`,
`pages/prereq-branch-themed.html`) all use the same trick: draw connector
lines in inline SVG, then position node boxes/labels as separate
absolutely-positioned HTML elements at hand-computed pixel coordinates. This
has caused the SAME class of alignment bug twice now (SVG `viewBox` not
matching its container's real rendered size scales one coordinate space but
not the other; a wrapper element sized to its own content has nothing left to
scroll). Both are fixed now, but the underlying reason they keep recurring is
structural: **every node lives in two coordinate systems that have to be kept
in sync by hand** — nothing enforces that a line's endpoint and a box's
`left`/`top` agree, so any future edit (adding a node, changing spacing) is
another chance to drift.

This is fine for a small, static, one-off comparison gallery (a handful of
nodes, never edited again). It stops being fine once the plan is "one
diagram per module, for every module you take" — that's dozens of diagrams,
each needing its own hand-typed coordinate table, and every one of them is
another chance for the same drift bug. **This is a genuinely different job
from the gallery pages and calls for a different tool**, for one specific
reason spelled out below.

### The actual fix isn't a prettier library, it's separating DATA from RENDERING

Right now, a course's prerequisite structure IS the HTML — "EE1111A needs
CS1010E" only exists as a `<div>` at `left: 40px` next to another `<div>` at
`left: 220px`. To add a module you hand-write more positioned divs; to
restyle everything you re-derive every diagram's coordinates by hand (which
is exactly what happened across this session). The moment you want this
"for so many modules," the thing that actually needs to exist is a plain
DATA file — one JSON object per module, just its code and its prerequisite
codes:

```json
{
  "CS2040": { "name": "Data Structures and Algorithms", "prereqs": ["CS1010"] },
  "CS2030": { "name": "Programming Methodology II", "prereqs": ["CS1010"] },
  "CS3230": { "name": "Design and Analysis of Algorithms", "prereqs": ["CS2040", "CS2030"] }
}
```

Once the DATA exists separately from the picture, ANY of the tools below can
walk it and draw the diagram automatically — new module, edit the JSON, done,
no coordinates touched by hand ever again. This is the actual scalability
fix; which rendering library you pick matters much less than this one
decision.

### Where the data could come from — you may not need to type it at all

NUSMods (nusmods.com, the site this whole subway theme is riffing on)
publishes its module data as a free public JSON API at `api.nusmods.com` —
every module's prerequisites are already in there in a structured form. For
NUS modules specifically, this could mean fetching real prerequisite data
client-side (a plain `fetch()`, no backend needed, fits a static site fine)
instead of hand-typing a JSON file for every module you take. Worth checking
before hand-authoring any data at all.

### Picking a rendering tool

All three of these ship a plain `<script src="...">` build usable straight
off a CDN — no bundler, no npm install, no build step needed, the same way
`index.html`/`pages.html` already pull in Vue from unpkg. None of them
require touching the dormant Vite/`package.json` scaffolding this repo still
has lying around.

| Tool | What it's for | Trade-off |
|---|---|---|
| **D3.js** (recommended — see below) + a hierarchy/DAG layout (`d3-hierarchy`, or `d3-dag`/`dagre` for real DAGs, since prereqs can diamond — two courses sharing a common prerequisite two levels up — not just branch cleanly like a tree) | D3 computes node positions from your data but renders into PLAIN SVG/HTML elements that you give whatever classes you want — meaning it can draw using the site's EXISTING `.prereq-dot`/`.prereq-station`/`.prereq-label` classes. The city-theme + dark-mode system keeps working with zero extra code, since it's the same CSS cascading onto the same class names, just generated instead of hand-typed. Also has first-class, well-documented transitions/animation (`d3-transition`) — probably the best-known library for exactly that. | Lowest-level of the three — no layout OR visuals are free, you write the render function yourself. More upfront code, but it's written ONCE and driven by data from then on (this is what actually kills "hardcoded per page"). |
| **Cytoscape.js** | A dedicated graph-visualization library — nodes + edges in, it handles layout, pan/zoom, click/hover/drag, stays smooth with hundreds of nodes. Least code to get *something* on screen. | Owns its own rendering pipeline (canvas by default) with its own styling DSL, not real CSS — keeping the exact subway look means duplicating the theme into Cytoscape's style config and re-syncing it by hand on every dark-mode/city-theme switch. Not a good fit here specifically BECAUSE you care about keeping the theme and want animation — this is the one to reach for if the visual style stopped mattering and only "many nodes, laid out correctly" did. |
| **Graphviz via WASM** (`@hpcc-js/wasm` or `viz.js`) | Describe the graph in the `dot` language (`"CS1010" -> "CS2040"`), it computes a hierarchical layout automatically, entirely client-side. Fastest path to "a correct, non-overlapping, automatically-laid-out diagram" with the least code. | Visual style is Graphviz's own (boxes and arrows), rendered as its own SVG output — same reskinning friction as Cytoscape, just for a static image instead of an interactive one. |

**Recommended path if/when you build this for real:** write the module data
as plain JSON (or fetch it from NUSMods' API) first, independent of any
rendering choice — that's the part that actually has to be right regardless
of tool. Then build the render function in D3, reusing the exact CSS classes
`.prereq-station`/`.prereq-dot`/`.prereq-label`/`.prereq-branch` already use
(possibly even the SAME hybrid this session's `pages/prereq-branch-themed.
html` uses — SVG for connector curves, real themed elements for the
stations) — just have D3's layout engine compute the positions instead of
hand-typing them. One render function, called with a different module's data
each time, instead of one hand-built page per module.

**No iframe needed.** All three mount straight into a plain `<div>` on the
same page, same document — no different from how `.prereq-map`/`.gallery-
diagram` already work, just letting the library compute node positions
instead of hand-placed pixels:

```html
<div id="prereq-graph"></div>
<script src="https://unpkg.com/cytoscape@.../dist/cytoscape.min.js"></script>
<script>
  cytoscape({ container: document.getElementById('prereq-graph'), elements: [...] });
</script>
```

An iframe would actively work against this: CSS custom properties
(`--accent`, `--prereq-dot-height`, the whole dark-mode/city-theme system)
don't cross an iframe boundary — it's a separate document with its own
style context, so every theme variable would need duplicating and
re-syncing into it by hand, and the dark-mode toggle / city-theme picker
would need extra wiring (`postMessage`) to reach inside. None of that buys
anything here since it'd still be your own content on your own page —
iframes earn their keep embedding a genuinely separate origin/document or
sandboxing untrusted content, neither of which applies.

## Not part of `.prereq-map`, don't confuse them

- `.prereq-tree` (~line 1270 onward) is the separate NUSMods-style
  boxes-and-lines alternative — different component, different geometry,
  not subway-themed.
- `.gallery-diagram`/`.gallery-node` (~line 1446 onward) are one-off,
  fixed-pixel-coordinate SVGs used ONLY by `pages/prereq-styles.html`'s style
  comparison gallery — not used by any real course page, safe to ignore
  unless you're specifically editing that gallery.
