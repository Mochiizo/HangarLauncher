// Écran de chargement : reçoit la progression du chargement réel et le signal de fin (décollage),
// et prévient Hangar quand le clip d'ouverture est terminé (ou passé).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splash', {
  onProgress: (cb) => ipcRenderer.on('splash-progress', (_e, p) => cb(p)),
  onDone: (cb) => ipcRenderer.on('splash-done', () => cb()),
  finished: () => ipcRenderer.send('splash:finished')
});
