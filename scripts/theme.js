(function () {
  var stored = localStorage.getItem('theme');
  document.documentElement.setAttribute('data-theme', stored || 'light');

  var storedCity = localStorage.getItem('cityTheme');
  document.documentElement.setAttribute('data-city-theme', storedCity || 'sf');
})();

function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme') || 'light';
  var next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateToggleLabel();
}

function updateToggleLabel() {
  var btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  var current = document.documentElement.getAttribute('data-theme') || 'light';
  btn.textContent = current === 'dark' ? 'Light mode' : 'Dark mode';
}

function setCityTheme(city) {
  document.documentElement.setAttribute('data-city-theme', city);
  localStorage.setItem('cityTheme', city);
  updateCityThemeUI();
}

var CITY_NAMES = {
  sf: 'San Francisco',
  nyc: 'New York',
  chicago: 'Chicago',
  tokyo: 'Tokyo',
  seoul: 'Seoul'
};

function updateCityThemeUI() {
  var current = document.documentElement.getAttribute('data-city-theme') || 'sf';
  var swatches = document.querySelectorAll('.theme-swatch');
  for (var i = 0; i < swatches.length; i++) {
    var isActive = swatches[i].getAttribute('data-city') === current;
    swatches[i].classList.toggle('active', isActive);
  }
  var label = document.getElementById('theme-current-label');
  if (label) {
    label.innerHTML = 'Current: <strong>' + (CITY_NAMES[current] || current) + '</strong>';
  }
}

// Toggles between a page's .prereq-map (subway diagram) and .prereq-tree
// (plain boxes-and-labels diagram) — only runs on pages that actually
// have both, via the "[data-prereq-view]" buttons documented in
// stylesheets/style.css next to ".prereq-tree". Safe no-op elsewhere.
function initPrereqViewSwitcher() {
  var buttons = document.querySelectorAll('[data-prereq-view]');
  if (buttons.length === 0) return;
  // ".prereq-map" is the old hand-typed subway diagram; ".prereq-d3-map"
  // is the newer D3 widget that replaced it on some pages (e.g.
  // classes/ee2028.html). Either can be the "map" view the Tree toggle
  // flips against — take whichever this page actually has.
  var map = document.querySelector('.prereq-map') || document.querySelector('.prereq-d3-map');
  var tree = document.querySelector('.prereq-tree');
  // Both halves must exist for the toggle to mean anything. Guard so a
  // click can never throw on a null.
  if (!map || !tree) return;

  // Hide/show with INLINE display, NOT by toggling an "is-hidden" class.
  // The class approach only works if a matching
  // ".<selector>.is-hidden { display:none }" rule exists in the
  // stylesheet — and the D3 map's rule (".prereq-d3-map.is-hidden") was
  // added recently, so a browser running a stale cached style.css can
  // lack it. In that case picking "Tree" added the class but the map
  // never hid (both stayed on screen), which reads exactly as "the tree
  // toggle is broken". Inline display needs no CSS rule, so it works even
  // against an old cached stylesheet. Strip any starting is-hidden class
  // first so these inline styles are the single source of truth.
  map.classList.remove('is-hidden');
  tree.classList.remove('is-hidden');

  function showView(showTree) {
    map.style.display = showTree ? 'none' : '';
    tree.style.display = showTree ? '' : 'none';
    buttons.forEach(function (b) {
      var isActive = (b.dataset.prereqView === 'tree') === showTree;
      b.classList.toggle('is-active', isActive);
      b.setAttribute('aria-pressed', String(isActive));
    });
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      showView(btn.dataset.prereqView === 'tree');
    });
  });

  // Set the initial state from whichever button starts active (the map,
  // by default) rather than trusting the HTML's is-hidden class, which we
  // just stripped above.
  var active = document.querySelector('[data-prereq-view].is-active');
  showView(!!active && active.dataset.prereqView === 'tree');
}

// Zoom control for one ".gallery-diagram" (see the ".gallery-zoom-
// controls" comment in stylesheets/style.css) — delta 0 resets to 100%,
// otherwise nudges by that amount, clamped to 40%-200% so it can't be
// zoomed into nothing or off to some absurd size. Reads the current scale
// back off the element's own style rather than tracking it separately, so
// this stays correct even if the page re-renders the diagram.
function zoomGalleryDiagram(button, delta) {
  var wrap = button.closest('.gallery-diagram-wrap');
  if (!wrap) return;
  var diagram = wrap.querySelector('.gallery-diagram');
  if (!diagram) return;

  var current = parseFloat(diagram.dataset.zoom || '1');
  var next = delta === 0 ? 1 : Math.max(0.4, Math.min(2, current + delta));
  diagram.dataset.zoom = String(next);
  diagram.style.transform = 'scale(' + next + ')';
}

document.addEventListener('DOMContentLoaded', function () {
  updateToggleLabel();
  updateCityThemeUI();
  initPrereqViewSwitcher();
});
