// Ubisoft Connect, EA app et Xbox (Microsoft Store / Game Pass PC) : jeux installés sur ce PC.
// Aucun de ces launchers n'expose la liste des jeux possédés sans connexion au compte : on ne
// montre donc que les jeux installés, lus dans Windows :
//  - Ubisoft : registre HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs (+ nom via « Uplay Install <id> »)
//  - EA : programmes installés (désinstallation Windows) édités par Electronic Arts
//  - Xbox : paquets Windows contenant un MicrosoftGame.config (jeux PC Xbox / Game Pass)
// Une seule commande PowerShell lit tout, en JSON.
'use strict';
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const WIN = process.platform === 'win32';

const SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$r = [ordered]@{ ubisoft = @(); apps = @(); xbox = @(); gog = @(); galaxy = $null }
foreach ($k in Get-ChildItem 'HKLM:\SOFTWARE\WOW6432Node\GOG.com\Games') {
  $p = Get-ItemProperty $k.PSPath
  if ($p.path) { $r.gog += [pscustomobject]@{ id = [string]$p.gameID; name = $p.gameName; dir = $p.path; exe = $p.exe; workingDir = $p.workingDir; launchParam = $p.launchParam; dependsOn = [string]$p.dependsOn } }
}
$gc = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\GOG.com\GalaxyClient\paths'
if ($gc.client) { $r.galaxy = Join-Path $gc.client 'GalaxyClient.exe' }
foreach ($k in Get-ChildItem 'HKLM:\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs') {
  $p = Get-ItemProperty $k.PSPath
  if ($p.InstallDir) { $r.ubisoft += [pscustomobject]@{ id = $k.PSChildName; dir = $p.InstallDir } }
}
foreach ($root in 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall') {
  foreach ($k in Get-ChildItem $root) {
    $p = Get-ItemProperty $k.PSPath
    if ($p.DisplayName -and ($p.Publisher -match 'Electronic Arts' -or $k.PSChildName -like 'Uplay Install *')) {
      $r.apps += [pscustomobject]@{ key = $k.PSChildName; name = $p.DisplayName; publisher = $p.Publisher; dir = $p.InstallLocation; icon = $p.DisplayIcon }
    }
  }
}
foreach ($pkg in Get-AppxPackage) {
  if ($pkg.IsFramework -or -not $pkg.InstallLocation) { continue }
  $cfg = Join-Path $pkg.InstallLocation 'MicrosoftGame.config'
  if (-not (Test-Path -LiteralPath $cfg)) { continue }
  $app = $null
  try { $app = @((Get-AppxPackageManifest $pkg).Package.Applications.Application)[0].Id } catch {}
  $txt = $null
  try { $txt = [IO.File]::ReadAllText($cfg) } catch {}
  $r.xbox += [pscustomobject]@{ pfn = $pkg.PackageFamilyName; name = $pkg.Name; dir = $pkg.InstallLocation; app = $app; config = $txt }
}
$r | ConvertTo-Json -Depth 4 -Compress
`;

let lastScan = null; // diagnostic : résultat brut du dernier scan
function scanWindows() {
  if (!WIN) return Promise.resolve({ ubisoft: [], apps: [], xbox: [], gog: [], galaxy: null });
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 45000, encoding: 'utf8' }, (err, out, errOut) => {
        let data = null, parseError = null;
        const text = String(out || '').replace(/^\uFEFF/, '').trim();
        // la sortie JSON est la dernière ligne (au cas où PowerShell écrit autre chose avant)
        const json = text.slice(Math.max(0, text.lastIndexOf('\n{') + 1));
        try { data = JSON.parse(json); } catch (e) { parseError = e.message; }
        const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
        const res = { ubisoft: arr(data?.ubisoft), apps: arr(data?.apps), xbox: arr(data?.xbox), gog: arr(data?.gog), galaxy: data?.galaxy || null };
        lastScan = {
          at: new Date().toISOString(), error: err?.message || null, parseError, stderr: String(errOut || '').slice(0, 2000), stdoutStart: text.slice(0, 300),
          ubisoft: res.ubisoft, apps: res.apps.map((x) => ({ key: x.key, name: x.name, publisher: x.publisher, dir: x.dir, icon: x.icon })),
          xbox: res.xbox.map((x) => ({ pfn: x.pfn, dir: x.dir, app: x.app, hasConfig: !!x.config })), gog: res.gog, galaxy: res.galaxy
        };
        resolve(res);
      });
  });
}

const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cleanName = (s) => String(s || '').replace(/[®™©]/g, '').replace(/\s+/g, ' ').trim();
const xmlAttr = (xml, tag, attr) => (String(xml || '').match(new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]*)"`, 'i')) || [])[1];
const decodeXml = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const base = (o) => ({ minutes: 0, minutes2w: 0, lastPlayed: 0, installed: true, sizeBytes: 0, images: {}, exes: [], installUrl: null, canPlay: true, ...o });

// Exécutable d'un jeu EA : __Installer/installerdata.xml (<runtime><launcher><filePath>[Registre]\Jeu.exe</filePath>),
// sinon l'icône du programme installé si c'est un .exe
function eaExe(dir, icon) {
  try {
    const xml = fs.readFileSync(path.join(dir, '__Installer', 'installerdata.xml'), 'utf8');
    for (const m of xml.matchAll(/<filePath>([^<]+)<\/filePath>/gi)) {
      const rel = decodeXml(m[1]).replace(/^\[[^\]]*\]/, '').replace(/^[\\/]+/, '').trim();
      if (!/\.exe$/i.test(rel)) continue;
      const full = path.join(dir, rel);
      if (exists(full)) return full;
    }
  } catch { /* pas de manifeste EA */ }
  const ic = String(icon || '').replace(/^"|"?,-?\d+$|"$/g, '').trim();
  if (/\.exe$/i.test(ic) && exists(ic) && !/uninst|unins\d|cleanup/i.test(path.basename(ic))) return ic;
  return null;
}

async function library() {
  const status = { ubisoft: 0, ea: 0, xbox: 0, gog: 0 };
  if (!WIN) return { games: [], status };
  const data = await scanWindows();
  const games = [];
  const names = new Map(data.apps.filter((a) => /^Uplay Install /i.test(a.key)).map((a) => [a.key.replace(/^Uplay Install /i, ''), a.name]));

  // Ubisoft Connect
  for (const u of data.ubisoft) {
    const dir = String(u.dir || '').replace(/[\\/]+$/, '');
    if (!exists(dir)) continue; // entrée restée après une désinstallation
    games.push(base({
      key: `ubisoft-${u.id}`, source: 'ubisoft', id: String(u.id),
      title: cleanName(names.get(String(u.id)) || path.basename(dir)),
      installDir: path.normalize(dir),
      launchUrl: `uplay://launch/${u.id}/0`
    }));
  }

  // EA app
  for (const a of data.apps) {
    if (!/Electronic Arts/i.test(a.publisher || '') || /^(Steam App|Uplay Install)/i.test(a.key)) continue;
    if (/^(EA app|EA Desktop|Origin)$/i.test(cleanName(a.name))) continue;
    const dir = String(a.dir || '').replace(/[\\/]+$/, '');
    if (!exists(dir) || /[\\/]steamapps[\\/]|[\\/]Epic Games[\\/]/i.test(dir + path.sep)) continue;
    const exe = eaExe(dir, a.icon);
    if (!exe) continue;
    games.push(base({
      key: `ea-${slug(a.key)}`, source: 'ea', id: a.key,
      title: cleanName(a.name),
      installDir: path.normalize(dir),
      exes: [path.basename(exe).toLowerCase()],
      launchExe: exe
    }));
  }

  // Xbox (jeux PC Microsoft Store / Game Pass)
  for (const x of data.xbox) {
    let title = decodeXml(xmlAttr(x.config, 'ShellVisuals', 'DefaultDisplayName') || '');
    if (!title || /^ms-resource:/i.test(title)) title = String(x.name || '').replace(/^[^.]+\./, '').replace(/([a-z])([A-Z])/g, '$1 $2');
    const exes = [...String(x.config || '').matchAll(/<Executable\b[^>]*\bName="([^"]+)"/gi)].map((m) => path.basename(decodeXml(m[1]).replace(/\\/g, '/')).toLowerCase());
    games.push(base({
      key: `xbox-${x.pfn}`, source: 'xbox', id: x.pfn,
      title: cleanName(title),
      installDir: x.dir ? path.normalize(x.dir) : null,
      exes,
      appUserModelId: `${x.pfn}!${x.app || 'Game'}`
    }));
  }

  // GOG (GOG Galaxy ou installeurs GOG) : registre HKLM\SOFTWARE\WOW6432Node\GOG.com\Games
  for (const x of data.gog) {
    const dir = String(x.dir || '').replace(/[\\/]+$/, '');
    if (!x.id || x.dependsOn || !exists(dir)) continue; // dependsOn = DLC d'un autre jeu
    const exe = x.exe && exists(x.exe) ? x.exe : null;
    games.push(base({
      key: `gog-${x.id}`, source: 'gog', id: String(x.id),
      title: cleanName(x.name || path.basename(dir)),
      installDir: path.normalize(dir),
      exes: exe ? [path.basename(exe).toLowerCase()] : [],
      launchExe: exe, launchCwd: x.workingDir && exists(x.workingDir) ? x.workingDir : (exe ? path.dirname(exe) : dir),
      launchArgs: String(x.launchParam || '').trim(),
      galaxy: data.galaxy && exists(data.galaxy) ? data.galaxy : null
    }));
  }

  for (const g of games) status[g.source]++;
  if (lastScan) lastScan.kept = games.map((g) => `${g.key} | ${g.title}`);
  return { games, status };
}

// Lancement des jeux qui ne passent pas par une adresse de launcher
function launch(g) {
  if (!WIN) return false;
  if (g.source === 'xbox' && /^[\w.-]+_[\w]+![\w.-]+$/.test(g.appUserModelId || '')) {
    const p = spawn('explorer.exe', [`shell:AppsFolder\\${g.appUserModelId}`], { detached: true, stdio: 'ignore', windowsHide: true });
    p.on('error', (e) => console.error('[more] xbox', e.message));
    p.unref();
    return true;
  }
  if (g.source === 'gog') {
    // Par GOG Galaxy s'il est installé (temps de jeu et sauvegardes en ligne), sinon directement le jeu
    if (g.galaxy && exists(g.galaxy)) {
      const p = spawn(g.galaxy, ['/command=runGame', `/gameId=${g.id}`, `/path=${g.installDir}`], { detached: true, stdio: 'ignore' });
      p.on('error', (e) => console.error('[more] gog galaxy', e.message));
      p.unref();
      return true;
    }
    if (g.launchExe && exists(g.launchExe)) {
      const args = g.launchArgs ? g.launchArgs.match(/"[^"]*"|\S+/g).map((a) => a.replace(/^"|"$/g, '')) : [];
      const p = spawn(g.launchExe, args, { cwd: g.launchCwd, detached: true, stdio: 'ignore' });
      p.on('error', () => require('electron').shell.openPath(g.launchExe)); // droits administrateur demandés : on passe par Windows
      p.unref();
      return true;
    }
    return false;
  }
  if (g.source === 'ea' && g.launchExe && exists(g.launchExe)) {
    // Ouverture « comme un double-clic » (ShellExecute) : gère la demande d'autorisation Windows
    // des lanceurs anti-triche (EAAntiCheat.GameServiceLauncher.exe demande les droits administrateur)
    require('electron').shell.openPath(g.launchExe).then((err) => { if (err) console.error('[more] ea', err); });
    return true;
  }
  return false;
}

module.exports = { library, launch, diagnostic: () => lastScan };
