const { contextBridge, ipcRenderer } = require('electron');

// Expose a secure API to the renderer process.
// This is the bridge that allows the frontend to securely communicate
// with the backend (main.js).
contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  startUpdate: () => ipcRenderer.invoke('start-update'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, data) => callback(data))
});
