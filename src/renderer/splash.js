// Écran de chargement : joue le clip d'ouverture en entier (ou jusqu'à « Passer ») pendant que Hangar
// charge, affiche la progression envoyée par Hangar, puis s'efface.
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

// Fin du clip (ou clic sur « Passer ») : Hangar s'ouvre dès que le chargement est aussi terminé
const video = $('#intro');
let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  $('#skip').disabled = true;
  window.splash.finished();
}
function noVideo() {
  $('#splash').classList.add('novideo');
  finish();
}
video.addEventListener('playing', () => $('#splash').classList.add('has-video'));
video.addEventListener('ended', finish);
video.addEventListener('error', noVideo);
// lecture refusée : écran d'origine
video.play?.().catch(noVideo);
$('#skip').addEventListener('click', () => { video.pause(); finish(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') $('#skip').click(); });
