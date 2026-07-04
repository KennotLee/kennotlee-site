(function () {
  var stored = localStorage.getItem('theme');
  document.documentElement.setAttribute('data-theme', stored || 'light');
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

document.addEventListener('DOMContentLoaded', updateToggleLabel);
