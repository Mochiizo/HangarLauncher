// Epic Games : pas d'API publique. On lit les fichiers du launcher installé :
//  - Data/Manifests/*.item  → jeux installés (nom, exécutable, taille, identifiants)
//  - Data/Catalog/catcache.bin → cache du catalogue (base64 → JSON) : images des jeux
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function defaultEpicDataPath() {
  if (process.platform === 'win32') return path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data');
  if (process.platform === 'darwin') return path.join(require('node:os').homedir(), 'Library/Application Support/Epic/EpicGamesLauncher/Data');
  return '';
}

function readCatalog(dataPath) {
  const byItem = new Map();
  try {
    const raw = fs.readFileSync(path.join(dataPath, 'Catalog', 'catcache.bin'), 'utf8');
    const items = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    for (const it of items) byItem.set(it.id, it);
  } catch { /* cache absent : pas d'images */ }
  return byItem;
}

function pickImages(item) {
  const imgs = item?.keyImages || [];
  const find = (...types) => imgs.find((k) => types.includes(k.type))?.url;
  const cover = find('DieselGameBoxTall', 'OfferImageTall', 'Thumbnail');
  const hero = find('DieselGameBox', 'OfferImageWide', 'DieselStoreFrontWide', 'featuredMedia');
  return { cover, hero, header: hero };
}

function library(settings) {
  const dataPath = settings.epicPath || defaultEpicDataPath();
  const status = { path: dataPath, found: false, count: 0 };
  if (!dataPath) return { games: [], status };
  let files = [];
  try { files = fs.readdirSync(path.join(dataPath, 'Manifests')).filter((f) => f.endsWith('.item')); status.found = true; } catch { return { games: [], status }; }

  const catalog = readCatalog(dataPath);
  const games = [];
  for (const f of files) {
    let m;
    try { m = JSON.parse(fs.readFileSync(path.join(dataPath, 'Manifests', f), 'utf8')); } catch { continue; }
    if (m.bIsApplication === false) continue;
    if (m.MainGameAppName && m.MainGameAppName !== m.AppName) continue; // DLC installé séparément
    if ((m.AppCategories || []).some((c) => /addons|plugins|engines/i.test(c))) continue; // Unreal Engine, plugins…
    const item = catalog.get(m.CatalogItemId);
    games.push({
      key: `epic-${m.AppName}`, source: 'epic', id: m.AppName,
      title: m.DisplayName || item?.title || m.AppName,
      minutes: 0, minutes2w: 0, lastPlayed: 0,
      installed: true, sizeBytes: Number(m.InstallSize || 0),
      images: pickImages(item),
      exes: m.LaunchExecutable ? [path.basename(m.LaunchExecutable).toLowerCase()] : [],
      launchUrl: `com.epicgames.launcher://apps/${encodeURIComponent(`${m.CatalogNamespace}:${m.CatalogItemId}:${m.AppName}`)}?action=launch&silent=true`,
      installUrl: null
    });
  }
  status.count = games.length;
  return { games, status };
}

module.exports = { library, defaultEpicDataPath };
