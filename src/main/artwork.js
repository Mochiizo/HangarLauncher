// Images des jeux Steam, de la plus fiable à la moins fiable :
//  1. le cache d'images du client Steam sur l'ordinateur (exactement ce que Steam affiche)
//  2. l'API boutique IStoreBrowseService/GetItems (adresses « hachées » des jeux récents)
//  3. l'ancienne adresse fixe du CDN (déjà renseignée par steam.js)
// Les fichiers locaux sont servis au rendu via le protocole libimg://
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ASSET_BASE = 'https://shared.akamai.steamstatic.com/store_item_assets/';
const WANT = { cover: /^library_600x900(_2x)?\.(jpg|png)$/i, hero: /^library_hero(_2x)?\.(jpg|png)$/i, header: /^header\.(jpg|png)$/i };

// Map appid -> { cover, hero, header } (chemins relatifs à librarycache)
function scanLocalCache(steamPath) {
  const root = path.join(steamPath, 'appcache', 'librarycache');
  const out = new Map();
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return { root, map: out }; }

  const put = (appid, kind, rel) => {
    const cur = out.get(appid) || {};
    // On préfère la version _2x si elle existe
    if (!cur[kind] || /_2x\./.test(rel)) cur[kind] = rel;
    out.set(appid, cur);
  };

  for (const e of entries) {
    if (e.isFile()) {
      // Ancien format : 1234_library_600x900.jpg
      const m = e.name.match(/^(\d+)_(.+)$/);
      if (m) for (const [kind, re] of Object.entries(WANT)) if (re.test(m[2])) put(m[1], kind, e.name);
    } else if (e.isDirectory() && /^\d+$/.test(e.name)) {
      // Nouveau format : 1234/library_600x900.jpg ou 1234/<hash>/library_600x900.jpg
      const walk = (dir, rel, depth) => {
        let list = [];
        try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const f of list) {
          if (f.isDirectory() && depth < 2) walk(path.join(dir, f.name), `${rel}/${f.name}`, depth + 1);
          else if (f.isFile()) for (const [kind, re] of Object.entries(WANT)) if (re.test(f.name)) put(e.name, kind, `${rel}/${f.name}`);
        }
      };
      walk(path.join(root, e.name), e.name, 0);
    }
  }
  return { root, map: out };
}

async function fetchStoreAssets(appids) {
  const result = {};
  for (let i = 0; i < appids.length; i += 40) {
    const chunk = appids.slice(i, i + 40);
    const input = { ids: chunk.map((appid) => ({ appid: Number(appid) })), context: { language: 'french', country_code: 'FR' }, data_request: { include_assets: true } };
    const url = `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const items = (await res.json())?.response?.store_items || [];
      for (const it of items) {
        const a = it.assets;
        if (!a?.asset_url_format) continue;
        const make = (file) => (file ? ASSET_BASE + a.asset_url_format.replace('${FILENAME}', file) : undefined);
        result[it.appid ?? it.id] = {
          cover: make(a.library_capsule_2x || a.library_capsule),
          hero: make(a.library_hero_2x || a.library_hero),
          header: make(a.header)
        };
      }
    } catch { /* hors ligne : on garde les autres sources */ }
  }
  return result;
}

const WEEK = 7 * 86400000;

// Complète game.images pour les jeux Steam. assetCache est persistant (store).
async function enrichSteam(games, steamPath, assetCache) {
  const steamGames = games.filter((g) => g.source === 'steam');
  if (!steamGames.length) return;

  const { map } = scanLocalCache(steamPath);
  for (const g of steamGames) {
    const local = map.get(g.id);
    if (!local) continue;
    for (const kind of ['cover', 'hero', 'header']) {
      if (local[kind]) g.images[kind] = `libimg://steam/${local[kind].split('/').map(encodeURIComponent).join('/')}`;
    }
  }

  const missing = steamGames.filter((g) => !g.images.cover?.startsWith('libimg:') || !g.images.hero?.startsWith('libimg:'))
    .map((g) => g.id).filter((id) => !assetCache[id] || Date.now() - assetCache[id].at > WEEK);
  if (missing.length) {
    const fetched = await fetchStoreAssets(missing);
    for (const id of missing) assetCache[id] = { at: Date.now(), ...(fetched[id] || {}) };
  }

  for (const g of steamGames) {
    const remote = assetCache[g.id] || {};
    // Ordre de repli : local → adresse boutique → ancienne adresse CDN
    for (const kind of ['cover', 'hero', 'header']) {
      const list = [g.images[kind]?.startsWith('libimg:') ? g.images[kind] : null, remote[kind], g.images[kind]].filter(Boolean);
      g.images[kind] = [...new Set(list)];
    }
  }
}

function localSteamFile(steamPath, rel) {
  const root = path.resolve(steamPath, 'appcache', 'librarycache');
  const file = path.resolve(root, rel);
  return file.startsWith(root + path.sep) ? file : null;
}

module.exports = { enrichSteam, localSteamFile };
