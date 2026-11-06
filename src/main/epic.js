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

// Le cache du launcher remplace parfois les caractères spéciaux par « ? » (®, ™, –, lettres accentuées).
// On nettoie ce qui peut l'être sans risque.
function cleanTitle(t) {
  return String(t || '')
    .replace(/\s\?\s/g, ' – ')                       // « Firestone ? Idle » → tiret
    .replace(/([A-Za-z0-9])\?(?=\d)/g, '$1 ')           // « Hell?2 » → « Hell 2 »
    .replace(/([A-Za-z0-9.])\?(?=[\s:,]|$)/g, '$1')     // ®/™ en fin de mot
    .replace(/[\p{L}?]*\?[\p{L}?]*/gu, fixAccents)          // « For?t » → « Forêt » si le mot est connu
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Mots français courants dans les titres de jeux, pour retrouver la lettre accentuée perdue
const FR_WORDS = ['forêt', 'secrète', 'secret', 'héritage', 'légende', 'légendes', 'épée', 'été', 'château', 'rêve', 'rêves', 'ténèbres',
  'éternel', 'éternelle', 'frère', 'frères', 'mystère', 'mystères', 'bête', 'bêtes', 'fête', 'tempête', 'île', 'âme', 'âmes', 'défi', 'réveil',
  'élu', 'épopée', 'royaume', 'héros', 'créatures', 'dernière', 'première', 'à', 'où', 'déchu', 'déchue', 'colère', 'lumière', 'prière',
  'guerrière', 'sorcière', 'étoile', 'étoiles', 'cité', 'vérité', 'liberté', 'éveil', 'reine', 'chevalier', 'mémoire', 'brûlé', 'brûlée'];
const FR_MAP = new Map(FR_WORDS.map((w) => [w.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), w]));

function fixAccents(word) {
  if (!word.includes('?')) return word;
  const re = new RegExp('^' + word.toLowerCase().replace(/\?/g, '.') + '$');
  for (const [plain, accented] of FR_MAP) {
    if (accented.length === word.length && re.test(accented)) {
      // garde la casse d'origine pour la première lettre
      return word[0] === word[0].toUpperCase() && word[0] !== '?' ? accented[0].toUpperCase() + accented.slice(1) : accented;
    }
    void plain;
  }
  return word;
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
      key: `epic-${m.AppName}`, source: 'epic', id: m.AppName, catalogItemId: m.CatalogItemId,
      title: m.DisplayName || item?.title || m.AppName,
      minutes: 0, minutes2w: 0, lastPlayed: 0,
      installed: true, sizeBytes: Number(m.InstallSize || 0),
      images: pickImages(item),
      exes: m.LaunchExecutable ? [path.basename(m.LaunchExecutable).toLowerCase()] : [],
      launchUrl: `com.epicgames.launcher://apps/${encodeURIComponent(`${m.CatalogNamespace}:${m.CatalogItemId}:${m.AppName}`)}?action=launch&silent=true`,
      installUrl: null
    });
  }
  // Jeux possédés mais non installés : le cache du catalogue contient toute la bibliothèque du compte
  const known = new Set(games.flatMap((g) => [g.id, g.catalogItemId]).filter(Boolean));
  for (const item of catalog.values()) {
    const cats = new Set((item.categories || []).map((c) => c.path));
    if (!cats.has('games')) continue;                                   // écarte logiciels, moteurs, promos
    if (item.mainGameItem?.id) continue;                                // écarte DLC et extensions
    if (cats.has('addons') || cats.has('digitalextras')) continue;
    const appName = (item.releaseInfo || []).find((r) => r.appId)?.appId;
    if (!appName || known.has(appName) || known.has(item.id)) continue;
    if (!(item.keyImages || []).length) continue;                       // entrées internes sans visuel
    known.add(appName);
    games.push({
      key: `epic-${appName}`, source: 'epic', id: appName, catalogItemId: item.id,
      title: cleanTitle(item.title) || appName,
      minutes: 0, minutes2w: 0, lastPlayed: 0,
      installed: false, sizeBytes: 0,
      images: pickImages(item),
      exes: [],
      launchUrl: null,
      installUrl: `com.epicgames.launcher://apps/${encodeURIComponent(`${item.namespace}:${item.id}:${appName}`)}?action=install`
    });
  }
  status.count = games.filter((g) => g.installed).length;
  status.owned = games.length;
  return { games, status };
}

module.exports = { library, defaultEpicDataPath };
