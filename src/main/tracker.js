// Détection des jeux en cours d'exécution.
// Un jeu est « lancé » tant qu'un programme de SON DOSSIER D'INSTALLATION tourne : on ne dépend pas
// d'un seul .exe, car beaucoup de jeux démarrent d'abord un lanceur ou un écran de chargement
// (Rocket League, Fortnite, jeux avec anti-triche…) qui passe ensuite la main au vrai jeu.
// Repli : le nom de l'exécutable indiqué par le launcher, et pour Steam le registre (RunningAppID).
'use strict';
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const WIN = process.platform === 'win32';
const norm = (p) => path.resolve(String(p)).toLowerCase().replace(/[\\/]+$/, '');

// Liste des processus (nom + chemin complet), mise en cache 1,5 s pour éviter les appels en rafale
let procCache = { at: 0, data: null, pending: null };
function listProcesses() {
  if (procCache.data && Date.now() - procCache.at < 1500) return Promise.resolve(procCache.data);
  if (procCache.pending) return procCache.pending;
  procCache.pending = new Promise((resolve) => {
    // entries : [{ name, path, pid }] pour retrouver les processus d'un jeu
    // ok = liste complète (avec chemins) ; false = liste partielle (repli), à ne pas prendre pour une preuve d'arrêt
    const done = (names, paths, entries = [], ok = true) => { procCache = { at: Date.now(), data: { names, paths, entries, ok }, pending: null }; resolve(procCache.data); };
    if (WIN) {
      // chemins complets via PowerShell (CIM) ; repli sur tasklist (noms seuls) si PowerShell échoue
      const ps = 'Get-CimInstance Win32_Process | ForEach-Object { $_.Name + "|" + $_.ExecutablePath + "|" + $_.ProcessId }';
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 20000 }, (err, out) => {
        if (!err && out) {
          const names = new Set(), paths = [], entries = [];
          for (const line of out.split(/\r?\n/)) {
            const [n, p, id] = line.split('|');
            const name = (n || '').trim().toLowerCase(), file = (p || '').trim().toLowerCase(), pid = Number(id);
            if (name) names.add(name);
            if (file) paths.push(file);
            if (name && pid) entries.push({ name, path: file, pid });
          }
          return done(names, paths, entries);
        }
        execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (e2, out2) => {
          const names = new Set();
          if (!e2) for (const line of out2.split(/\r?\n/)) { const n = (line.match(/^"([^"]+)"/) || [])[1]; if (n) names.add(n.toLowerCase()); }
          done(names, [], [], false);
        });
      });
    } else {
      execFile('ps', ['-A', '-o', 'pid=,args='], { maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
        const names = new Set(), paths = [], entries = [];
        if (!err) for (const line of out.split(/\n/)) {
          const [id, exe] = line.trim().split(/\s+/);
          if (!exe) continue;
          const name = path.basename(exe).toLowerCase(), file = exe.startsWith('/') ? exe.toLowerCase() : '';
          names.add(name);
          if (file) paths.push(file);
          entries.push({ name, path: file, pid: Number(id) });
        }
        done(names, paths, entries);
      });
    }
  });
  return procCache.pending;
}

// Noms des .exe présents dans le dossier d'installation d'un jeu (mis en cache).
// Utile pour les jeux protégés par un anti-triche (Rocket League, Fortnite…) : Windows ne donne pas
// le chemin de leur processus à une appli normale, seulement son nom.
const dirExes = new Map();
function exesInDir(dir) {
  if (!dir) return new Set();
  const hit = dirExes.get(dir);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.names; // re-scanné toutes les 6 h au plus
  const names = new Set();
  let seen = 0;
  const walk = (d, depth) => {
    if (depth > 4 || seen > 5000) return;
    let list = [];
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      if (++seen > 5000) return;
      if (e.isDirectory()) walk(path.join(d, e.name), depth + 1);
      else if (/\.exe$/i.test(e.name)) names.add(e.name.toLowerCase());
    }
  };
  walk(dir, 0);
  dirExes.set(dir, { at: Date.now(), names });
  return names;
}

// Processus d'un jeu :
//  - chemin connu → il doit être dans le dossier d'installation ;
//  - chemin inconnu (processus protégé) → son nom doit être celui d'un .exe du jeu ;
//  - liste partielle (repli sans chemins) → nom de l'exécutable indiqué par le launcher.
function gameEntries(g, procs) {
  const dir = g.installDir ? norm(g.installDir) + path.sep : null;
  const own = new Set([...(g.exes || []), ...(g.installDir ? exesInDir(g.installDir) : [])]);
  return (procs.entries || []).filter((e) => (e.path ? !!dir && e.path.startsWith(dir) : own.has(e.name)));
}

function isRunning(g, procs) {
  if (procs.ok === false) return !!g.exes?.some((x) => procs.names.has(x));
  return gameEntries(g, procs).length > 0;
}

// Identifiants des processus d'un jeu
function gamePids(g, procs) {
  return gameEntries(g, procs).map((e) => e.pid);
}

// Vérification quasi instantanée qu'un processus existe encore (sans relancer PowerShell)
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// Jeu Steam en cours : Steam l'écrit dans le registre (HKCU\Software\Valve\Steam\RunningAppID)
function steamRunningAppId() {
  if (!WIN) return Promise.resolve(0);
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'], { windowsHide: true }, (err, out) => {
      const m = !err && out.match(/RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i);
      resolve(m ? parseInt(m[1], 16) : 0);
    });
  });
}

// Clés des jeux en cours d'exécution
async function runningGames(games) {
  const out = new Set();
  const installed = games.filter((g) => g.installed && (g.installDir || g.exes?.length));
  const [appid, procs] = await Promise.all([steamRunningAppId(), installed.length ? listProcesses() : Promise.resolve({ names: new Set(), paths: [] })]);
  if (appid) out.add(`steam-${appid}`);
  for (const g of installed) if (isRunning(g, procs)) out.add(g.key);
  return [...out];
}

// Suivi du temps de jeu des jeux sans compteur (Epic) : +1 minute par minute de jeu détectée
function startTracker(getGames, onMinute) {
  const timer = setInterval(async () => {
    const watched = getGames().filter((g) => g.source !== 'steam' && g.installed && (g.installDir || g.exes?.length));
    if (!watched.length) return;
    const procs = await listProcesses();
    for (const g of watched) if (isRunning(g, procs)) onMinute(g.key);
  }, 60_000);
  return () => clearInterval(timer);
}

// État d'un jeu pour la surveillance de fin de partie : en cours ? et avec quels processus ?
async function gameState(g, games) {
  const procs = await listProcesses();
  const running = (await runningGames(games)).includes(g.key);
  const pids = running ? gamePids(g, procs) : [];
  return { running, pids, sure: procs.ok !== false, procs: pids.length ? procs.entries.filter((e) => pids.includes(e.pid)).map((e) => e.name) : [] };
}

module.exports = { startTracker, runningGames, gameState, pidAlive, isRunning };
