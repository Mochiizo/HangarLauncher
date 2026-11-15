// Données locales de l'utilisateur (dossier userData de l'appli) :
// réglages, snapshots quotidiens du temps de jeu, sessions suivies, favoris.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const empty = () => ({
  settings: { steamPath: '', epicPath: '', steamApiKey: '', steamId: '', accent: '#E8B04B', hideWhilePlaying: true },
  snapshots: {},   // { "2026-11-05": { "steam-123": totalMinutes } }
  tracked: {},     // { "2026-11-05": { "epic-Foo": minutes } } (détection de processus)
  daily: {},       // { "2026-11-05": { "steam-123": minutes } } temps Steam joué par jour (gardé sans limite, pour les statistiques)
  epicTotals: {},  // { "epic-Foo": minutes }
  epicLast: {},    // { "epic-Foo": timestampMs }
  favorites: {},
  nameCache: {},
  assetCache: {},   // { appid: { at, cover, hero, header } } images boutique Steam
  titleCache: {},   // { nomNormalisé: { at, appid } } jeux Ubisoft/EA/Xbox retrouvés sur Steam (images)
  releaseCache: {},  // { appid: { at, data } } fiches boutique du calendrier des sorties
  customCovers: {},  // { gameKey: "fichier.jpg" } images choisies par l'utilisateur
  customGames: []    // [{ key, title, file }] jeux ajoutés à la main (sans launcher)
});

const dayKey = (d = new Date()) => d.toLocaleDateString('sv-SE'); // AAAA-MM-JJ, heure locale

function createStore(dir) {
  const file = path.join(dir, 'library-data.json');
  let db = empty();
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    db = { ...db, ...saved, settings: { ...db.settings, ...saved.settings } };
  } catch { /* premier lancement */ }

  // Temps Steam joué un jour = écart avec le snapshot précédent
  function steamDiff(day) {
    const out = {};
    const prev = Object.keys(db.snapshots).filter((d) => d < day).sort().pop();
    if (!db.snapshots[day] || !prev) return out;
    for (const [k, total] of Object.entries(db.snapshots[day])) {
      // Jeu absent du snapshot précédent : il vient d'apparaître dans la bibliothèque (clé API, jeu
      // retrouvé…), pas d'être joué. Son temps total n'est pas du temps joué ce jour-là.
      if (!(k in db.snapshots[prev])) continue;
      const diff = total - db.snapshots[prev][k];
      if (diff > 0) out[k] = diff;
    }
    return out;
  }
  // Données d'avant les statistiques : on reconstitue l'historique à partir des snapshots encore présents
  db.daily ??= {};
  for (const day of Object.keys(db.snapshots)) if (!db.daily[day]) { const d = steamDiff(day); if (Object.keys(d).length) db.daily[day] = d; }

  let t = null;
  const save = () => {
    clearTimeout(t);
    t = setTimeout(() => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(db)); }, 300);
  };

  return {
    db,
    save,
    settings: () => db.settings,
    setSettings(patch) { Object.assign(db.settings, patch); save(); },

    recordSnapshot(games) {
      const snap = {};
      for (const g of games) if (g.source === 'steam' && g.minutes > 0) snap[g.key] = g.minutes;
      if (!Object.keys(snap).length) return;
      const today = dayKey();
      db.snapshots[today] = snap;
      const diff = steamDiff(today);
      if (Object.keys(diff).length) db.daily[today] = diff; else delete db.daily[today];
      const days = Object.keys(db.snapshots).sort();
      while (days.length > 90) delete db.snapshots[days.shift()];
      save();
    },

    addTrackedMinute(key) {
      const d = dayKey();
      (db.tracked[d] ??= {})[key] = (db.tracked[d][key] || 0) + 1;
      db.epicTotals[key] = (db.epicTotals[key] || 0) + 1;
      db.epicLast[key] = Date.now();
      save();
    },

    epicStats: (key) => ({ minutes: db.epicTotals[key] || 0, lastPlayed: db.epicLast[key] || 0 }),

    toggleFavorite(key) { if (db.favorites[key]) delete db.favorites[key]; else db.favorites[key] = true; save(); return !!db.favorites[key]; },

    // Minutes jouées par jeu un jour donné = temps Steam (écart entre snapshots) + sessions suivies
    playedOn(day) {
      const out = { ...(db.daily[day] || (db.snapshots[day] ? steamDiff(day) : {})) };
      for (const [k, m] of Object.entries(db.tracked[day] || {})) out[k] = (out[k] || 0) + m;
      return out;
    },

    // Tout l'historique jour par jour (statistiques)
    history() {
      const days = new Set([...Object.keys(db.daily), ...Object.keys(db.tracked)]);
      const out = {};
      for (const d of days) { const p = this.playedOn(d); if (Object.keys(p).length) out[d] = p; }
      return out;
    },

    firstSnapshotDay: () => Object.keys(db.snapshots).sort()[0] || null
  };
}

module.exports = { createStore, dayKey };
