// Steam : tout est lu sur l'ordinateur de l'utilisateur.
//  - loginusers.vdf      → compte connecté (SteamID64)
//  - libraryfolders.vdf  → dossiers de bibliothèque
//  - appmanifest_*.acf   → jeux installés (nom, taille)
//  - localconfig.vdf     → temps de jeu et dernière session de chaque jeu lancé
// L'API Web (clé facultative) complète avec les jeux possédés jamais installés.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vdf = require('./vdf');

const STEAMID64_BASE = 76561197960265728n;
const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
const IGNORED = new Set([228980, 250820, 1070560, 1391110, 1628350, 1826330]); // redistribuables, runtimes, VR

// Dossier de Steam : celui que Steam inscrit dans le registre (Steam peut être installé sur D:, E:…),
// sinon les emplacements habituels
let regSteamPath;
function registrySteamPath() {
  if (regSteamPath !== undefined) return regSteamPath;
  regSteamPath = null;
  for (const [key, value] of [['HKCU\\Software\\Valve\\Steam', 'SteamPath'], ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'], ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath']]) {
    try {
      const out = require('node:child_process').execFileSync('reg', ['query', key, '/v', value], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      const m = out.match(new RegExp(`${value}\\s+REG_\\w+\\s+(.+)`));
      const p = m && path.normalize(m[1].trim());
      if (p && fs.existsSync(p)) { regSteamPath = p; break; }
    } catch { /* clé absente */ }
  }
  return regSteamPath;
}

function defaultSteamPath() {
  if (process.platform === 'win32') {
    const reg = registrySteamPath();
    if (reg) return reg;
    for (const p of ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']) if (fs.existsSync(p)) return p;
    return 'C:\\Program Files (x86)\\Steam';
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library/Application Support/Steam');
  const linux = [path.join(os.homedir(), '.local/share/Steam'), path.join(os.homedir(), '.steam/steam')];
  return linux.find((p) => fs.existsSync(p)) || linux[0];
}

function readVdf(file) {
  try { return vdf.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function images(appid) {
  return {
    cover: `${CDN}/${appid}/library_600x900.jpg`,
    hero: `${CDN}/${appid}/library_hero.jpg`,
    header: `${CDN}/${appid}/header.jpg`
  };
}

function currentUser(steamPath) {
  const users = vdf.get(readVdf(path.join(steamPath, 'config', 'loginusers.vdf')), 'users');
  if (!users) return null;
  const entries = Object.entries(users);
  const pick = entries.find(([, u]) => vdf.get(u, 'MostRecent') === '1') ||
    entries.sort((a, b) => Number(vdf.get(b[1], 'Timestamp') || 0) - Number(vdf.get(a[1], 'Timestamp') || 0))[0];
  if (!pick) return null;
  const [steamId, u] = pick;
  return { steamId, accountId: String(BigInt(steamId) - STEAMID64_BASE), name: vdf.get(u, 'PersonaName') || vdf.get(u, 'AccountName') };
}

function libraryFolders(steamPath) {
  const out = new Set([steamPath]);
  const lf = vdf.get(readVdf(path.join(steamPath, 'steamapps', 'libraryfolders.vdf')), 'libraryfolders');
  if (lf) for (const v of Object.values(lf)) { const p = vdf.get(v, 'path'); if (p) out.add(p); }
  return [...out];
}

function installedApps(steamPath) {
  const map = new Map();
  for (const folder of libraryFolders(steamPath)) {
    const dir = path.join(folder, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
      const st = vdf.get(readVdf(path.join(dir, f)), 'AppState');
      if (!st) continue;
      const appid = Number(vdf.get(st, 'appid'));
      // Installé = « entièrement installé », ou déjà installé une fois et en cours / en attente de mise à jour
      // (pendant une mise à jour, Steam retire le bit « installé » : Wuthering Waves, gros jeux…)
      const depots = vdf.get(st, 'InstalledDepots');
      const wasInstalled = depots && typeof depots === 'object' && Object.keys(depots).length > 0;
      if (((Number(vdf.get(st, 'StateFlags')) & 4) || wasInstalled) && !IGNORED.has(appid)) {
        const dirName = vdf.get(st, 'installdir');
        map.set(appid, { name: vdf.get(st, 'name'), sizeBytes: Number(vdf.get(st, 'SizeOnDisk') || 0), installDir: dirName ? path.join(folder, 'steamapps', 'common', dirName) : null });
      }
    }
  }
  return map;
}

// { appid: { minutes, minutes2w, lastPlayed } } depuis localconfig.vdf
function localPlaytime(steamPath, accountId) {
  const file = path.join(steamPath, 'userdata', accountId, 'config', 'localconfig.vdf');
  const apps = vdf.get(readVdf(file), 'UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps');
  const out = {};
  if (!apps) return out;
  for (const [id, a] of Object.entries(apps)) {
    const appid = Number(id);
    if (!appid || IGNORED.has(appid)) continue;
    const minutes = Number(vdf.get(a, 'Playtime') || 0);
    const lastPlayed = Number(vdf.get(a, 'LastPlayed') || 0) * 1000;
    if (minutes || lastPlayed) out[appid] = { minutes, minutes2w: Number(vdf.get(a, 'Playtime2wks') || 0), lastPlayed };
  }
  return out;
}

async function ownedFromApi(apiKey, steamId) {
  const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/');
  // include_free_sub : jeux gratuits ajoutés à la bibliothèque sans y avoir joué ; skip_unvetted_apps=0 : jeux tout récents
  url.search = new URLSearchParams({ key: apiKey, steamid: steamId, include_appinfo: '1', include_played_free_games: '1', include_free_sub: '1', skip_unvetted_apps: '0', format: 'json' });
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (res.status === 401 || res.status === 403) throw new Error('Clé API Steam refusée');
  if (!res.ok) throw new Error(`API Steam : erreur ${res.status}`);
  const games = (await res.json())?.response?.games;
  if (!games) throw new Error('Profil Steam privé : rends les « détails de jeu » publics pour lister tous tes jeux');
  return games;
}

// Nom d'un jeu non installé : boutique Steam publique (mis en cache par l'appelant)
// Nom d'un jeu via la boutique : null = pas un jeu (outil, DLC, démo, retiré), undefined = échec réseau (on réessaiera)
async function fetchAppName(appid) {
  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return undefined; // limite de requêtes de la boutique (429) ou panne
    const j = await res.json();
    if (!j?.[appid]) return undefined;
    const d = j[appid].data;
    return j[appid].success && d && d.type === 'game' ? d.name : null;
  } catch { return undefined; }
}

// Identifiants présents dans appcache/librarycache. Ce n'est pas la liste des jeux possédés (Steam y met
// aussi les jeux vus en magasin ou chez des amis) : on s'en sert seulement pour détecter un changement.
function libraryCacheIds(steamPath) {
  const ids = new Set();
  try {
    for (const name of fs.readdirSync(path.join(steamPath, 'appcache', 'librarycache'))) {
      const m = name.match(/^(\d+)(?:_|$)/); // dossier « 1234 » (Steam récent) ou fichier « 1234_header.jpg » (ancien)
      if (m) ids.add(Number(m[1]));
    }
  } catch { /* dossier absent */ }
  return ids;
}

// Résout en arrière-plan les noms des jeux encore inconnus (≈ 1 requête / 1,6 s pour respecter la limite
// de la boutique). onProgress est appelé tous les `every` jeux trouvés.
let resolving = false;
async function resolveNames(ids, nameCache, { onProgress, every = 25 } = {}) {
  if (resolving) return 0;
  resolving = true;
  let found = 0, sinceTick = 0;
  try {
    for (const appid of ids) {
      if (appid in nameCache) continue;
      const name = await fetchAppName(appid);
      if (name === undefined) { await new Promise((r) => setTimeout(r, 30_000)); continue; } // on ralentit, on reprendra plus tard
      nameCache[appid] = name;
      if (name) { found++; if (++sinceTick >= every) { sinceTick = 0; await onProgress?.(); } }
      await new Promise((r) => setTimeout(r, 1600));
    }
    if (sinceTick) await onProgress?.();
  } finally { resolving = false; }
  return found;
}

async function library(settings, nameCache) {
  const steamPath = settings.steamPath || defaultSteamPath();
  const status = { path: steamPath, found: fs.existsSync(steamPath), user: null, api: settings.steamApiKey ? 'pending' : 'off', error: null };
  if (!status.found && !settings.steamApiKey) return { games: [], status };

  const user = status.found ? currentUser(steamPath) : null;
  status.user = user && { steamId: user.steamId, name: user.name };
  const installed = status.found ? installedApps(steamPath) : new Map();
  const played = user ? localPlaytime(steamPath, user.accountId) : {};

  const games = new Map();
  const add = (appid, title, extra = {}) => {
    const p = played[appid] || {};
    const inst = installed.get(appid);
    games.set(appid, {
      key: `steam-${appid}`, source: 'steam', id: String(appid), title,
      minutes: p.minutes || 0, minutes2w: p.minutes2w || 0, lastPlayed: p.lastPlayed || 0,
      installed: !!inst, sizeBytes: inst?.sizeBytes || 0, installDir: inst?.installDir || null, images: images(appid),
      launchUrl: `steam://rungameid/${appid}`, installUrl: `steam://install/${appid}`, ...extra
    });
  };

  for (const [appid, info] of installed) add(appid, info.name);

  const steamId = settings.steamId || user?.steamId;
  if (settings.steamApiKey && steamId) {
    try {
      for (const g of await ownedFromApi(settings.steamApiKey, steamId)) {
        const prev = games.get(g.appid);
        add(g.appid, g.name, {
          minutes: Math.max(g.playtime_forever || 0, prev?.minutes || 0),
          minutes2w: g.playtime_2weeks || prev?.minutes2w || 0,
          lastPlayed: Math.max((g.rtime_last_played || 0) * 1000, prev?.lastPlayed || 0)
        });
      }
      status.api = 'ok';
    } catch (e) { status.api = 'error'; status.error = e.message; }
  }

  // Jeux non installés mais déjà lancés (localconfig). Noms déjà connus → ajoutés tout de suite ;
  // les autres sont cherchés en arrière-plan (status.pendingNames).
  // (librarycache n'est PAS une liste de jeux possédés : Steam y range aussi les pages de magasin
  //  consultées, les jeux des amis… Il sert seulement à repérer qu'un jeu a été ajouté.)
  const candidates = new Set(Object.keys(played).map(Number).filter((id) => played[id].minutes > 0));
  const pending = [];
  for (const appid of candidates) {
    if (games.has(appid) || IGNORED.has(appid)) continue;
    if (appid in nameCache) { if (nameCache[appid]) add(appid, nameCache[appid]); }
    else pending.push(appid);
  }
  // les jeux joués d'abord, ils comptent plus
  pending.sort((a, b) => (played[b]?.minutes || 0) - (played[a]?.minutes || 0));
  status.pendingNames = pending;

  return { games: [...games.values()], status };
}

// Diagnostic : où Hangar cherche les jeux Steam et ce qu'il y trouve
function diagnostic(steamPath) {
  steamPath = steamPath || defaultSteamPath();
  const out = { steamPath, registry: process.platform === 'win32' ? registrySteamPath() : null, found: fs.existsSync(steamPath), folders: [] };
  for (const folder of libraryFolders(steamPath)) {
    const dir = path.join(folder, 'steamapps');
    const entry = { folder, exists: fs.existsSync(dir), games: [] };
    let files = [];
    try { files = fs.readdirSync(dir); } catch (e) { entry.error = e.code || e.message; }
    for (const f of files) {
      if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
      const st = vdf.get(readVdf(path.join(dir, f)), 'AppState');
      entry.games.push(st ? `${vdf.get(st, 'appid')} | ${vdf.get(st, 'name')} | flags=${vdf.get(st, 'StateFlags')}` : `${f} | illisible`);
    }
    out.folders.push(entry);
  }
  return out;
}

module.exports = { library, defaultSteamPath, installedApps, resolveNames, diagnostic, libraryCacheIds };

// ---------- État des mises à jour (lu en direct dans les appmanifest) ----------
// Bits de StateFlags (client Steam)
const F = { UpdateRequired: 2, FullyInstalled: 4, AppRunning: 64, UpdateRunning: 256, UpdatePaused: 512, UpdateStarted: 1024,
  Validating: 131072, Preallocating: 524288, Downloading: 1048576, Staging: 2097152, Committing: 4194304 };

let foldersCache = { at: 0, path: '', list: [] };

// { "steam-<appid>": { state, phase, progress, done, total, running } }
function updateStates(steamPath) {
  steamPath = steamPath || defaultSteamPath();
  if (foldersCache.path !== steamPath || Date.now() - foldersCache.at > 60_000) {
    foldersCache = { at: Date.now(), path: steamPath, list: libraryFolders(steamPath) };
  }
  const out = {};
  for (const folder of foldersCache.list) {
    const dir = path.join(folder, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
      const st = vdf.get(readVdf(path.join(dir, f)), 'AppState');
      if (!st) continue;
      const flags = Number(vdf.get(st, 'StateFlags') || 0);
      const appid = vdf.get(st, 'appid');
      const n = (k) => Number(vdf.get(st, k) || 0);
      const toDl = n('BytesToDownload'), dl = n('BytesDownloaded'), toStage = n('BytesToStage'), staged = n('BytesStaged');

      let state = null;
      if (flags & (F.Downloading | F.UpdateRunning | F.Staging | F.Committing | F.Preallocating | F.Validating)) state = 'updating';
      else if (flags & (F.UpdatePaused | F.UpdateStarted)) state = 'paused';
      else if (flags & F.UpdateRequired) state = 'pending';
      const running = !!(flags & F.AppRunning);
      if (!state && !running) continue;

      let phase = 'download', done = dl, total = toDl;
      if (flags & F.Validating) phase = 'validate';
      else if (toDl > 0 && dl >= toDl && toStage > 0) { phase = 'install'; done = staged; total = toStage; }
      else if (flags & (F.Staging | F.Committing)) { phase = 'install'; done = staged; total = toStage; }
      out[`steam-${appid}`] = { state, phase, running, done, total, progress: total > 0 ? Math.min(1, done / total) : null };
    }
  }
  return out;
}

module.exports.updateStates = updateStates;
