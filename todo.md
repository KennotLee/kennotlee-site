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

## Not part of `.prereq-map`, don't confuse them

- `.prereq-tree` (~line 1270 onward) is the separate NUSMods-style
  boxes-and-lines alternative — different component, different geometry,
  not subway-themed.
- `.gallery-diagram`/`.gallery-node` (~line 1446 onward) are one-off,
  fixed-pixel-coordinate SVGs used ONLY by `prereq-styles.html`'s style
  comparison gallery — not used by any real course page, safe to ignore
  unless you're specifically editing that gallery.
