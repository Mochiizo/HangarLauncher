// Détection des jeux Epic en cours d'exécution (ils ne fournissent pas de temps de jeu).
// Toutes les 60 s, on liste les processus et on ajoute 1 minute aux jeux trouvés.
'use strict';
const { execFile } = require('node:child_process');
const path = require('node:path');

function runningExecutables() {
  const win = process.platform === 'win32';
  const [cmd, args] = win ? ['tasklist', ['/fo', 'csv', '/nh']] : ['ps', ['-A', '-o', 'comm=']];
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
      const names = new Set();
      if (!err) for (const line of out.split(/\r?\n/)) {
        const n = win ? (line.match(/^"([^"]+)"/) || [])[1] : path.basename(line.trim());
        if (n) names.add(n.toLowerCase());
      }
      resolve(names);
    });
  });
}

function startTracker(getGames, onMinute) {
  const timer = setInterval(async () => {
    const watched = getGames().filter((g) => g.exes?.length);
    if (!watched.length) return;
    const running = await runningExecutables();
    for (const g of watched) if (g.exes.some((x) => running.has(x))) onMinute(g.key);
  }, 60_000);
  return () => clearInterval(timer);
}

// Jeu Steam en cours : Steam l'écrit dans le registre (HKCU\Software\Valve\Steam\RunningAppID)
function steamRunningAppId() {
  if (process.platform !== 'win32') return Promise.resolve(0);
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'], { windowsHide: true }, (err, out) => {
      const m = !err && out.match(/RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i);
      resolve(m ? parseInt(m[1], 16) : 0);
    });
  });
}

// Clés des jeux en cours d'exécution (Steam via le registre, Epic via les processus)
async function runningGames(games) {
  const out = new Set();
  const [appid, procs] = await Promise.all([steamRunningAppId(), games.some((g) => g.exes?.length) ? runningExecutables() : Promise.resolve(new Set())]);
  if (appid) out.add(`steam-${appid}`);
  for (const g of games) if (g.exes?.some((x) => procs.has(x))) out.add(g.key);
  return [...out];
}

module.exports = { startTracker, runningGames };
