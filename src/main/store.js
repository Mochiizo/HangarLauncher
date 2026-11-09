// Données locales de l'utilisateur (dossier userData de l'appli) :
// réglages, snapshots quotidiens du temps de jeu, sessions suivies, favoris.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const empty = () => ({
  settings: { steamPath: '', epicPath: '', steamApiKey: '', steamId: '', accent: '#E8B04B', hideWhilePlaying: true },
  snapshots: {},   // { "2026-11-05": { "steam-123": totalMinutes } }
  tracked: {},     // { "2026-11-05": { "epic-Foo": minutes } } (détection de processus)
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
      db.snapshots[dayKey()] = snap;
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

    // Minutes jouées par jeu un jour donné = écart avec le dernier snapshot précédent + sessions suivies
    playedOn(day) {
      const out = {};
      const prev = Object.keys(db.snapshots).filter((d) => d < day).sort().pop();
      if (db.snapshots[day] && prev) {
        for (const [k, total] of Object.entries(db.snapshots[day])) {
          // Jeu absent du snapshot précédent : il vient d'apparaître dans la bibliothèque (clé API, jeu
          // retrouvé…), pas d'être joué. Son temps total n'est pas du temps joué ce jour-là.
          if (!(k in db.snapshots[prev])) continue;
          const diff = total - db.snapshots[prev][k];
          if (diff > 0) out[k] = diff;
        }
      }
      for (const [k, m] of Object.entries(db.tracked[day] || {})) out[k] = (out[k] || 0) + m;
      return out;
    },

    firstSnapshotDay: () => Object.keys(db.snapshots).sort()[0] || null
  };
}

module.exports = { createStore, dayKey };
