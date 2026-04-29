/* ═══════════════════════════════════════════
   Alpha-Q 3.0 — Electron Main Process
   ═══════════════════════════════════════════ */

// ── Guard: Ensure Electron runs in app mode, not Node mode ──
// ELECTRON_RUN_AS_NODE (any value, including empty string) forces Electron
// into plain Node.js mode, where require('electron') returns an exe path
// string instead of the API object. When detected, we re-launch without it.
if (process.env.ELECTRON_RUN_AS_NODE !== undefined) {
    var cleanEnv = Object.assign({}, process.env);
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    var childProcess = require('child_process');
    var child = childProcess.spawn(process.execPath, process.argv.slice(1), {
        cwd: process.cwd(),
        env: cleanEnv,
        stdio: 'inherit',
        detached: false
    });
    child.on('exit', function (code) { process.exit(code || 0); });
    child.on('error', function (err) { console.error('Re-spawn failed:', err); process.exit(1); });
    return;  // stop executing — the child process takes over
}

var electron = require('electron');
var app = electron.app;
var BrowserWindow = electron.BrowserWindow;
var ipcMain = electron.ipcMain;
var screen = electron.screen;
var path = require('path');
var fs = require('fs');

var mainWindow = null;
var dataWatcher = null;

// ── Resolve data.json path ──
function getDataPath() {
    if (app.isPackaged) {
        return path.join(path.dirname(app.getPath('exe')), 'data.json');
    }
    return path.join(__dirname, 'data.json');
}

// ── Create Main Window ──
function createWindow() {
    var primaryDisplay = screen.getPrimaryDisplay();
    var screenWidth = primaryDisplay.workAreaSize.width;
    var screenHeight = primaryDisplay.workAreaSize.height;

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 600,
        x: Math.floor((screenWidth - 1280) / 2),
        y: Math.floor((screenHeight - 800) / 2),
        frame: false,                          // No native title bar
        backgroundColor: '#0D1117',            // Prevent white flash
        show: false,                           // Show when ready (prevents flash)
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', function () {
        mainWindow.show();
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

// ── Register IPC Handlers ──
function registerIpc() {
    ipcMain.on('window-minimize', function () {
        if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on('window-maximize', function () {
        if (mainWindow) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
        }
    });

    ipcMain.on('window-close', function () {
        if (mainWindow) mainWindow.close();
    });

    ipcMain.on('window-is-maximized', function (event) {
        event.returnValue = mainWindow ? mainWindow.isMaximized() : false;
    });

    ipcMain.handle('read-data', function () {
        try {
            var dataPath = getDataPath();
            var raw = fs.readFileSync(dataPath, 'utf-8');
            return { success: true, data: JSON.parse(raw) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('get-data-path', function () {
        return getDataPath();
    });
}

// ── File Watcher: Auto-reload when data.json changes ──
function startDataWatcher() {
    var dataPath = getDataPath();

    try {
        dataWatcher = fs.watch(dataPath, { persistent: false }, function (eventType) {
            if (eventType === 'change') {
                setTimeout(function () {
                    try {
                        var raw = fs.readFileSync(dataPath, 'utf-8');
                        var data = JSON.parse(raw);
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('data-updated', data);
                        }
                    } catch (err) {
                        console.warn('[Watcher] Parse error, skipping:', err.message);
                    }
                }, 150);
            }
        });
        console.log('[Watcher] Watching:', dataPath);
    } catch (err) {
        console.warn('[Watcher] Failed to start:', err.message);
    }
}

// ── App Lifecycle ──
app.whenReady().then(function () {
    registerIpc();
    createWindow();
    startDataWatcher();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', function () {
    if (dataWatcher) {
        dataWatcher.close();
        dataWatcher = null;
    }
    app.quit();
});
