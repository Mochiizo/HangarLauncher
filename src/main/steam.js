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

function defaultSteamPath() {
  if (process.platform === 'win32') {
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
      if ((Number(vdf.get(st, 'StateFlags')) & 4) && !IGNORED.has(appid)) {
        map.set(appid, { name: vdf.get(st, 'name'), sizeBytes: Number(vdf.get(st, 'SizeOnDisk') || 0) });
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
  url.search = new URLSearchParams({ key: apiKey, steamid: steamId, include_appinfo: '1', include_played_free_games: '1', format: 'json' });
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (res.status === 401 || res.status === 403) throw new Error('Clé API Steam refusée');
  if (!res.ok) throw new Error(`API Steam : erreur ${res.status}`);
  const games = (await res.json())?.response?.games;
  if (!games) throw new Error('Profil Steam privé : rends les « détails de jeu » publics pour lister tous tes jeux');
  return games;
}

// Nom d'un jeu non installé : boutique Steam publique (mis en cache par l'appelant)
async function fetchAppName(appid) {
  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`, { signal: AbortSignal.timeout(8000) });
    const j = await res.json();
    const d = j?.[appid]?.data;
    return d && d.type === 'game' ? d.name : null; // ignore outils, DLC, démos
  } catch { return null; }
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
      installed: !!inst, sizeBytes: inst?.sizeBytes || 0, images: images(appid),
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

  // Jeux déjà lancés mais désinstallés (connus via localconfig) : on récupère leur nom
  const missing = Object.keys(played).map(Number).filter((id) => !games.has(id) && played[id].minutes > 0);
  for (const appid of missing.slice(0, 60)) {
    if (!(appid in nameCache)) nameCache[appid] = await fetchAppName(appid);
    if (nameCache[appid]) add(appid, nameCache[appid]);
  }

  return { games: [...games.values()], status };
}

module.exports = { library, defaultSteamPath };

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
