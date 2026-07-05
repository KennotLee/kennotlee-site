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

document.addEventListener('DOMContentLoaded', function () {
  updateToggleLabel();
  updateCityThemeUI();
});
