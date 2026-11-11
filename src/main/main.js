'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, protocol } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createStore, dayKey } = require('./store');
const steam = require('./steam');
const epic = require('./epic');
const more = require('./more');
const custom = require('./custom');
const friends = require('./friends');
const achievements = require('./achievements');
const demo = require('./demo');
const { startTracker, runningGames, gameState, pidAlive } = require('./tracker');
const { steamNews } = require('./news');
const artwork = require('./artwork');
const updater = require('./updater');
const { getReleases, details: releaseDetails } = require('./releases');

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

// ---------- Hangar se cache pendant la partie, puis revient ----------
// Après un clic sur Jouer :
//  - on cherche le jeu toutes les 3 s ; dès qu'il tourne → la fenêtre se cache (zone de notification)
//    ou se réduit (aperçu, sans icône) ;
//  - pendant la partie, on surveille ses processus chaque seconde (vérification instantanée, sans PowerShell),
//    avec un contrôle complet toutes les 15 s pour suivre un éventuel changement de processus ;
//  - quand ils disparaissent, on confirme par un contrôle complet puis la fenêtre revient en ~2 s.
//    Pendant les 90 premières secondes, on attend 20 s : un lanceur ou écran de chargement peut passer la main
//    au vrai jeu (Rocket League…). Une vérification incomplète n'est jamais prise pour une fin de partie.
const GONE_EARLY_MS = 20_000, GONE_MS = 2_000, EARLY_PHASE_MS = 90_000;
let session = null;

// Journal des parties (fin de partie détectée, etc.) pour comprendre un retour trop tôt : %APPDATA%\Hangar\parties.log
function sessionLog(msg) {
  try {
    const file = path.join(app.getPath('userData'), 'parties.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 512 * 1024) fs.renameSync(file, file + '.old');
    fs.appendFileSync(file, `${new Date().toISOString()} ${msg}\n`);
  } catch { /* ignore */ }
}

function watchGameSession(key) {
  if (session) clearInterval(session.timer);
  if (store.settings().hideWhilePlaying === false) return;
  session = { key, started: Date.now(), running: false, runningSince: 0, pids: [], lastScan: 0, goneSince: 0, goneScans: 0, hidden: false, busy: false, timer: null };
  const s = session;
  const g0 = cache.games.find((x) => x.key === key);
  sessionLog(`[${key}] Jouer : ${g0?.title || '?'} · dossier=${g0?.installDir || '-'} · exe=${(g0?.exes || []).join(',') || '-'}`);
  const finish = (why) => {
    clearInterval(s.timer);
    if (session === s) session = null;
    sessionLog(`[${key}] fin de surveillance : ${why}`);
  };
  const scan = async () => {
    s.lastScan = Date.now();
    const g = cache.games.find((x) => x.key === key);
    if (!g) return { running: false, pids: [], sure: false, procs: [] };
    return gameState(g, cache.games).catch((e) => ({ running: false, pids: [], sure: false, procs: [], err: String(e?.message || e) }));
  };
  s.timer = setInterval(async () => {
    if (s.busy || session !== s) return;
    s.busy = true;
    try {
      const now = Date.now();
      if (!s.running) {
        // en attente du démarrage du jeu
        if (now - s.lastScan < 2900) return;
        const st = await scan();
        if (st.running) {
          s.running = true; s.runningSince = Date.now(); s.pids = st.pids;
          sessionLog(`[${key}] jeu détecté après ${Math.round((Date.now() - s.started) / 1000)} s · processus=${st.procs.join(',') || 'registre Steam'}`);
          if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) {
            if (tray) win.hide(); else win.minimize();
            s.hidden = true;
          }
        } else if (now - s.started > 180_000) finish('jeu jamais détecté en 3 min');
        return;
      }
      // en partie : un processus connu tourne encore → le jeu tourne, point
      const alive = s.pids.some(pidAlive);
      if (alive) {
        if (s.goneSince) { sessionLog(`[${key}] fausse alerte : le jeu tourne toujours`); s.goneSince = 0; s.goneScans = 0; }
        if (now - s.lastScan < 15_000) return;
      } else if (!s.pids.length && !s.goneSince && now - s.lastScan < 2900) return; // jeu repéré seulement via Steam
      const st = await scan();
      if (st.running) {
        if (s.goneSince) sessionLog(`[${key}] le jeu est revenu (${st.procs.join(',') || 'registre Steam'}) après ${Math.round((Date.now() - s.goneSince) / 1000)} s`);
        s.goneSince = 0; s.goneScans = 0; s.pids = st.pids;
        return;
      }
      // liste des processus incomplète (PowerShell trop lent ou en échec) : ce n'est pas une preuve que le jeu est fermé
      if (!st.sure) { sessionLog(`[${key}] vérification incomplète, ignorée${st.err ? ` (${st.err})` : ''}`); return; }
      if (!s.goneSince) { s.goneSince = Date.now(); sessionLog(`[${key}] plus aucun processus du jeu après ${Math.round((Date.now() - s.runningSince) / 1000)} s de jeu`); }
      s.goneScans++;
      const wait = Date.now() - s.runningSince < EARLY_PHASE_MS ? GONE_EARLY_MS : GONE_MS;
      if (Date.now() - s.goneSince < wait || s.goneScans < 2) return;
      finish(`jeu fermé (confirmé en ${Math.round((Date.now() - s.goneSince) / 1000)} s)`);
      if (s.hidden && win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        win.webContents.send('game-ended', key);
      }
    } finally { s.busy = false; }
  }, 1000);
}

// Liens externes : une page de jeu du magasin Steam s'ouvre dans l'appli Steam si elle est installée,
// le reste dans le navigateur
function openLink(url) {
  if (!/^https:\/\//.test(url)) return;
  const m = url.match(/^https:\/\/store\.steampowered\.com\/app\/(\d+)/);
  const steamPath = store.settings().steamPath || steam.defaultSteamPath();
  const hasSteam = steamPath && fs.existsSync(steamPath);
  if (m && hasSteam) shell.openExternal(`steam://store/${m[1]}`);
  // Pages de la communauté Steam (confidentialité, clé API, profils…) : dans l'appli Steam, où l'on est déjà connecté
  else if (hasSteam && /^https:\/\/steamcommunity\.com\//.test(url)) shell.openExternal(`steam://openurl/${url}`);
  else shell.openExternal(url);
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
    // Ubisoft, EA, Xbox : désinstallation depuis les paramètres Windows (Applications installées)
    if (['ubisoft', 'ea', 'xbox', 'gog'].includes(g.source)) { shell.openExternal('ms-settings:appsfeatures'); return 'windows'; }
    return false;
  }
  if (action === 'update' && g.source === 'steam') {
    // Steam n'autorise pas une autre appli à démarrer une mise à jour :
    // on ouvre sa page Téléchargements, où la mise à jour attend avec son bouton.
    shell.openExternal('steam://open/downloads');
    return true;
  }
  if (action === 'play' && g.source === 'custom') return custom.launch(g);
  if (action === 'play' && (g.launchExe || g.appUserModelId || g.source === 'gog')) return more.launch(g);
  const url = action === 'install' ? g.installUrl : g.launchUrl;
  if (typeof url !== 'string' || !LAUNCH_RE.test(url)) return false;
  shell.openExternal(url);
  return true;
}

// Empreinte légère de la bibliothèque : jeux Steam installés (toutes les bibliothèques, disques externes compris),
// manifestes Epic et cache du catalogue Epic (mis à jour quand un jeu est ajouté au compte)
function librarySignature() {
  const settings = store.settings();
  const parts = [];
  try {
    const sp = settings.steamPath || steam.defaultSteamPath();
    if (sp && fs.existsSync(sp)) {
      parts.push([...steam.installedApps(sp).keys()].sort().join(','));
      // un jeu ajouté à la bibliothèque Steam (même sans l'installer) crée un dossier dans librarycache
      parts.push(`lib:${steam.libraryCacheIds(sp).size}`);
    }
  } catch { /* ignore */ }
  const ep = settings.epicPath || epic.defaultEpicDataPath();
  if (ep) {
    try { parts.push(fs.readdirSync(path.join(ep, 'Manifests')).filter((f) => f.endsWith('.item')).sort().join(',')); } catch { /* ignore */ }
    try { const st = fs.statSync(path.join(ep, 'Catalog', 'catcache.bin')); parts.push(`${st.size}:${st.mtimeMs | 0}`); } catch { /* ignore */ }
  }
  return parts.join('|');
}

// Vérifie toutes les 15 s si un jeu a été installé, désinstallé ou ajouté, et prévient l'interface
function watchLibrary() {
  let last = null, busy = false, tick = 0;
  setInterval(async () => {
    if (busy) return;
    // Ubisoft, EA, Xbox : lecture plus lourde (PowerShell), toutes les 3 min et jamais pendant une partie
    if (++tick % 12 === 0 && !session) {
      busy = true;
      try {
        const o = await more.library();
        const now = o.games.map((g) => g.key).sort().join(',');
        const before = cache.games.filter((g) => ['ubisoft', 'ea', 'xbox', 'gog'].includes(g.source)).map((g) => g.key).sort().join(',');
        // un jeu Ubisoft/EA déjà fourni par Steam/Epic n'est pas dans cache : on compare seulement les nouveaux venus
        const added = o.games.some((g) => !cache.games.some((c) => c.key === g.key || (c.installDir && g.installDir && c.installDir.toLowerCase() === g.installDir.toLowerCase())));
        const removed = before && before.split(',').some((k) => !now.split(',').includes(k));
        if (added || removed) {
          await loadLibrary(true);
          if (win && !win.isDestroyed()) win.webContents.send('library-changed');
        }
      } catch { /* ignore */ } finally { busy = false; }
      return;
    }
    const sig = librarySignature();
    if (last === null) { last = sig; return; }
    if (sig === last) return;
    last = sig; busy = true;
    try {
      await loadLibrary(true);
      if (win && !win.isDestroyed()) win.webContents.send('library-changed');
    } catch { /* ignore */ } finally { busy = false; }
  }, 15_000);
}

// Un seul chargement à la fois : un second appel pendant un chargement attend le même résultat
let libInflight = null;
function loadLibrary(force = false, onStep) {
  if (!force && cache.at && Date.now() - cache.at < REFRESH_MS) return Promise.resolve(cache);
  if (libInflight) return libInflight;
  libInflight = loadLibraryNow(onStep).finally(() => { libInflight = null; });
  return libInflight;
}

async function loadLibraryNow(onStep) {
  const step = (name) => (r) => { try { onStep?.(name); } catch { /* ignore */ } return r; };
  const settings = store.settings();
  // Ancienne version : un échec réseau était mémorisé comme « pas un jeu ». On oublie ces réponses une fois.
  if (!store.db.nameCacheV2) {
    for (const [id, n] of Object.entries(store.db.nameCache)) if (!n) delete store.db.nameCache[id];
    store.db.nameCacheV2 = true;
  }
  const [s, e, o] = await Promise.all([
    steam.library(settings, store.db.nameCache).then(step('steam')),
    Promise.resolve(epic.library(settings)).then(step('epic')),
    more.library().catch(() => ({ games: [], status: {} })).then(step('more'))
  ]);
  // Diagnostic Ubisoft / EA / Xbox : %APPDATA%\Hangar\plateformes.json
  try {
    const diag = { version: app.getVersion(), at: new Date().toISOString(), steam: steam.diagnostic(settings.steamPath), epic: { count: e.games.length, installed: e.games.filter((g) => g.installed).map((g) => g.title), status: e.status }, autres: more.diagnostic() };
    fs.writeFileSync(path.join(app.getPath('userData'), 'diagnostic.json'), JSON.stringify(diag, null, 2));
  } catch { /* ignore */ }
  // Ubisoft, EA, Xbox : un jeu déjà présent via Steam ou Epic (même dossier) n'est pas ajouté une deuxième fois
  const dirKey = (d) => String(d || '').toLowerCase().replace(/[\\/]+$/, '');
  const knownDirs = new Set([...s.games, ...e.games].filter((g) => g.installDir).map((g) => dirKey(g.installDir)));
  const others = o.games.filter((g) => !g.installDir || !knownDirs.has(dirKey(g.installDir)));
  // Jeux ajoutés à la main (Roblox, Soulframe…)
  others.push(...custom.library(store.db.customGames));
  // Epic, Ubisoft, EA, Xbox : temps de jeu issu du suivi des processus
  for (const g of [...e.games, ...others]) Object.assign(g, store.epicStats(g.key));

  let games = [...s.games, ...e.games, ...others];
  const isDemo = games.length === 0;
  if (isDemo) games = demo.games();
  else {
    store.recordSnapshot(games);
    step('art')();
    await artwork.enrichSteam(games, s.status.path, store.db.assetCache).catch(() => {});
    await artwork.enrichByTitle(others, store.db.titleCache, store.db.assetCache).catch(() => {});
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

  // Jeux Steam de la bibliothèque dont on ne connaît pas encore le nom : recherche en arrière-plan,
  // la bibliothèque se complète au fur et à mesure
  const pendingNames = s.status.pendingNames || [];
  delete s.status.pendingNames;
  s.status.pendingCount = pendingNames.length;
  if (pendingNames.length && !isDemo) {
    steam.resolveNames(pendingNames, store.db.nameCache, {
      onProgress: async () => {
        store.save();
        await loadLibrary(true).catch(() => {});
        if (win && !win.isDestroyed()) win.webContents.send('library-changed');
      }
    }).catch(() => {});
  }

  cache = { games, at: Date.now(), status: { demo: isDemo, steam: s.status, epic: e.status, more: o.status } };
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

function createWindow(show = true) {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600, show,
    backgroundColor: '#0F1115', title: PREVIEW ? 'Hangar — Aperçu' : 'Hangar', icon: ICON, autoHideMenuBar: true,
    // Pas de barre de titre Windows : la barre du haut de Hangar en tient lieu (déplacement, boutons de fenêtre)
    titleBarStyle: 'hidden',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // Les liens externes s'ouvrent dans le navigateur, jamais dans l'appli
  win.webContents.setWindowOpenHandler(({ url }) => { openLink(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // Fermer la fenêtre la cache dans la zone de notification : le suivi du temps de jeu continue
  win.on('close', (e) => { if (!quitting && tray) { e.preventDefault(); win.hide(); } });
  const sendMax = () => { if (!win.isDestroyed()) win.webContents.send('window-state', { maximized: win.isMaximized() }); };
  win.on('maximize', sendMax);
  win.on('unmaximize', sendMax);
}

// ---------- Écran de chargement ----------
// À l'ouverture de Hangar (appli complètement fermée), une petite fenêtre montre le chargement réel :
// bibliothèque de toutes les plateformes, jaquettes, prochaines sorties, amis, succès des derniers jeux.
// La fenêtre principale n'apparaît qu'une fois tout prêt et affiché, puis la fusée décolle.
// Le clip d'ouverture se joue en entier (ou jusqu'à « Passer ») : Hangar s'ouvre quand le clip ET le chargement sont finis.
let splash = null, splashLast = null, introDone = Promise.resolve();
function createSplash() {
  introDone = new Promise((resolve) => ipcMain.once('splash:finished', resolve));
  splash = new BrowserWindow({
    width: 960, height: 540, frame: false, resizable: false, maximizable: false, fullscreenable: false,
    show: false, center: true, backgroundColor: '#07080B', title: 'Hangar', icon: ICON, skipTaskbar: false,
    webPreferences: { preload: path.join(__dirname, 'splash-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required' }
  });
  splash.loadFile(path.join(__dirname, '..', 'renderer', 'splash.html'), { query: { v: app.getVersion() } });
  // L'intro passe au premier plan, même par-dessus une appli en plein écran
  splash.once('ready-to-show', () => {
    if (!splash) return;
    splash.setAlwaysOnTop(true, 'screen-saver');
    splash.show(); splash.moveTop(); splash.focus();
  });
  // une étape envoyée avant que la page soit prête n'est pas perdue
  splash.webContents.on('did-finish-load', () => { if (splashLast) splash?.webContents.send('splash-progress', splashLast); });
  splash.on('closed', () => { splash = null; });
}
function splashProgress(percent, text) {
  splashLast = { percent, text };
  if (splash && !splash.isDestroyed()) splash.webContents.send('splash-progress', { percent, text });
}
const within = (p, ms) => Promise.race([Promise.resolve(p).catch(() => null), new Promise((r) => setTimeout(r, ms))]);

async function warmup() {
  splashProgress(6, 'Démarrage…');
  splashProgress(12, 'Lecture de ta bibliothèque…');
  const steps = { steam: [30, 'Bibliothèque Steam chargée…'], epic: [38, 'Epic Games…'], more: [46, 'Ubisoft, EA, Xbox et GOG…'], art: [54, 'Chargement des jaquettes…'] };
  await within(loadLibrary(true, (name) => steps[name] && splashProgress(...steps[name])), 30000);
  if (cache.status?.demo) return;
  const settings = store.settings();
  const steamId = settings.steamId || cache.status?.steam?.user?.steamId || null;

  splashProgress(64, 'Prochaines sorties…');
  const owned = new Set(cache.games.filter((g) => g.source === 'steam').map((g) => g.id));
  await within(getReleases({ steamId, cache: store.db.releaseCache, ownedIds: owned }), 8000);

  if (settings.steamApiKey && steamId) {
    splashProgress(76, 'Tes amis…');
    await within(friends.list(settings.steamApiKey, steamId), 6000);
    // Succès des jeux Steam joués récemment : prêts dès l'ouverture de leur fiche
    splashProgress(84, 'Tes succès…');
    const recent = cache.games.filter((g) => g.source === 'steam' && g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 4);
    await within(Promise.all(recent.map((g) => achievements.forGame(settings.steamApiKey, steamId, g.id))), 8000);
  }
  try { store.save(); } catch { /* ignore */ }
}

// Ouverture : écran de chargement → préchargement → fenêtre principale prête → décollage
async function startWithSplash() {
  createSplash();
  const t0 = Date.now();
  await warmup();
  splashProgress(92, "Préparation de l'interface…");
  // La fenêtre principale se construit cachée ; elle prévient quand l'accueil et ses images sont affichés
  const ready = new Promise((resolve) => ipcMain.once('app:ready', resolve));
  createWindow(false);
  await within(ready, 8000);
  // Au moins ~1,2 s d'écran de chargement, pour que l'animation ne « clignote » pas
  const wait = 1200 - (Date.now() - t0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  splashProgress(100, 'Prêt !');
  await new Promise((r) => setTimeout(r, 350));
  // on attend la fin du clip (30 s maximum, au cas où la vidéo resterait bloquée)
  await within(introDone, 30000);
  if (splash && !splash.isDestroyed()) splash.webContents.send('splash-done');
  await new Promise((r) => setTimeout(r, 650)); // décollage de la fusée
  if (win && !win.isDestroyed()) {
    // Hangar prend le relais au premier plan, puis redevient une fenêtre normale
    win.setAlwaysOnTop(true, 'screen-saver');
    win.show(); win.moveTop(); win.focus();
    setTimeout(() => { if (win && !win.isDestroyed()) win.setAlwaysOnTop(false); }, 800);
  }
  if (splash && !splash.isDestroyed()) splash.close();
}

function createTray() {
  try {
    // icône simplifiée (toit + fusée), lisible en 16 px près de l'horloge
    const trayIcon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'build', 'tray.png'));
    tray = new Tray(trayIcon.isEmpty() ? nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }) : trayIcon.resize({ width: 16, height: 16, quality: 'best' }));
    tray.setToolTip('Hangar');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Ouvrir Hangar', click: () => { if (win && !splash) { win.show(); win.focus(); } } },
      { type: 'separator' },
      { label: 'Quitter', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', () => { if (win && !splash) { win.show(); win.focus(); } });
  } catch { tray = null; }
}

const LAUNCH_RE = /^(steam:\/\/(rungameid|install)\/\d+|com\.epicgames\.launcher:\/\/apps\/[^\s]+|uplay:\/\/launch\/\d+\/\d+)$/;

function registerIpc() {
  ipcMain.handle('library:get', async (_e, force) => {
    const lib = await loadLibrary(!!force);
    const fav = store.db.favorites;
    return { status: lib.status, games: lib.games.map((g) => ({ ...g, exes: undefined, installDir: undefined, favorite: !!fav[g.key] })) };
  });
  ipcMain.handle('week:get', async () => week((await loadLibrary()).status.demo));
  ipcMain.handle('news:get', async (_e, appid) => {
    try { return { items: await steamNews(appid) }; } catch (e) { return { items: [], error: e.message }; }
  });
  ipcMain.handle('favorite:toggle', (_e, key) => store.toggleFavorite(String(key)));
  ipcMain.handle('game:launch', (_e, key, action) => {
    const act = ['install', 'update', 'uninstall'].includes(action) ? action : 'play';
    const r = launchGame(String(key), act);
    if (r && act === 'play') watchGameSession(String(key));
    return r;
  });
  ipcMain.handle('releases:get', async () => {
    if (cache.status.demo) return { games: [], demo: true };
    try {
      const owned = new Set(cache.games.filter((g) => g.source === 'steam').map((g) => g.id));
      const r = await getReleases({ steamId: store.settings().steamId || cache.status.steam?.user?.steamId, cache: store.db.releaseCache, ownedIds: owned });
      // on ne garde en cache que les fiches récentes
      for (const [id, v] of Object.entries(store.db.releaseCache)) if (Date.now() - v.at > 7 * 86400000) delete store.db.releaseCache[id];
      store.save();
      return r;
    } catch (e) { return { games: [], error: e.message }; }
  });
  ipcMain.handle('release:details', async (_e, id) => {
    const d = await releaseDetails(String(id), store.db.releaseCache).catch(() => null);
    store.save();
    return d;
  });
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
  // Jeux ajoutés à la main : choix du fichier → nom proposé → ajout / retrait
  ipcMain.handle('custom:pick', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choisir le jeu à ajouter', properties: ['openFile'],
      filters: [{ name: 'Jeux et raccourcis', extensions: ['exe', 'lnk', 'url'] }]
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return custom.suggest(r.filePaths[0]);
  });
  ipcMain.handle('custom:add', async (_e, file, title) => {
    file = String(file || ''); title = String(title || '').trim().slice(0, 120);
    if (!/\.(exe|lnk|url)$/i.test(file) || !fs.existsSync(file) || !title) return null;
    const dup = store.db.customGames.find((c) => c.file.toLowerCase() === file.toLowerCase());
    if (dup) { dup.title = title; store.save(); await loadLibrary(true); return dup.key; }
    const key = `custom-${Date.now().toString(36)}`;
    store.db.customGames.push({ key, title, file });
    store.save();
    await loadLibrary(true);
    return key;
  });
  ipcMain.handle('custom:remove', async (_e, key) => {
    key = String(key);
    const before = store.db.customGames.length;
    store.db.customGames = store.db.customGames.filter((c) => c.key !== key);
    if (store.db.customGames.length === before) return false;
    const cover = store.db.customCovers[key];
    if (cover) fs.rmSync(path.join(coversDir(), path.basename(cover)), { force: true });
    delete store.db.customCovers[key];
    delete store.db.favorites[key];
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
    if (typeof patch?.hideWhilePlaying === 'boolean') clean.hideWhilePlaying = patch.hideWhilePlaying;
    if (typeof patch?.onboarded === 'boolean') clean.onboarded = patch.onboarded;
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

app.on('second-instance', () => { if (win && !splash) { win.show(); win.focus(); } else if (splash) splash.focus(); });
app.on('before-quit', () => { quitting = true; });

app.whenReady().then(() => {
  // Le nom de l'appli (« Bibliothèque ») finit dans le User-Agent ; un caractère accentué y casse
  // les requêtes internes (protocole libimg). On garde un User-Agent ASCII.
  app.userAgentFallback = app.userAgentFallback.normalize('NFD').replace(/[^\x20-\x7E]/g, '');
  migrateFromOldName();
  store = createStore(app.getPath('userData'));
  registerProtocol();
  registerIpc();
  if (!PREVIEW) updater.setup(() => win, () => { quitting = true; });
  ipcMain.handle('app:info', () => ({ preview: PREVIEW, version: app.getVersion() }));
  // Boutons de fenêtre dessinés par Hangar (réduire, agrandir, fermer)
  ipcMain.handle('window:action', (_e, action) => {
    if (!win || win.isDestroyed()) return null;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
    else if (action === 'close') win.close();
    return { maximized: win.isMaximized() };
  });
  // Amis Steam (clé API) : statut, jeu en cours ; un clic ouvre la discussion dans Steam
  ipcMain.handle('friends:get', () => {
    const settings = store.settings();
    const steamId = settings.steamId || cache.status?.steam?.user?.steamId || null;
    return friends.list(settings.steamApiKey, steamId);
  });
  // Succès Steam d'un jeu (clé API)
  ipcMain.handle('achievements:get', (_e, key) => {
    const g = cache.games.find((x) => x.key === key);
    if (!g || g.source !== 'steam') return { status: 'none', items: [] };
    const settings = store.settings();
    const steamId = settings.steamId || cache.status?.steam?.user?.steamId || null;
    return achievements.forGame(settings.steamApiKey, steamId, g.id);
  });
  ipcMain.handle('friends:open', (_e, id, action) => {
    if (!/^\d{17}$/.test(String(id))) return false;
    shell.openExternal(action === 'profile' ? `steam://url/SteamIDPage/${id}` : `steam://friends/message/${id}`);
    return true;
  });
  // Montre le fichier de diagnostic dans l'Explorateur (à envoyer quand un jeu manque)
  ipcMain.handle('diag:open', () => {
    const file = path.join(app.getPath('userData'), 'diagnostic.json');
    if (fs.existsSync(file)) shell.showItemInFolder(file); else shell.openPath(app.getPath('userData'));
    return true;
  });
  if (!PREVIEW) createTray();
  // Ouverture à la main comme au démarrage de Windows : intro, chargement, puis Hangar s'ouvre
  startWithSplash().catch(() => { if (!win) createWindow(); else win.show(); });
  setInterval(() => loadLibrary(true).then(() => { if (win && !win.isDestroyed()) win.webContents.send('library-changed'); }).catch(() => {}), REFRESH_MS);
  watchLibrary();
  startTracker(() => cache.games, (key) => store.addTrackedMinute(key));
  app.on('activate', () => { if (win) win.show(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !tray) app.quit(); });
