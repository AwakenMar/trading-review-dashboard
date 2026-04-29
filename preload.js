/* ═══════════════════════════════════════════
   Alpha-Q 3.0 — Electron Preload Script
   Exposes safe IPC bridge to renderer
   ═══════════════════════════════════════════ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    minimize:  function () { ipcRenderer.send('window-minimize'); },
    maximize:  function () { ipcRenderer.send('window-maximize'); },
    close:     function () { ipcRenderer.send('window-close'); },
    isMaximized: function () { return ipcRenderer.sendSync('window-is-maximized'); },

    // Data operations
    readData:  function () { return ipcRenderer.invoke('read-data'); },
    getDataPath: function () { return ipcRenderer.invoke('get-data-path'); },

    // File watcher events
    onDataUpdated: function (callback) {
        ipcRenderer.on('data-updated', function (_event, data) {
            callback(data);
        });
    }
});
