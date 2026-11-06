// Détection des jeux en cours d'exécution.
// Un jeu est « lancé » tant qu'un programme de SON DOSSIER D'INSTALLATION tourne : on ne dépend pas
// d'un seul .exe, car beaucoup de jeux démarrent d'abord un lanceur ou un écran de chargement
// (Rocket League, Fortnite, jeux avec anti-triche…) qui passe ensuite la main au vrai jeu.
// Repli : le nom de l'exécutable indiqué par le launcher, et pour Steam le registre (RunningAppID).
'use strict';
const { execFile } = require('node:child_process');
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
    const done = (names, paths, entries = []) => { procCache = { at: Date.now(), data: { names, paths, entries }, pending: null }; resolve(procCache.data); };
    if (WIN) {
      // chemins complets via PowerShell (CIM) ; repli sur tasklist (noms seuls) si PowerShell échoue
      const ps = 'Get-CimInstance Win32_Process | ForEach-Object { $_.Name + "|" + $_.ExecutablePath + "|" + $_.ProcessId }';
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 8000 }, (err, out) => {
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
          done(names, []);
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

function isRunning(g, procs) {
  if (g.installDir) {
    const dir = norm(g.installDir) + path.sep;
    if (procs.paths.some((p) => p.startsWith(dir))) return true;
  }
  return !!g.exes?.some((x) => procs.names.has(x));
}

// Identifiants des processus d'un jeu (dossier d'installation ou exécutable connu)
function gamePids(g, procs) {
  const dir = g.installDir ? norm(g.installDir) + path.sep : null;
  return (procs.entries || []).filter((e) => (dir && e.path.startsWith(dir)) || g.exes?.includes(e.name)).map((e) => e.pid);
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
  return { running, pids: running ? gamePids(g, procs) : [] };
}

module.exports = { startTracker, runningGames, gameState, pidAlive };
