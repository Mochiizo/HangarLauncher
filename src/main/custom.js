// Jeux ajoutés à la main (sans launcher : Roblox, Soulframe…).
// L'utilisateur choisit un .exe, un raccourci .lnk ou un raccourci internet .url ; Hangar le lance
// « comme un double-clic » et retrouve le dossier du jeu pour suivre le temps de jeu.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const WIN = process.platform === 'win32';
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };

// Dossiers « techniques » qu'on remonte pour trouver le vrai dossier du jeu :
// …\Roblox\Versions\version-abc\RobloxPlayerBeta.exe → …\Roblox
// …\Soulframe\Downloaded\Public\Tools\Launcher.exe → …\Soulframe
const TECH_DIR = /^(bin|bin32|bin64|binaries|win32|win64|x64|x86|amd64|tools|launcher|public|downloaded|versions?|version-.*|game|client|current|retail|app-[\d.]+|\d+(\.\d+)+)$/i;
const ROOTS = /^(program files( \(x86\))?|programdata|appdata|local|roaming|users|games|steamapps|common)$/i;
function gameDir(file) {
  let dir = path.dirname(file);
  for (let i = 0; i < 4; i++) {
    const parent = path.dirname(dir);
    if (parent === dir || !TECH_DIR.test(path.basename(dir)) || ROOTS.test(path.basename(parent)) || path.parse(parent).root === parent) break;
    dir = parent;
  }
  return dir;
}

// Cible d'un raccourci .lnk (Electron sait les lire sous Windows)
function resolveTarget(file) {
  if (/\.lnk$/i.test(file) && WIN) {
    try { return require('electron').shell.readShortcutLink(file).target || null; } catch { return null; }
  }
  if (/\.exe$/i.test(file)) return file;
  return null; // .url : pas d'exécutable connu
}

// Nom du produit inscrit dans l'exécutable (ex. « Roblox »), via PowerShell
function productName(exe) {
  if (!WIN || !exe) return Promise.resolve('');
  const ps = `$v = (Get-Item -LiteralPath '${exe.replace(/'/g, "''")}').VersionInfo; if ($v.ProductName) { $v.ProductName } else { $v.FileDescription }`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${ps}`],
      { windowsHide: true, timeout: 8000, encoding: 'utf8' }, (err, out) => resolve(err ? '' : String(out || '').trim().split(/\r?\n/)[0] || ''));
  });
}

const GENERIC = /^(launcher|game|client|setup|bootstrapper|application|app|player)$/i;
const tidy = (s) => String(s || '').replace(/[®™©]/g, '').replace(/\s+/g, ' ').trim();

// Proposition de nom pour le fichier choisi
async function suggest(file) {
  const target = resolveTarget(file);
  const fromFile = tidy(path.basename(file).replace(/\.(exe|lnk|url)$/i, ''));
  let title = '';
  if (/\.(lnk|url)$/i.test(file)) title = fromFile; // le nom du raccourci est en général celui du jeu
  if (!title && target) title = tidy(await productName(target));
  if (!title || GENERIC.test(title)) title = tidy(path.basename(target ? gameDir(target) : path.dirname(file)));
  if (!title || GENERIC.test(title)) title = fromFile;
  return { file, title };
}

function makeGame(c) {
  const target = resolveTarget(c.file);
  const dir = target ? gameDir(target) : null;
  return {
    key: c.key, source: 'custom', id: c.key, title: c.title,
    minutes: 0, minutes2w: 0, lastPlayed: 0, sizeBytes: 0, images: {},
    installed: exists(c.file),
    installDir: dir,
    exes: target ? [path.basename(target).toLowerCase()] : [],
    launchFile: c.file,
    canPlay: true,
    installUrl: null,
    custom: true
  };
}

function library(list) {
  return (list || []).filter((c) => c && c.key && c.file).map(makeGame);
}

function launch(g) {
  if (!g.launchFile || !exists(g.launchFile)) return false;
  require('electron').shell.openPath(g.launchFile).then((err) => { if (err) console.error('[custom] lancement', err); });
  return true;
}

module.exports = { library, suggest, launch, gameDir };
