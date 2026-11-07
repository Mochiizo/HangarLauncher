// Mises à jour de Hangar lui-même (pas des jeux) via electron-updater + GitHub Releases.
// La nouvelle version s'installe par-dessus l'ancienne : rien à désinstaller, données conservées.
'use strict';
const { app, ipcMain } = require('electron');

let autoUpdater = null;
let send = () => {};
let state = { status: 'idle', version: null, percent: 0, error: null, notes: '', releaseName: '' };

// Notes de version : texte de la release GitHub (HTML), éventuellement une liste par version
function notesOf(info) {
  const n = info?.releaseNotes;
  if (!n) return '';
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map((x) => x.note || '').filter(Boolean).join('<hr>');
  return '';
}

function emit(patch) {
  state = { ...state, ...patch };
  send(state);
}

function setup(getWindow, beforeQuit) {
  send = (s) => { const w = getWindow(); if (w && !w.isDestroyed()) w.webContents.send('app-update', s); };

  ipcMain.handle('app-update:state', () => ({ ...state, current: app.getVersion(), enabled: app.isPackaged }));
  ipcMain.handle('app-update:check', () => check(true));
  ipcMain.handle('app-update:download', async () => {
    if (!autoUpdater || state.status !== 'available') return false;
    emit({ status: 'downloading', percent: 0, failed: false, error: null });
    try { await autoUpdater.downloadUpdate(); return true; } catch (e) { emit({ status: 'available', error: String(e?.message || e), failed: true }); return false; }
  });
  ipcMain.handle('app-update:install', () => {
    if (!autoUpdater || state.status !== 'ready') return false;
    beforeQuit();
    // isSilent = true : pas d'écran d'installation ; isForceRunAfter = true : Hangar se relance tout seul
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  });

  // En développement (npm start), pas de mise à jour
  if (!app.isPackaged) return;

  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => { if (state.status === 'idle' || state.status === 'error') emit({ status: 'checking', error: null }); });
  autoUpdater.on('update-not-available', () => emit({ status: 'idle', version: null }));
  autoUpdater.on('update-available', (info) => emit({ status: 'available', version: info.version, error: null, notes: notesOf(info), releaseName: info.releaseName || '' }));
  autoUpdater.on('download-progress', (p) => emit({ status: 'downloading', percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => emit({ status: 'ready', version: info.version, percent: 100 }));
  autoUpdater.on('error', (e) => {
    const msg = String(e?.message || e);
    // échec pendant le téléchargement (fichier corrompu, empreinte qui ne correspond pas…) : on prévient l'utilisateur
    const failed = state.status === 'downloading';
    emit({ status: failed ? 'available' : 'idle', error: msg, failed });
  });

  setTimeout(() => check(false), 8000);
  setInterval(() => check(false), 4 * 60 * 60 * 1000); // toutes les 4 h
}

async function check(manual) {
  if (!autoUpdater) return { ...state, current: app.getVersion(), enabled: false };
  if (state.status === 'downloading' || state.status === 'ready') return state;
  try { await autoUpdater.checkForUpdates(); } catch (e) { if (manual) emit({ status: 'idle', error: String(e?.message || e) }); }
  return { ...state, current: app.getVersion(), enabled: true };
}

module.exports = { setup };
