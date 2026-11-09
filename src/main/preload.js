'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  library: (force) => ipcRenderer.invoke('library:get', force),
  week: () => ipcRenderer.invoke('week:get'),
  news: (appid) => ipcRenderer.invoke('news:get', appid),
  toggleFavorite: (key) => ipcRenderer.invoke('favorite:toggle', key),
  launch: (key, action) => ipcRenderer.invoke('game:launch', key, action),
  updates: () => ipcRenderer.invoke('updates:get'),
  running: () => ipcRenderer.invoke('running:get'),
  releases: () => ipcRenderer.invoke('releases:get'),
  releaseDetails: (id) => ipcRenderer.invoke('release:details', id),
  onGameEnded: (cb) => ipcRenderer.on('game-ended', (_e, key) => cb(key)),
  onLibraryChanged: (cb) => ipcRenderer.on('library-changed', () => cb()),
  openDownloads: () => ipcRenderer.invoke('steam:downloads'),
  pickCover: (key) => ipcRenderer.invoke('cover:pick', key),
  resetCover: (key) => ipcRenderer.invoke('cover:reset', key),
  customPick: () => ipcRenderer.invoke('custom:pick'),
  customAdd: (file, title) => ipcRenderer.invoke('custom:add', file, title),
  customRemove: (key) => ipcRenderer.invoke('custom:remove', key),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  info: () => ipcRenderer.invoke('app:info'),
  openDiagnostic: () => ipcRenderer.invoke('diag:open'),
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  onWindowState: (cb) => ipcRenderer.on('window-state', (_e, s) => cb(s)),
  friends: () => ipcRenderer.invoke('friends:get'),
  openFriend: (id, action) => ipcRenderer.invoke('friends:open', id, action),
  appUpdate: {
    state: () => ipcRenderer.invoke('app-update:state'),
    check: () => ipcRenderer.invoke('app-update:check'),
    download: () => ipcRenderer.invoke('app-update:download'),
    install: () => ipcRenderer.invoke('app-update:install'),
    onChange: (cb) => ipcRenderer.on('app-update', (_e, s) => cb(s))
  }
});
