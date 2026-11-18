// Signal anonyme d'utilisation : tant que Hangar est ouvert, il envoie au site toutes les 4 minutes
// un identifiant tiré au hasard à l'installation et son numéro de version. Rien d'autre (ni nom, ni jeux,
// ni compte Steam). Il sert à compter les utilisateurs actifs et les joueurs en ligne. Désactivable dans les Réglages.
'use strict';
const crypto = require('node:crypto');

const SITE = 'https://hangar-launcher-site.vercel.app';
const today = () => new Date().toLocaleDateString('sv-SE');
const EVERY = 4 * 60_000;

let ctx = null;

async function post(body) {
  return fetch(`${SITE}/api/ping`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
}

async function beat() {
  const { store, version } = ctx;
  const s = store.settings();
  if (s.telemetry === false) return;
  let id = s.installId;
  if (!id) { id = crypto.randomUUID(); store.setSettings({ installId: id }); }
  const first = s.telemetryDay !== today();
  try {
    const res = await post({ id, v: version, first });
    if (first && (res.ok || res.status === 400)) store.setSettings({ telemetryDay: today() });
  } catch { /* hors ligne : nouvel essai au prochain signal */ }
}

function start({ store, version, disabled }) {
  if (disabled) return;
  ctx = { store, version };
  setTimeout(beat, 10_000);
  setInterval(beat, EVERY).unref?.();
}

// Hangar se ferme (ou le signal est coupé) : il n'est plus compté « en ligne »
function leave() {
  const id = ctx?.store.settings().installId;
  if (!id) return Promise.resolve();
  return post({ id, leave: true }).catch(() => {});
}

// Nombre de joueurs qui ont Hangar ouvert en ce moment (mis en cache 1 minute)
let onlineCache = { at: 0, value: null };
async function online() {
  if (Date.now() - onlineCache.at < 60_000) return onlineCache.value;
  try {
    const res = await fetch(`${SITE}/api/online`, { signal: AbortSignal.timeout(8000) });
    const j = await res.json();
    onlineCache = { at: Date.now(), value: typeof j.online === 'number' ? j.online : null };
  } catch { onlineCache = { at: Date.now(), value: onlineCache.value }; }
  return onlineCache.value;
}

module.exports = { start, leave, online, beat: () => ctx && beat() };
