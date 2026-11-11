// Écran de chargement : affiche la progression envoyée par Hangar, puis fait décoller la fusée
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
if (params.get('v')) $('#ver').textContent = `Version ${params.get('v')}`;

let shown = 0;
window.splash.onProgress(({ percent, text }) => {
  // la barre n'avance jamais en arrière
  shown = Math.max(shown, Math.min(100, Math.round(percent)));
  $('#fill').style.width = `${shown}%`;
  $('#pc').textContent = `${shown} %`;
  $('#bar').setAttribute('aria-valuenow', String(shown));
  if (text) $('#st').textContent = text;
});
window.splash.onDone(() => $('#splash').classList.add('launch'));
