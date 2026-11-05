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
  openDownloads: () => ipcRenderer.invoke('steam:downloads'),
  pickCover: (key) => ipcRenderer.invoke('cover:pick', key),
  resetCover: (key) => ipcRenderer.invoke('cover:reset', key),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  appUpdate: {
    state: () => ipcRenderer.invoke('app-update:state'),
    check: () => ipcRenderer.invoke('app-update:check'),
    download: () => ipcRenderer.invoke('app-update:download'),
    install: () => ipcRenderer.invoke('app-update:install'),
    onChange: (cb) => ipcRenderer.on('app-update', (_e, s) => cb(s))
  }
});
