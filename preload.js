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
    },

    // ── History & Export ──
    checkReportExists: function (dateStr) { return ipcRenderer.invoke('check-report-exists', dateStr); },
    saveReport: function (dateStr, data) { return ipcRenderer.invoke('save-report', dateStr, data); },
    listHistory: function () { return ipcRenderer.invoke('list-history'); },
    loadHistory: function (dateStr) { return ipcRenderer.invoke('load-history', dateStr); },
    exportClipboard: function (text) { return ipcRenderer.invoke('export-clipboard', text); },

    // ── API Server ──
    getApiPort: function () { return ipcRenderer.invoke('get-api-port'); },
    onApiPushReceived: function (callback) {
        ipcRenderer.on('api-push-received', function (_event, info) {
            callback(info);
        });
    },

    // ── Chart: Fetch stock chart data via main process ──
    fetchChart: function (code) { return ipcRenderer.invoke('fetch-chart', code); },
    fetchChartData: function (fullCode) { return ipcRenderer.invoke('fetch-chart-data', fullCode); }
});
