/* ============================================================
   PREREQUISITE GRAPH — shared D3 widget
   ------------------------------------------------------------
   One combined, interactive prerequisite graph: prerequisites flow IN
   from the left and converge into the current module in the CENTER,
   which then fans OUT to its dependents on the RIGHT — all in one SVG
   sharing that one center station.

   This is the single source of truth for both the graph's DATA and its
   render logic. Any page that wants the widget just needs to:
     1. load D3        <script src=".../d3@7/dist/d3.min.js"></script>
     2. load this file <script src=".../scripts/prereq-graph.js"></script>
     3. include the markup below (IDs matter):
          <div class="prereq-d3-controls">
            <label for="target-select">Jump to a module:</label>
            <select id="target-select"></select>
            <button type="button" id="back-btn" onclick="goBackPrereq()">&larr; Back</button>
          </div>
          <div class="prereq-d3-breadcrumb" id="prereq-breadcrumb"></div>
          <div class="prereq-d3-map" id="prereq-map" data-initial="CS2040"></div>
          <div class="prereq-d3-info" id="prereq-info"></div>
   The optional data-initial on #prereq-map picks which module is shown
   first (defaults to CS2040). If #prereq-map isn't on the page, this
   script no-ops — safe to include anywhere.

   Used by classes.html (the real Classes page) and pages/prereq-graph.html
   (the standalone test page). Edit module data / layout HERE, once.
   ============================================================ */

// DATA — one entry per module: its display name, plus its prerequisite
// chain in display order (NOT including itself). A chain entry is
// either {type:"station", code} for a single prior module, or
// {type:"branch", alts:[codeA, codeB]} for "either of these two",
// rendered as an OR-branch that merges into one line.
const moduleData = {
  CS1010E: { name: "Programming Methodology", chain: [] },
  CS2040: { name: "Data Structures and Algorithms", chain: [
    { type: "station", code: "CS1010E" },
  ] },
  CS2030: { name: "Programming Methodology II", chain: [
    { type: "station", code: "CS1010E" },
  ] },
  MA1512: { name: "Differential Equations for Engineering", chain: [] },
  EE2023: { name: "Signals and Systems", chain: [
    { type: "station", code: "MA1512" },
  ] },
  EE3131C: { name: "Fundamentals of VLSI Design", chain: [
    { type: "station", code: "MA1512" },
    { type: "station", code: "EE2023" },
  ] },
  EE1111A: { name: "Electrical Engineering Principles I", chain: [] },
  EE2111A: { name: "Electrical Engineering Principles II", chain: [] },
  EE2028: { name: "Engineering Design & Innovation Project", chain: [
    { type: "branch", alts: ["EE1111A", "EE2111A"] },
    { type: "station", code: "CS1010E" },
  ] },
  // CS1010E fans out to several downstream modules — CS2040/CS2030/EE2028
  // above already carry it as a prereq; these are extra dependents so the
  // fan-out has more to show. Placeholder names, real chains TBD.
  EE2026: { name: "Module EE2026", chain: [
    { type: "station", code: "CS1010E" },
  ] },
  CS2100DE: { name: "Module CS2100DE", chain: [
    { type: "station", code: "CS1010E" },
  ] },
  EE2211: { name: "Module EE2211", chain: [
    { type: "station", code: "CS1010E" },
  ] },
};

let prereqHistory = [];
let currentPrereqCode = null;

// LAYOUT — real computed pixel coordinates via D3, not the CSS
// pixel-formula approach the static .prereq-branch component uses
// (see classes/ee2028.html's CSS: that component's curve overlapping
// its own station label, twice, was exactly this class of bug —
// hand-derived formulas drifting out of sync as constants changed).
// Here every station's (x, y) is computed once in JS and both the
// SVG lines AND the HTML station markers are placed from the same
// numbers, so they can't drift apart.
//
// GHOST NODES: a branch's two lines need somewhere to converge
// before continuing on as one line. Rather than eyeball a merge
// point in CSS, the layout inserts a real column into the "columns"
// array for it — same as any station — except it's marked
// `ghost: true`, which addStationMarker() / the line-color pass
// both check to skip ever drawing a marker for it. It has real
// coordinates and participates in the layout like any other node;
// it's just never rendered, purely a routing waypoint.
const SLOT_W = 180; // horizontal space per real (non-ghost) column — trimmed from 220 so the map needs a horizontal scrollbar (see ".prereq-d3-map"'s overflow-x) less often on a narrow viewport
const SPLIT = 80; // vertical offset of each branch sub-station from the center line
const STATION_W = 140; // matches ".prereq-station"'s own CSS width
const CORNER_R = 14; // shared 90-degree-bend radius — matches --prereq-branch-corner on the static CSS component, so every rounded corner reads as the same "house style" bend.

function buildColumns(steps) {
  const columns = [];
  let x = SLOT_W / 2;
  steps.forEach((step) => {
    if (step.type === "branch") {
      const vertX = x + SLOT_W / 2;
      columns.push({ type: "branch", x, vertX, alts: step.alts });
      columns.push({ type: "station", x: vertX, ghost: true });
    } else {
      columns.push({ type: "station", x, code: step.code, current: !!step.current });
    }
    x += SLOT_W;
  });
  return columns;
}

function addStationMarker(svgRoot, mapEl, x, y, code, { prereq = false, current = false } = {}) {
  const mod = moduleData[code];
  const clickable = !current;
  const classes = ["prereq-station"];
  if (prereq) classes.push("prereq");
  if (current) classes.push("current");

  const dotH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--prereq-dot-height")) || 20;
  const el = d3.select(mapEl).append(clickable ? "a" : "div")
    .attr("class", classes.join(" "))
    .style("position", "absolute")
    .style("left", (x - STATION_W / 2) + "px")
    .style("top", (y - dotH / 2) + "px")
    .style("width", STATION_W + "px");
  if (clickable) {
    el.attr("href", "#").on("click", (event) => {
      event.preventDefault();
      if (moduleData[code]) renderPrereqMap(code);
    });
  }
  if (mod) el.attr("title", mod.name);
  el.append("span").attr("class", "prereq-dot");
  el.append("span").attr("class", "prereq-label").text(code);
}

// COMBINED graph: prerequisites flow in from the LEFT and converge
// into the current module in the CENTER, which then fans OUT to its
// dependents on the RIGHT — all in ONE svg sharing that one center
// station. The two halves are drawn on either side of a shared center X,
// both anchored to the same horizontal centerY line.
function renderPrereqMap(code, opts = {}) {
  const mod = moduleData[code];
  if (!mod) return;
  currentPrereqCode = code;

  if (opts.pushHistory !== false && prereqHistory[prereqHistory.length - 1] !== code) {
    prereqHistory.push(code);
  }

  const mapEl = document.getElementById("prereq-map");
  mapEl.innerHTML = "";
  mapEl.style.position = "relative";

  // LEFT HALF: prerequisite chain as columns, with the current module
  // as the last (rightmost) column — that column's x is the shared
  // center station both halves hinge on.
  const steps = mod.chain.concat([{ type: "station", code, current: true }]);
  const columns = buildColumns(steps);
  const currentX = columns[columns.length - 1].x;

  // RIGHT HALF: everything that lists this module as a prerequisite.
  const dependents = findDependents(code);

  // VERTICAL SIZING. The whole graph shares one horizontal line at
  // y = centerY. Both halves stick out vertically from it: the
  // prereq side by SPLIT if any step is an OR-branch, the dependent
  // side by half the fan's total spread. centerY sits far enough
  // down that whichever half reaches highest still clears the top —
  // labels rotate UP off each dot, so there's extra room reserved
  // above the topmost one.
  const hasBranch = columns.some((c) => c.type === "branch");
  const FAN_SPACING = 75; // vertical gap between fanned-out dependents
  const branchHalf = hasBranch ? SPLIT : 0;
  const fanHalf = dependents.length > 1 ? (dependents.length - 1) * FAN_SPACING / 2 : 0;
  const halfExtent = Math.max(branchHalf, fanHalf, 30);
  // Room above the topmost dot for its rotated label. Each label rises up
  // and to the right off its dot, so how far it reaches ABOVE the dot
  // depends on two things: the dot's own height (the label sits above the
  // marker box, so a taller dot pushes the label higher) and the rotated
  // text's own vertical rise. Both matter — SF's tick-style dot is ~28px
  // tall, and the longest labels (8 chars, e.g. CS2100DE) rise ~45px once
  // rotated -40deg. Reading --prereq-dot-height live keeps this correct as
  // the city theme changes (a theme switch re-renders — see the
  // setCityTheme wrapper below). When this was a fixed 46px the top label
  // clipped against the container's overflow-y:hidden edge.
  const dotH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--prereq-dot-height")) || 20;
  const LABEL_RISE = 58; // vertical reach of the rotated label above the dot's top edge
  const LABEL_PAD = dotH / 2 + LABEL_RISE;
  const BOT_PAD = dotH / 2 + 18; // just the bottom dot's lower half + a little (labels rise upward, so nothing hangs below)
  const centerY = LABEL_PAD + halfExtent;
  const height = centerY + halfExtent + BOT_PAD;

  // HORIZONTAL geometry of the dependent fan, to the RIGHT of center.
  // FAN_X is the vertical spine (a ghost routing corridor, no marker),
  // DEST_X the dependents' own column.
  const FAN_GAP = 110; // center station -> spine
  const FAN_LEN = 220; // spine -> dependents
  const FAN_X = currentX + FAN_GAP;
  const DEST_X = FAN_X + FAN_LEN;

  const rightmost = dependents.length ? DEST_X : currentX;
  const width = rightmost + STATION_W / 2 + 40; // +40 for the rightmost rotated label
  mapEl.style.height = height + "px";

  const svg = d3.select(mapEl).append("svg")
    .attr("class", "prereq-d3-svg")
    .attr("width", width)
    .attr("height", height)
    .style("position", "absolute")
    .style("left", 0)
    .style("top", 0)
    .style("overflow", "visible");

  // --- PREREQUISITE LINES (left of + into center), on the centerY row.
  //     A segment is --accent only when it leads DIRECTLY into the
  //     current module; deeper prereq segments and every line inside
  //     a branch stay neutral gray.
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (col.type === "branch") {
      const topY = centerY - SPLIT;
      const botY = centerY + SPLIT;
      svg.append("path").attr("class", "prereq-d3-line").attr("fill", "none")
        .attr("d", `M ${col.x} ${topY} L ${col.vertX - CORNER_R} ${topY} Q ${col.vertX} ${topY} ${col.vertX} ${topY + CORNER_R} L ${col.vertX} ${centerY}`);
      svg.append("path").attr("class", "prereq-d3-line").attr("fill", "none")
        .attr("d", `M ${col.x} ${botY} L ${col.vertX - CORNER_R} ${botY} Q ${col.vertX} ${botY} ${col.vertX} ${botY - CORNER_R} L ${col.vertX} ${centerY}`);
    } else {
      const next = columns[i + 1];
      if (next) {
        svg.append("line")
          .attr("class", "prereq-d3-line")
          .classed("prereq-d3-line-accent", !!next.current)
          .attr("x1", col.x).attr("y1", centerY)
          .attr("x2", next.x).attr("y2", centerY);
      }
    }
  }

  // --- DEPENDENT FAN-OUT LINES (right of center). Same 90-degree
  //     rounded-elbow routing / shared FAN_X ghost spine as the
  //     standalone fan-out had. depYs are symmetric around centerY,
  //     so the whole fan is vertically balanced on the center line.
  const depYs = dependents.map((_, i) => centerY - fanHalf + i * FAN_SPACING);
  if (dependents.length) {
    svg.append("line")
      .attr("class", "prereq-d3-line prereq-d3-line-accent")
      .attr("x1", currentX).attr("y1", centerY)
      .attr("x2", FAN_X).attr("y2", centerY);
    dependents.forEach((depCode, i) => {
      const y = depYs[i];
      const dir = y === centerY ? 0 : (y > centerY ? 1 : -1);
      const d = dir === 0
        ? `M ${FAN_X} ${centerY} L ${DEST_X} ${y}`
        : `M ${FAN_X} ${centerY} L ${FAN_X} ${y - dir * CORNER_R} Q ${FAN_X} ${y} ${FAN_X + CORNER_R} ${y} L ${DEST_X} ${y}`;
      svg.append("path")
        .attr("class", "prereq-d3-line prereq-d3-line-accent")
        .attr("fill", "none")
        .attr("d", d);
    });
  }

  // --- STATION MARKERS. Ghost columns are skipped (no marker). The
  //     current module is drawn once, from the prereq columns (its
  //     last column) — it's the single shared center both halves meet
  //     at, not drawn twice.
  columns.forEach((col) => {
    if (col.ghost) return;
    if (col.type === "branch") {
      addStationMarker(svg, mapEl, col.x, centerY - SPLIT, col.alts[0], { prereq: true });
      addStationMarker(svg, mapEl, col.x, centerY + SPLIT, col.alts[1], { prereq: true });
    } else {
      addStationMarker(svg, mapEl, col.x, centerY, col.code, { prereq: !col.current, current: !!col.current });
    }
  });
  dependents.forEach((depCode, i) => {
    addStationMarker(svg, mapEl, DEST_X, depYs[i], depCode, {});
  });

  d3.select(mapEl).selectAll(".prereq-station")
    .style("opacity", 0)
    .transition().duration(250).ease(d3.easeCubicOut)
    .style("opacity", 1);

  d3.select("#target-select").property("value", code);
  d3.select("#prereq-info").text(`${code} — ${mod.name}`);
  renderBreadcrumb();
}

// The reverse direction of the prereq chain: instead of walking BACKWARD
// from a module to its own listed prerequisites, this scans every OTHER
// module's chain looking for ones that name `code` directly (as a plain
// station or as one alt of a branch) — i.e. "what does this module
// unlock". There's no reverse-lookup index, so it's a plain O(n) scan of
// moduleData each render; fine at this size, would want a precomputed map
// if this ever grew to hundreds of modules.
function findDependents(code) {
  return Object.keys(moduleData).filter((k) => {
    return moduleData[k].chain.some((step) =>
      (step.type === "station" && step.code === code) ||
      (step.type === "branch" && step.alts && step.alts.includes(code))
    );
  }).sort();
}

function renderBreadcrumb() {
  const crumb = d3.select("#prereq-breadcrumb");
  crumb.selectAll("*").remove();
  prereqHistory.forEach((code, i) => {
    if (i > 0) crumb.append("span").attr("class", "prereq-d3-breadcrumb-sep").text(" › ");
    const isLast = i === prereqHistory.length - 1;
    const item = crumb.append(isLast ? "span" : "a")
      .attr("class", "prereq-d3-breadcrumb-item")
      .text(code);
    if (!isLast) {
      item.attr("href", "#").on("click", (event) => {
        event.preventDefault();
        prereqHistory = prereqHistory.slice(0, i + 1);
        renderPrereqMap(code, { pushHistory: false });
      });
    }
  });
}

// Global so the Back button's inline onclick="goBackPrereq()" can find it.
function goBackPrereq() {
  if (prereqHistory.length <= 1) return;
  prereqHistory.pop();
  renderPrereqMap(prereqHistory[prereqHistory.length - 1], { pushHistory: false });
}

// Android-ScrollView-style drag-to-pan for the horizontally-scrollable
// map: grab anywhere on it and drag to pan, with a fling/momentum glide
// on release. Attached ONCE to the container (it persists across
// re-renders — only its innerHTML changes).
//
// Only engages for MOUSE input: touch and pen fall through to the
// browser's own native overflow scrolling, which already gives the real
// momentum-scroll feel on those devices (hijacking it with JS there
// tends to fight the OS and feel worse). So this is the desktop-mouse
// gap — where you'd otherwise have only the scrollbar.
function enableDragScroll(el) {
  let down = false, moved = false;
  let startX = 0, startScroll = 0;
  let lastX = 0, lastT = 0, velocity = 0; // velocity in px/ms, for the fling
  let raf = null;
  const DRAG_THRESHOLD = 5; // px of movement before it's a drag, not a click

  el.style.cursor = "grab";
  // pan-y: let the browser keep handling VERTICAL page scroll natively
  // (so dragging up/down the page still works over the map); we only take
  // over the horizontal axis.
  el.style.touchAction = "pan-y";

  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return; // touch/pen use native scroll
    if (el.scrollWidth <= el.clientWidth) return; // nothing to pan
    down = true; moved = false;
    startX = e.clientX; startScroll = el.scrollLeft;
    lastX = e.clientX; lastT = performance.now(); velocity = 0;
    if (raf) { cancelAnimationFrame(raf); raf = null; } // stop any in-flight fling
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  });

  window.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > DRAG_THRESHOLD) moved = true;
    el.scrollLeft = startScroll - dx;
    const now = performance.now();
    const dt = now - lastT;
    if (dt > 0) velocity = (e.clientX - lastX) / dt;
    lastX = e.clientX; lastT = now;
  });

  window.addEventListener("pointerup", () => {
    if (!down) return;
    down = false;
    el.style.cursor = "grab";
    el.style.userSelect = "";
    if (moved) {
      // Suppress the click that fires right after a drag, so a station you
      // happened to grab-drag over doesn't also navigate.
      el.dataset.suppressClick = "1";
      setTimeout(() => { delete el.dataset.suppressClick; }, 0);
      // Fling: keep gliding in the drag's direction, decaying by a fixed
      // friction factor each frame until it's negligible.
      const glide = () => {
        velocity *= 0.94;
        el.scrollLeft -= velocity * 16; // ~16ms per frame
        if (Math.abs(velocity) > 0.02) raf = requestAnimationFrame(glide);
        else raf = null;
      };
      if (Math.abs(velocity) > 0.05) raf = requestAnimationFrame(glide);
    }
  });

  // Capture phase so it runs before the station <a>'s own click handler:
  // if we just dragged, cancel the click entirely.
  el.addEventListener("click", (e) => {
    if (el.dataset.suppressClick) { e.preventDefault(); e.stopPropagation(); }
  }, true);
}

document.addEventListener("DOMContentLoaded", () => {
  const mapEl = document.getElementById("prereq-map");
  if (!mapEl) return; // no graph on this page — safe no-op

  const select = d3.select("#target-select");
  select.selectAll("option")
    .data(Object.keys(moduleData).sort())
    .join("option")
    .attr("value", (d) => d)
    .text((d) => `${d} — ${moduleData[d].name}`);
  select.on("change", function () { renderPrereqMap(this.value); });

  enableDragScroll(mapEl);

  // Which module to show first — page picks it via data-initial on the
  // map container, defaulting to CS2040 (a good showcase: it has both a
  // prerequisite and a dependent).
  const initial = mapEl.dataset.initial && moduleData[mapEl.dataset.initial]
    ? mapEl.dataset.initial
    : "CS2040";
  renderPrereqMap(initial);

  // Every station's y-coordinate is computed from --prereq-dot-height at
  // render time (see addStationMarker), and that variable changes per
  // city theme (5px BART tick vs 20px Tokyo badge) — so a theme switch
  // after the initial render needs a re-render, or the dots drift a few
  // px off-center from their own lines. scripts/theme.js defines
  // setCityTheme globally; wrap it here rather than editing that shared
  // file, since this recompute is only needed where this widget is used.
  const originalSetCityTheme = window.setCityTheme;
  if (typeof originalSetCityTheme === "function") {
    window.setCityTheme = function (city) {
      originalSetCityTheme(city);
      if (currentPrereqCode) renderPrereqMap(currentPrereqCode, { pushHistory: false });
    };
  }
});
