// Écran de chargement : reçoit la progression du chargement réel et le signal de fin (décollage)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splash', {
  onProgress: (cb) => ipcRenderer.on('splash-progress', (_e, p) => cb(p)),
  onDone: (cb) => ipcRenderer.on('splash-done', () => cb())
});
