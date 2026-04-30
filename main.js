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
var clipboard = electron.clipboard;
var screen = electron.screen;
var path = require('path');
var fs = require('fs');

var mainWindow = null;
var dataWatcher = null;
var apiServer = null;
var API_PORT = 18901;

// ── Base data directory ──
// In packaged mode, data and history live next to the exe.
// This directory may be write-protected (e.g. Program Files),
// so we also support falling back to userData directory.
function getBaseDir() {
    if (app.isPackaged) {
        var exeDir = path.dirname(app.getPath('exe'));
        // Test if we can write to exe directory
        var testFile = path.join(exeDir, '.alpha-q-write-test');
        try {
            fs.writeFileSync(testFile, '1', 'utf-8');
            fs.unlinkSync(testFile);
            return exeDir;
        } catch (_e) {
            // Fall back to userData directory (always writable)
            var userDataDir = app.getPath('userData');
            console.log('[Init] exe dir not writable, using userData:', userDataDir);
            return userDataDir;
        }
    }
    return __dirname;
}

// ── Resolve data.json path ──
// Priority: baseDir/data.json > resources/data.json (read-only fallback)
function getDataPath() {
    var baseDir = getBaseDir();
    var targetPath = path.join(baseDir, 'data.json');

    // If data.json already exists in baseDir, use it
    if (fs.existsSync(targetPath)) {
        return targetPath;
    }

    // First run: try to copy from bundled resources to baseDir
    if (app.isPackaged) {
        var bundledPath = path.join(process.resourcesPath, 'data.json');
        if (fs.existsSync(bundledPath)) {
            try {
                fs.copyFileSync(bundledPath, targetPath);
                console.log('[Init] Copied data.json to:', targetPath);
                return targetPath;
            } catch (err) {
                console.warn('[Init] Cannot copy to baseDir:', err.message);
                // Fall back: read directly from resources (read-only)
                return bundledPath;
            }
        }
    }
    return targetPath;
}

// ── Resolve history directory path ──
// Always next to the exe (packaged) or in project dir (dev)
function getHistoryDir() {
    return path.join(getBaseDir(), 'history');
}

// ── Ensure history directory exists ──
function ensureHistoryDir() {
    var dir = getHistoryDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
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

    // 禁用渲染缓存，确保 index.html 更新即时生效
    mainWindow.webContents.session.clearCache(function () {});
    mainWindow.webContents.session.clearStorageData({ storages: ['cache'] });

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
            if (!fs.existsSync(dataPath)) {
                // Try resources fallback
                if (app.isPackaged) {
                    var bundledPath = path.join(process.resourcesPath, 'data.json');
                    if (fs.existsSync(bundledPath)) {
                        var raw = fs.readFileSync(bundledPath, 'utf-8');
                        return { success: true, data: JSON.parse(raw) };
                    }
                }
                // Return empty template if no data.json found
                return { success: true, data: { meta: { date: new Date().toISOString().split('T')[0], version: '3.3', mode: '交互式交易终端', title: 'Alpha-Q 3.3' }, marketOverview: { indices: [], sentiment: [], emotionCycle: '等待数据推送...', mainlines: [], topTier: [], lossDetector: { rows: [], alert: '' } }, logicCheck: { errorRecall: '', logicRows: [], correction: '' }, tradePlan: { strategy: '等待数据推送...', guideRows: [], actionRows: [], avoidList: [], conclusion: '' }, deepAnalysis: {} } };
            }
            var raw = fs.readFileSync(dataPath, 'utf-8');
            return { success: true, data: JSON.parse(raw) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('get-data-path', function () {
        return getDataPath();
    });

    // ── History: Check if a date file already exists ──
    ipcMain.handle('check-report-exists', function (_event, dateStr) {
        var filePath = path.join(getHistoryDir(), dateStr + '.json');
        return fs.existsSync(filePath);
    });

    // ── History: Save current data to ./history/YYYY-MM-DD.json ──
    ipcMain.handle('save-report', function (_event, dateStr, data) {
        try {
            var dir = ensureHistoryDir();
            var filePath = path.join(dir, dateStr + '.json');
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            return { success: true, path: filePath };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // ── History: List all saved report dates ──
    ipcMain.handle('list-history', function () {
        try {
            var dir = getHistoryDir();
            if (!fs.existsSync(dir)) return { success: true, dates: [] };
            var files = fs.readdirSync(dir).filter(function (f) {
                return f.endsWith('.json');
            }).map(function (f) {
                return f.replace('.json', '');
            }).sort().reverse();  // newest first
            return { success: true, dates: files };
        } catch (err) {
            return { success: false, error: err.message, dates: [] };
        }
    });

    // ── History: Load a specific date's report ──
    ipcMain.handle('load-history', function (_event, dateStr) {
        try {
            var filePath = path.join(getHistoryDir(), dateStr + '.json');
            if (!fs.existsSync(filePath)) {
                return { success: false, error: '文件不存在' };
            }
            var raw = fs.readFileSync(filePath, 'utf-8');
            return { success: true, data: JSON.parse(raw) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // ── Export: Copy text to system clipboard ──
    ipcMain.handle('export-clipboard', function (_event, text) {
        try {
            clipboard.writeText(text, 'clipboard');
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // ── API: Get current API server port ──
    ipcMain.handle('get-api-port', function () {
        return API_PORT;
    });

    // ── Chart: Fetch stock minutes chart image via Node.js (bypass browser CORS) ──
    ipcMain.handle('fetch-chart', function (_event, code) {
        return new Promise(function (resolve) {
            var prefix = (code.charAt(0) === '6') ? 'sh' : 'sz';
            var url = 'https://image.sinajs.cn/newchart/min/' + prefix + code + '.gif?t=' + Date.now();
            console.log('[Chart] Fetching:', url);

            var resolved = false;
            function done(result) {
                if (resolved) return;
                resolved = true;
                console.log('[Chart] Result:', result.success ? 'OK (' + (result.data ? result.data.length : 0) + ' chars)' : 'FAIL: ' + result.error);
                resolve(result);
            }

            var https = require('https');
            var http = require('http');

            // Try HTTPS first, fall back to HTTP
            function tryFetch(fetchUrl, proto) {
                var lib = (proto === 'https') ? https : http;
                lib.get(fetchUrl, function (res) {
                    if (res.statusCode === 301 || res.statusCode === 302) {
                        var redirectUrl = res.headers.location;
                        if (redirectUrl) {
                            res.resume();
                            console.log('[Chart] Redirect:', res.statusCode, '→', redirectUrl);
                            var nextProto = redirectUrl.startsWith('https') ? 'https' : 'http';
                            tryFetch(redirectUrl, nextProto);
                            return;
                        }
                    }
                    if (res.statusCode !== 200) {
                        res.resume();
                        // If HTTPS fails, try HTTP
                        if (proto === 'https') {
                            var httpUrl = fetchUrl.replace('https://', 'http://');
                            console.log('[Chart] HTTPS failed (' + res.statusCode + '), trying HTTP:', httpUrl);
                            tryFetch(httpUrl, 'http');
                            return;
                        }
                        done({ success: false, error: 'HTTP ' + res.statusCode });
                        return;
                    }
                    var chunks = [];
                    res.on('data', function (chunk) { chunks.push(chunk); });
                    res.on('end', function () {
                        var buffer = Buffer.concat(chunks);
                        var base64 = 'data:image/gif;base64,' + buffer.toString('base64');
                        done({ success: true, data: base64 });
                    });
                }).on('error', function (err) {
                    // If HTTPS errors, try HTTP
                    if (proto === 'https') {
                        var httpUrl = fetchUrl.replace('https://', 'http://');
                        console.log('[Chart] HTTPS error (' + err.message + '), trying HTTP:', httpUrl);
                        tryFetch(httpUrl, 'http');
                        return;
                    }
                    done({ success: false, error: err.message });
                });
            }

            tryFetch(url, 'https');

            // 10 second timeout
            setTimeout(function () {
                done({ success: false, error: 'timeout' });
            }, 10000);
        });
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

// ── Local HTTP API Server (for QwenPaw / external tools) ──
// Provides REST endpoints for pushing data into the terminal.
// POST /api/update-data  — Write JSON data to data.json + history
// GET  /api/status       — Return API server & data status
// POST /api/push-report  — Alias for /api/update-data
function startApiServer() {
    var http = require('http');

    apiServer = http.createServer(function (req, res) {
        // CORS headers for local access
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // ── GET /api/status ──
        if (req.method === 'GET' && req.url === '/api/status') {
            var statusInfo = {
                success: true,
                service: 'Alpha-Q Terminal API',
                version: '3.3',
                port: API_PORT,
                dataPath: getDataPath(),
                historyDir: getHistoryDir(),
                uptime: process.uptime()
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(statusInfo));
            return;
        }

        // ── POST /api/update-data or /api/push-report ──
        if (req.method === 'POST' && (req.url === '/api/update-data' || req.url === '/api/push-report')) {
            var body = '';
            req.on('data', function (chunk) { body += chunk; });
            req.on('end', function () {
                try {
                    var data = JSON.parse(body);

                    // Validate required fields
                    if (!data.meta || !data.marketOverview) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: '数据格式错误：缺少 meta 或 marketOverview 字段' }));
                        return;
                    }

                    // Write to data.json
                    var dataPath = getDataPath();
                    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
                    console.log('[API] data.json updated:', dataPath);

                    // Write to history directory
                    var dir = ensureHistoryDir();
                    var dateStr = data.meta.date || data.meta.trade_date || new Date().toISOString().split('T')[0];
                    var historyPath = path.join(dir, dateStr + '.json');
                    fs.writeFileSync(historyPath, JSON.stringify(data, null, 2), 'utf-8');
                    console.log('[API] History saved:', historyPath);

                    // Notify renderer process to refresh
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('data-updated', data);
                        mainWindow.webContents.send('api-push-received', {
                            date: dateStr,
                            source: 'API',
                            timestamp: Date.now()
                        });
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        message: '复盘数据已写入',
                        dataPath: dataPath,
                        historyPath: historyPath,
                        date: dateStr
                    }));

                } catch (err) {
                    console.error('[API] Error processing request:', err.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
            return;
        }

        // ── 404 for everything else ──
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Not found. Available: GET /api/status, POST /api/update-data' }));
    });

    apiServer.listen(API_PORT, '127.0.0.1', function () {
        console.log('[API] Alpha-Q Terminal API running on http://127.0.0.1:' + API_PORT);
    });

    apiServer.on('error', function (err) {
        if (err.code === 'EADDRINUSE') {
            console.warn('[API] Port ' + API_PORT + ' already in use, trying ' + (API_PORT + 1));
            API_PORT += 1;
            apiServer.listen(API_PORT, '127.0.0.1', function () {
                console.log('[API] Alpha-Q Terminal API running on http://127.0.0.1:' + API_PORT);
            });
        } else {
            console.error('[API] Server error:', err.message);
        }
    });
}

// ── App Lifecycle ──
app.whenReady().then(function () {
    registerIpc();
    createWindow();
    startDataWatcher();
    startApiServer();

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
    if (apiServer) {
        apiServer.close();
        apiServer = null;
    }
    app.quit();
});
