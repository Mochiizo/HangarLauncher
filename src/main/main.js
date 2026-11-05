'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, protocol } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createStore, dayKey } = require('./store');
const steam = require('./steam');
const epic = require('./epic');
const demo = require('./demo');
const { startTracker, runningGames } = require('./tracker');
const { steamNews } = require('./news');
const artwork = require('./artwork');
const updater = require('./updater');

// Version « Aperçu » : construite avec `npm run preview`, portable, sans installation.
// Elle a son propre dossier de données (copie de celles de Hangar) et ne touche pas à l'appli installée.
const PREVIEW = !!require('../../package.json').hangarPreview;

// Protocole interne pour afficher les images locales (cache Steam, images perso)
protocol.registerSchemesAsPrivileged([{ scheme: 'libimg', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let tray = null;
let quitting = false;
let store;
let cache = { games: [], status: {}, at: 0 };
const REFRESH_MS = 10 * 60_000;
const ICON = path.join(__dirname, '..', '..', 'build', 'icon.png');
const coversDir = () => path.join(app.getPath('userData'), 'covers');

function registerProtocol() {
  protocol.handle('libimg', (req) => {
    try { return serveImage(req); } catch (e) { console.error('[libimg]', req.url, e); return new Response('', { status: 500 }); }
  });
}

function serveImage(req) {
  {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname.replace(/^\//, ''));
    let file = null;
    if (u.host === 'steam') file = artwork.localSteamFile(store.settings().steamPath || steam.defaultSteamPath(), rel);
    else if (u.host === 'custom') {
      const p = path.resolve(coversDir(), path.basename(rel));
      if (p.startsWith(coversDir())) file = p;
    }
    if (!file || !fs.existsSync(file)) return new Response('', { status: 404 });
    const type = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(file).toLowerCase()] || 'application/octet-stream';
    return new Response(fs.readFileSync(file), { headers: { 'Content-Type': type, 'Cache-Control': 'max-age=3600', 'Access-Control-Allow-Origin': '*' } });
  }
}

function launchGame(key, action) {
  const g = cache.games.find((x) => x.key === key);
  if (!g) return false;
  if (action === 'uninstall') {
    if (!g.installed) return false;
    // Steam : ouvre sa fenêtre de confirmation de désinstallation.
    // Epic : pas de commande de désinstallation, on ouvre la bibliothèque du launcher.
    if (g.source === 'steam' && /^\d+$/.test(g.id)) { shell.openExternal(`steam://uninstall/${g.id}`); return 'steam'; }
    if (g.source === 'epic') { shell.openExternal('com.epicgames.launcher://library'); return 'epic'; }
    return false;
  }
  if (action === 'update' && g.source === 'steam') {
    // Steam n'autorise pas une autre appli à démarrer une mise à jour :
    // on ouvre sa page Téléchargements, où la mise à jour attend avec son bouton.
    shell.openExternal('steam://open/downloads');
    return true;
  }
  const url = action === 'install' ? g.installUrl : g.launchUrl;
  if (typeof url !== 'string' || !LAUNCH_RE.test(url)) return false;
  shell.openExternal(url);
  return true;
}

async function loadLibrary(force = false) {
  if (!force && cache.at && Date.now() - cache.at < REFRESH_MS) return cache;
  const settings = store.settings();
  const [s, e] = await Promise.all([steam.library(settings, store.db.nameCache), Promise.resolve(epic.library(settings))]);
  // Epic : temps de jeu issu du suivi des processus
  for (const g of e.games) Object.assign(g, store.epicStats(g.key));

  let games = [...s.games, ...e.games];
  const isDemo = games.length === 0;
  if (isDemo) games = demo.games();
  else {
    store.recordSnapshot(games);
    await artwork.enrichSteam(games, s.status.path, store.db.assetCache).catch(() => {});
  }
  // Images choisies par l'utilisateur : prioritaires partout
  for (const g of games) {
    const file = store.db.customCovers[g.key];
    if (file && fs.existsSync(path.join(coversDir(), file))) {
      const url = `libimg://custom/${encodeURIComponent(file)}?v=${fs.statSync(path.join(coversDir(), file)).mtimeMs | 0}`;
      g.images = { ...g.images, cover: [url], hero: [url], header: [url] };
      g.customCover = true;
    }
  }
  store.save();

  cache = { games, at: Date.now(), status: { demo: isDemo, steam: s.status, epic: e.status } };
  return cache;
}

function week(isDemo) {
  const data = isDemo ? demo.week() : null;
  // Jour de la dernière session de chaque jeu : affiché même sans durée connue
  const lastByDay = {};
  if (!isDemo) for (const g of cache.games) if (g.lastPlayed) (lastByDay[dayKey(new Date(g.lastPlayed))] ??= []).push(g.key);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = dayKey(d);
    const played = isDemo ? data[key] || {} : store.playedOn(key);
    const sessions = Object.entries(played).map(([gameKey, minutes]) => ({ gameKey, minutes }));
    for (const k of lastByDay[key] || []) if (!(k in played)) sessions.push({ gameKey: k, minutes: null });
    sessions.sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1));
    days.push({ date: key, sessions });
  }
  return { days, trackingSince: isDemo ? null : store.firstSnapshotDay() };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600,
    backgroundColor: '#0F1115', title: PREVIEW ? 'Hangar — Aperçu' : 'Hangar', icon: ICON, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // Les liens externes s'ouvrent dans le navigateur, jamais dans l'appli
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // Fermer la fenêtre la cache dans la zone de notification : le suivi du temps de jeu continue
  win.on('close', (e) => { if (!quitting && tray) { e.preventDefault(); win.hide(); } });
}

function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    tray.setToolTip('Hangar');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Ouvrir Hangar', click: () => { win.show(); win.focus(); } },
      { type: 'separator' },
      { label: 'Quitter', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', () => { win.show(); win.focus(); });
  } catch { tray = null; }
}

const LAUNCH_RE = /^(steam:\/\/(rungameid|install)\/\d+|com\.epicgames\.launcher:\/\/apps\/[^\s]+)$/;

function registerIpc() {
  ipcMain.handle('library:get', async (_e, force) => {
    const lib = await loadLibrary(!!force);
    const fav = store.db.favorites;
    return { status: lib.status, games: lib.games.map((g) => ({ ...g, exes: undefined, favorite: !!fav[g.key] })) };
  });
  ipcMain.handle('week:get', async () => week((await loadLibrary()).status.demo));
  ipcMain.handle('news:get', async (_e, appid) => {
    try { return { items: await steamNews(appid) }; } catch (e) { return { items: [], error: e.message }; }
  });
  ipcMain.handle('favorite:toggle', (_e, key) => store.toggleFavorite(String(key)));
  ipcMain.handle('game:launch', (_e, key, action) => launchGame(String(key), ['install', 'update', 'uninstall'].includes(action) ? action : 'play'));
  ipcMain.handle('running:get', async () => (cache.status.demo ? [] : runningGames(cache.games).catch(() => [])));
  ipcMain.handle('updates:get', () => {
    if (cache.status.demo) return {};
    try { return steam.updateStates(store.settings().steamPath); } catch { return {}; }
  });
  ipcMain.handle('steam:downloads', () => shell.openExternal('steam://open/downloads'));
  ipcMain.handle('cover:pick', async (_e, key) => {
    key = String(key);
    if (!cache.games.some((g) => g.key === key)) return false;
    const r = await dialog.showOpenDialog(win, { title: 'Choisir une image', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
    if (r.canceled || !r.filePaths[0]) return false;
    const ext = path.extname(r.filePaths[0]).toLowerCase();
    const name = key.replace(/[^a-z0-9_-]/gi, '_') + ext;
    fs.mkdirSync(coversDir(), { recursive: true });
    const old = store.db.customCovers[key];
    if (old && old !== name) fs.rmSync(path.join(coversDir(), old), { force: true });
    fs.copyFileSync(r.filePaths[0], path.join(coversDir(), name));
    store.db.customCovers[key] = name;
    store.save();
    await loadLibrary(true);
    return true;
  });
  ipcMain.handle('cover:reset', async (_e, key) => {
    key = String(key);
    const old = store.db.customCovers[key];
    if (old) fs.rmSync(path.join(coversDir(), path.basename(old)), { force: true });
    delete store.db.customCovers[key];
    store.save();
    await loadLibrary(true);
    return true;
  });
  ipcMain.handle('settings:get', () => ({
    ...store.settings(),
    defaults: { steamPath: steam.defaultSteamPath(), epicPath: epic.defaultEpicDataPath() },
    openAtLogin: app.getLoginItemSettings().openAtLogin
  }));
  ipcMain.handle('settings:set', async (_e, patch) => {
    const allowed = ['steamPath', 'epicPath', 'steamApiKey', 'steamId', 'accent'];
    const clean = {};
    for (const k of allowed) if (typeof patch?.[k] === 'string') clean[k] = patch[k].trim();
    store.setSettings(clean);
    if (typeof patch?.openAtLogin === 'boolean') app.setLoginItemSettings({ openAtLogin: patch.openAtLogin, args: ['--hidden'] });
    return true;
  });
  ipcMain.handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
}

// L'appli s'appelait « Bibliothèque » : on reprend ses données (temps de jeu, favoris, images) au premier lancement
function migrateFromOldName() {
  try {
    const newDir = app.getPath('userData');
    if (fs.existsSync(path.join(newDir, 'library-data.json'))) return;
    // Aperçu : on part des données de Hangar installé ; sinon de l'ancienne « Bibliothèque »
    const oldDir = [...(PREVIEW ? ['Hangar'] : []), 'Bibliothèque'].map((n) => path.join(app.getPath('appData'), n))
      .find((d) => fs.existsSync(path.join(d, 'library-data.json')));
    if (!oldDir) return;
    fs.mkdirSync(newDir, { recursive: true });
    fs.copyFileSync(path.join(oldDir, 'library-data.json'), path.join(newDir, 'library-data.json'));
    if (fs.existsSync(path.join(oldDir, 'covers'))) fs.cpSync(path.join(oldDir, 'covers'), path.join(newDir, 'covers'), { recursive: true });
  } catch { /* migration facultative */ }
}

app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
app.on('before-quit', () => { quitting = true; });

app.whenReady().then(() => {
  // Le nom de l'appli (« Bibliothèque ») finit dans le User-Agent ; un caractère accentué y casse
  // les requêtes internes (protocole libimg). On garde un User-Agent ASCII.
  app.userAgentFallback = app.userAgentFallback.normalize('NFD').replace(/[^\x20-\x7E]/g, '');
  migrateFromOldName();
  store = createStore(app.getPath('userData'));
  registerProtocol();
  registerIpc();
  createWindow();
  if (!PREVIEW) updater.setup(() => win, () => { quitting = true; });
  ipcMain.handle('app:info', () => ({ preview: PREVIEW, version: app.getVersion() }));
  if (!PREVIEW) createTray();
  if (process.argv.includes('--hidden')) win.hide();
  setInterval(() => loadLibrary(true).catch(() => {}), REFRESH_MS);
  startTracker(() => cache.games, (key) => store.addTrackedMinute(key));
  app.on('activate', () => { if (win) win.show(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !tray) app.quit(); });
