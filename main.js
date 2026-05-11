/* ═══════════════════════════════════════════
   Alpha-Q 3.7 — Electron Main Process
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

    // ── Chart: Fetch stock minutes data from Tencent API (新浪GIF接口已停服) ──
    ipcMain.handle('fetch-chart-data', function (_event, fullCode) {
        // fullCode format: "sh603045" or "sz000066"
        return new Promise(function (resolve) {
            var url = 'https://web.ifzq.gtimg.cn/appstock/app/minute/query?_var=min_data&code=' + fullCode + '&t=' + Date.now();
            console.log('[Chart] Fetching data:', url);

            var resolved = false;
            function done(result) {
                if (resolved) return;
                resolved = true;
                console.log('[Chart] Result:', result.success ? 'OK (' + (result.data && result.data.points ? result.data.points.length : 0) + ' points)' : 'FAIL: ' + result.error);
                resolve(result);
            }

            var https = require('https');

            https.get(url, function (res) {
                if (res.statusCode !== 200) {
                    res.resume();
                    done({ success: false, error: 'HTTP ' + res.statusCode });
                    return;
                }
                var chunks = [];
                res.on('data', function (chunk) { chunks.push(chunk); });
                res.on('end', function () {
                    try {
                        var text = Buffer.concat(chunks).toString('utf8');
                        var jsonStr = text.replace('min_data=', '');
                        var json = JSON.parse(jsonStr);
                        var key = fullCode;
                        var chartObj = json.data && json.data[key] && json.data[key].data;
                        if (!chartObj || !chartObj.data || chartObj.data.length === 0) {
                            done({ success: false, error: 'no data' });
                            return;
                        }
                        var points = chartObj.data;
                        var openPrice = parseFloat(points[0].split(' ')[1]);
                        done({ success: true, data: { points: points, openPrice: openPrice } });
                    } catch (e) {
                        done({ success: false, error: e.message });
                    }
                });
            }).on('error', function (err) {
                done({ success: false, error: err.message });
            });

            // 10 second timeout
            setTimeout(function () {
                done({ success: false, error: 'timeout' });
            }, 10000);
        });
    });

    // ── Legacy: fetch-chart kept for backward compat (returns empty) ──
    ipcMain.handle('fetch-chart', function (_event, code) {
        return Promise.resolve({ success: false, error: 'deprecated' });
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

// ── Data Normalization: Convert any format to canonical Alpha-Q schema ──
// This function runs at the API layer BEFORE writing to data.json.
// It ensures data.json always contains the canonical format that
// render functions expect, regardless of what QwenPaw pushes.
// This is the PRIMARY format-locking mechanism.
function normalizeToCanonical(raw) {
    if (!raw || !raw.marketOverview) return raw;
    var d = JSON.parse(JSON.stringify(raw)); // deep clone
    var mo = d.marketOverview;

    // ── 1. meta.date: normalize trade_date / report_date → date ──
    if (d.meta && !d.meta.date) {
        if (d.meta.trade_date) d.meta.date = d.meta.trade_date;
        else if (d.meta.report_date) d.meta.date = d.meta.report_date;
    }
    // Set canonical meta fields
    if (d.meta) {
        if (!d.meta.version) d.meta.version = '3.7';
        if (!d.meta.mode) d.meta.mode = '交互式交易终端';
        if (!d.meta.title) d.meta.title = 'Alpha-Q 3.7';
    }

    // ── 2. marketOverview: snake_case → camelCase ──
    var moAliases = {
        'limit_up_count': 'limitUpCount',
        'limit_down_count': 'limitDownCount',
        'zhaban_count': 'brokenCount',
        'zhaban_rate': 'brokenRate',
        'broken_rate': 'brokenRate',
        'highest_board': 'maxConsecutive',
        'max_board_height': 'maxBoardHeight',
        'sentiment_score': 'sentimentScore',
        'emotion_score': 'emotionScore',
        'sentiment_phase': 'sentimentCycle',
        'total_volume': 'totalVolume',
        'volume_change': 'volumeChange'
    };
    Object.keys(moAliases).forEach(function(snakeKey) {
        if (mo[snakeKey] !== undefined && mo[moAliases[snakeKey]] === undefined) {
            mo[moAliases[snakeKey]] = mo[snakeKey];
        }
    });
    // Also normalize meta level snake_case → marketOverview camelCase
    if (d.meta) {
        if (d.meta.sentiment_score !== undefined && mo.sentimentScore === undefined) mo.sentimentScore = d.meta.sentiment_score;
        if (d.meta.broken_rate !== undefined && mo.brokenRate === undefined) mo.brokenRate = d.meta.broken_rate;
        if (d.meta.total_limit_up !== undefined && mo.limitUpCount === undefined) mo.limitUpCount = d.meta.total_limit_up;
        if (d.meta.total_limit_down !== undefined && mo.limitDownCount === undefined) mo.limitDownCount = d.meta.total_limit_down;
        if (d.meta.total_zhaban !== undefined && mo.brokenCount === undefined) mo.brokenCount = d.meta.total_zhaban;
        if (d.meta.lianban_height !== undefined && mo.maxConsecutive === undefined) mo.maxConsecutive = d.meta.lianban_height;
    }

    // ── 3. riskWarnings / risks → riskAlerts (intermediate) ──
    if (!d.riskAlerts && d.riskWarnings) {
        d.riskAlerts = d.riskWarnings.map(function(r) {
            var target = r.target || '';
            var codeMatch = target.match(/\((\d{6})\)/);
            var code = codeMatch ? codeMatch[1] : '';
            var name = target.replace(/\(\d{6}\)/, '').trim() || target;
            return { stock: (code ? code + ' ' : '') + name, risk: (r.type ? r.type + '：' : '') + (r.desc || r.issue || '') };
        });
    }
    if (!d.riskAlerts && d.risks) {
        d.riskAlerts = d.risks.map(function(r) {
            return { stock: (r.code || '') + ' ' + (r.name || ''), risk: r.issue || '' };
        });
    }

    // ── 4. nextDayStrategy → tomorrowPlan → tradePlan ──
    // First: nextDayStrategy → tomorrowPlan
    if (!d.tomorrowPlan && d.nextDayStrategy) {
        var nds = d.nextDayStrategy;
        var targets = [];
        if (nds.recommended && nds.recommended.length > 0) {
            nds.recommended.forEach(function(rec, i) {
                targets.push({ name: rec, code: '', action: i === 0 ? '首选' : '备选', trigger: '', cancel: '', position: '' });
            });
        }
        var avoidStr = '';
        if (nds.avoid && nds.avoid.length > 0) {
            avoidStr = nds.avoid.join(' / ');
        }
        d.tomorrowPlan = {
            strategy: (nds.stance || '') + (nds.priority ? ' | ' + nds.priority : ''),
            targets: targets,
            avoid: avoidStr
        };
    }
    // Then: tomorrowPlan → nextDayPlan
    if (!d.nextDayPlan && d.tomorrowPlan) {
        var tp = d.tomorrowPlan;
        var np = { stance: tp.strategy || '' };
        if (tp.targets && tp.targets.length > 0) {
            np.primaryTarget = {
                name: tp.targets[0].name || '', code: tp.targets[0].code || '',
                action: tp.targets[0].action || '', trigger: tp.targets[0].trigger || '',
                cancel: tp.targets[0].cancel || '', position: tp.targets[0].position || ''
            };
            if (tp.targets.length > 1) {
                np.secondaryTarget = {
                    name: tp.targets[1].name || '', code: tp.targets[1].code || '',
                    action: tp.targets[1].action || '', trigger: tp.targets[1].trigger || '',
                    cancel: tp.targets[1].cancel || '', position: tp.targets[1].position || ''
                };
            }
            if (tp.targets.length > 2) {
                np.avoid = tp.targets.slice(2).map(function(t) {
                    return t.name + '(' + t.action + '): ' + t.trigger;
                }).join(' / ');
            }
        }
        if (tp.avoid) np.avoid = (np.avoid ? np.avoid + ' / ' : '') + tp.avoid;
        d.nextDayPlan = np;
    }

    // ── 5. mainThemes[].coreStocks normalization ──
    if (d.mainThemes && d.mainThemes.length > 0) {
        d.mainThemes.forEach(function(theme) {
            if (typeof theme.coreStocks === 'string') {
                theme.coreStocks = theme.coreStocks.split(/[,，、\s]+/).filter(function(s) { return s && s !== '无'; });
            }
            if (typeof theme.strength === 'number') {
                if (theme.strength >= 10000) theme.strength = '绝对主线';
                else if (theme.strength >= 5000) theme.strength = '次主线';
                else theme.strength = '方向';
            }
            if (theme.status === '退潮方向' || theme.status === '大出血' || theme.status === '系统性退潮') {
                theme.trend = '退潮';
            } else if (theme.status === '分化方向') {
                theme.trend = '分歧';
            }
            if (!theme.status && theme.trend) {
                theme.status = theme.trend;
            }
            if (theme.coreStocks && theme.coreStocks.length > 0) {
                theme.coreStocks = theme.coreStocks.map(function(s) {
                    if (typeof s === 'string') return s;
                    if (typeof s === 'object' && s !== null) {
                        var name = s.name || s.code || '';
                        var code = s.code || '';
                        return code ? name + '(' + code + ')' : name;
                    }
                    return String(s);
                });
            }
        });
    }

    // ── 6. coreStocks board/position normalization ──
    if (d.coreStocks && d.coreStocks.length > 0) {
        d.coreStocks.forEach(function(s) {
            if (!s.position && s.boards !== undefined) s.position = s.boards + '板';
            if (!s.position && s.status) {
                var bm = s.status.match(/(\d+)板/);
                if (bm) s.position = bm[1] + '板';
                else s.position = s.status;
            }
        });
    }

    // ── 7. sentimentCycle → emotionCycle ──
    if (!mo.emotionCycle && mo.sentimentCycle) mo.emotionCycle = mo.sentimentCycle;
    if (!mo.emotionCycle && mo.summary) mo.emotionCycle = mo.summary;
    // Also support meta.market_sentiment
    if (!mo.emotionCycle && d.meta && d.meta.market_sentiment) mo.emotionCycle = d.meta.market_sentiment;

    // ── 8. Synthesize indices from flat fields ──
    if (!mo.indices || mo.indices.length === 0) {
        mo.indices = [];
        if (mo.limitUpCount !== undefined) {
            mo.indices.push({ label: '涨停', value: String(mo.limitUpCount) + ' 家', type: 'pos', note: mo.brokenCount ? '炸 ' + mo.brokenCount + ' 家' : '' });
        }
        if (mo.limitDownCount !== undefined) {
            mo.indices.push({ label: '跌停', value: String(mo.limitDownCount) + ' 家', type: 'neg', note: '' });
        }
        if (mo.brokenCount !== undefined && !mo.limitUpCount) {
            mo.indices.push({ label: '炸板', value: String(mo.brokenCount) + ' 家', type: 'neg', note: mo.brokenRate ? '炸板率 ' + mo.brokenRate : '' });
        }
        if (mo.emotionScore !== undefined || mo.sentimentScore !== undefined) {
            var score = mo.sentimentScore !== undefined ? mo.sentimentScore : mo.emotionScore;
            mo.indices.push({ label: '情绪评分', value: String(score), type: score >= 60 ? 'pos' : 'neg', note: '/100' });
        }
        if (mo.totalVolume || mo.volume) {
            mo.indices.push({ label: '量能', value: mo.totalVolume || mo.volume, type: 'neu', note: mo.volumeChange ? mo.volumeChange : '' });
        }
    }

    // ── 9. Synthesize sentiment from flat fields ──
    if (!mo.sentiment || mo.sentiment.length === 0) {
        mo.sentiment = [];
        if (mo.limitUpCount !== undefined) {
            mo.sentiment.push({ dim: '涨停', data: mo.limitUpCount + ' 家', conclusion: mo.limitUpCount >= 80 ? '情绪活跃' : '情绪一般' });
        }
        if (mo.limitDownCount !== undefined) {
            mo.sentiment.push({ dim: '跌停', data: mo.limitDownCount + ' 家', conclusion: mo.limitDownCount > 20 ? '亏钱效应扩散' : '可控', type: mo.limitDownCount > 20 ? 'neg' : undefined });
        }
        if (mo.brokenCount !== undefined || mo.brokenRate !== undefined) {
            mo.sentiment.push({ dim: '炸板率', data: (mo.brokenRate !== undefined ? mo.brokenRate + '%' : mo.brokenCount + ' 家'), conclusion: (mo.brokenRate || 0) > 30 ? '炸板率高，接力谨慎' : '炸板率正常' });
        }
        if (mo.maxConsecutive !== undefined) {
            mo.sentiment.push({ dim: '连板高度', data: mo.maxConsecutive + ' 板', conclusion: mo.maxConsecutive >= 5 ? '高度拓展' : '高度受限' });
        }
        if (mo.maxBoardHeight) {
            mo.sentiment.push({ dim: '连板高度', data: mo.maxBoardHeight, conclusion: '最高板' });
        }
        if (mo.sentimentScore !== undefined) {
            mo.sentiment.push({ dim: '情绪评分', data: mo.sentimentScore + ' 分', conclusion: mo.sentimentScore >= 60 ? '偏暖' : '偏冷', type: mo.sentimentScore >= 60 ? 'pos' : 'neg' });
        }
        if (mo.totalVolume) {
            mo.sentiment.push({ dim: '量能', data: mo.totalVolume, conclusion: '显著缩量' });
        }
        if (mo.shanghaiIndex) {
            var shChange = mo.shanghaiIndex.change || '';
            mo.sentiment.push({ dim: '上证指数', data: String(mo.shanghaiIndex.value) + ' ' + shChange, conclusion: shChange.indexOf('-') >= 0 ? '下跌' : '上涨', type: shChange.indexOf('-') >= 0 ? 'neg' : 'pos' });
        }
    }

    // ── 10. mainThemes → mainlines ──
    if ((!mo.mainlines || mo.mainlines.length === 0) && d.mainThemes && d.mainThemes.length > 0) {
        mo.mainlines = d.mainThemes.map(function(t) {
            var indicator = 'green';
            var statusType = 'green';
            var strengthStr = String(t.strength || '');
            var statusStr = String(t.status || t.trend || '');
            if (strengthStr.indexOf('次主线') >= 0 || strengthStr.indexOf('辅助') >= 0 || statusStr.indexOf('次主线') >= 0) { indicator = 'amber'; statusType = 'amber'; }
            if (strengthStr.indexOf('分歧') >= 0 || statusStr.indexOf('分歧') >= 0) { indicator = 'amber'; statusType = 'amber'; }
            if (strengthStr.indexOf('退潮') >= 0 || statusStr.indexOf('退潮') >= 0 || statusStr.indexOf('大出血') >= 0 || statusStr.indexOf('系统性退潮') >= 0) { indicator = 'red'; statusType = 'red'; }
            var body = t.description || '';
            if (t.coreStocks && t.coreStocks.length > 0) {
                var stockStrs = t.coreStocks.map(function(s) { return typeof s === 'string' ? s : (s.name || s.code || JSON.stringify(s)); });
                body += '<br><strong>核心标的：</strong>' + stockStrs.join('、');
            }
            var strengthLabel = strengthStr;
            if (strengthStr === '绝对主线') strengthLabel = '主线';
            else if (strengthStr === '次主线') strengthLabel = '次线';
            else if (!isNaN(parseInt(strengthStr))) strengthLabel = statusStr || '方向';
            else if (strengthStr) strengthLabel = strengthStr;
            else strengthLabel = '方向';
            return {
                title: strengthLabel + '：' + t.name,
                status: (statusStr || strengthStr) + (t.count ? ' (' + t.count + ')' : ''),
                statusType: statusType,
                indicator: indicator,
                body: body
            };
        });
    }

    // ── 11. coreStocks → topTier + deepAnalysis ──
    if (!d.deepAnalysis) d.deepAnalysis = {};
    if ((!mo.topTier || mo.topTier.length === 0) && d.coreStocks && d.coreStocks.length > 0) {
        d.coreStocks.forEach(function(s) {
            if (!s.code) return;
            var boardMatch = (s.status || '').match(/(\d+)连?板/);
            var boardNum = boardMatch ? boardMatch[1] : (s.boards ? String(s.boards) : '--');
            var sector = s.position || '--';
            if (d.mainThemes) {
                for (var ti = 0; ti < d.mainThemes.length; ti++) {
                    var themeStocks = d.mainThemes[ti].coreStocks || [];
                    for (var si = 0; si < themeStocks.length; si++) {
                        var ts = String(themeStocks[si]);
                        if (ts.indexOf(s.code) >= 0 || ts.indexOf(s.name) >= 0) {
                            sector = d.mainThemes[ti].name + ' · ' + (s.position || '');
                            break;
                        }
                    }
                }
            }
            d.deepAnalysis[s.code] = {
                code: s.code, name: s.name || '--', sector: sector,
                price: '--', change: '--', board: boardNum, volume: '--', turnover: '--',
                logic: s.logic || '暂无逻辑分析', risk: '暂无风险提示', action: '暂无操作建议'
            };
        });
        // Also add from mainThemes.coreStocks
        if (d.mainThemes) {
            d.mainThemes.forEach(function(theme) {
                (theme.coreStocks || []).forEach(function(stockEntry) {
                    var stockStr = typeof stockEntry === 'string' ? stockEntry : (stockEntry.name || '');
                    if (!stockStr) return;
                    var m = stockStr.match(/\((\d{6})\)/);
                    if (!m) {
                        if (typeof stockEntry === 'object' && stockEntry.code) {
                            if (!d.deepAnalysis[stockEntry.code]) {
                                d.deepAnalysis[stockEntry.code] = {
                                    code: stockEntry.code, name: stockEntry.name || stockEntry.code, sector: theme.name || '--',
                                    price: '--', change: '--', board: '--', volume: '--', turnover: '--',
                                    logic: theme.description || '暂无逻辑分析', risk: '暂无风险提示', action: '暂无操作建议'
                                };
                            }
                        }
                        return;
                    }
                    var code = m[1];
                    var name = stockStr.replace(/\(\d{6}\)/, '').trim();
                    if (!d.deepAnalysis[code]) {
                        d.deepAnalysis[code] = {
                            code: code, name: name, sector: theme.name || '--',
                            price: '--', change: '--', board: '--', volume: '--', turnover: '--',
                            logic: theme.description || '暂无逻辑分析', risk: '暂无风险提示', action: '暂无操作建议'
                        };
                    }
                });
            });
        }
        mo.topTier = d.coreStocks.map(function(s, i) {
            var tier = 1;
            if (s.position && s.position.indexOf('2板') >= 0) tier = 2;
            if (s.position && (s.position.indexOf('3板') >= 0 || s.position.indexOf('高度') >= 0)) tier = 3;
            return {
                rank: i + 1, tier: tier, code: s.code || '--', name: s.name || '--',
                desc: (s.status || '') + ' · ' + (s.position || ''), chip: s.logic || ''
            };
        });
    }

    // ── 12. Fallback: mainThemes[].coreStocks → topTier ──
    if ((!mo.topTier || mo.topTier.length === 0) && d.mainThemes && d.mainThemes.length > 0) {
        var tierList = [];
        var rank = 1;
        d.mainThemes.forEach(function(theme) {
            (theme.coreStocks || []).forEach(function(stockEntry) {
                var stockStr = typeof stockEntry === 'string' ? stockEntry : '';
                var code = '', name = '', board = '--', reason = '';
                if (typeof stockEntry === 'object' && stockEntry !== null) {
                    code = stockEntry.code || '';
                    name = stockEntry.name || '';
                    board = stockEntry.board || '--';
                    reason = stockEntry.reason || stockEntry.note || '';
                } else if (stockStr) {
                    var m = stockStr.match(/\((\d{6})\)/);
                    if (m) { code = m[1]; name = stockStr.replace(/\(\d{6}\)/, '').trim(); }
                    else { name = stockStr; }
                }
                if (!name && !code) return;
                var tier = 1;
                var position = board;
                if (board.indexOf('首板→2板') >= 0 || board.indexOf('2板') >= 0) { tier = 2; position = '2板'; }
                if (board.indexOf('3板') >= 0) { tier = 3; position = '3板'; }
                if (board.indexOf('4板') >= 0) { tier = 4; position = '4板'; }
                if (board.indexOf('5板') >= 0 || board.indexOf('最高') >= 0) { tier = 5; position = '5板+'; }
                if (board === '首板') { tier = 1; position = '首板'; }
                if (board === '--') position = theme.name || '--';
                if (code && !d.deepAnalysis[code]) {
                    d.deepAnalysis[code] = {
                        code: code, name: name, sector: theme.name || '--',
                        price: '--', change: '--', board: board, volume: '--', turnover: '--',
                        logic: reason || theme.description || '暂无逻辑分析', risk: '暂无风险提示', action: '暂无操作建议'
                    };
                }
                tierList.push({
                    rank: rank++, tier: tier, code: code || '--', name: name || '--',
                    desc: position + (reason ? ' · ' + reason : ''), chip: reason || theme.name || ''
                });
            });
        });
        if (tierList.length > 0) mo.topTier = tierList;
    }

    // ── 13. riskAlerts → lossDetector ──
    if ((!mo.lossDetector || !mo.lossDetector.rows || mo.lossDetector.rows.length === 0) && d.riskAlerts && d.riskAlerts.length > 0) {
        mo.lossDetector = {
            rows: d.riskAlerts.map(function(r, i) {
                var parts = (r.stock || '').split(' ');
                var code = parts.length > 1 ? parts[0] : '--';
                var name = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
                var riskText = r.risk || '';
                var changeMatch = riskText.match(/(-?\d+(?:\.\d+)?)%/);
                var change = changeMatch ? changeMatch[1] + '%' : '--';
                var tag = null;
                if (riskText.indexOf('跌停') >= 0) tag = '跌停';
                else if (riskText.indexOf('核按钮') >= 0 || riskText.indexOf('核') >= 0) tag = '核按钮';
                else if (riskText.indexOf('炸板') >= 0) tag = '炸板';
                else if (riskText.indexOf('开板') >= 0) tag = '开板';
                return { id: i + 1, code: code, name: name, change: change, feature: riskText, tag: tag };
            }),
            alert: d.riskAlerts.map(function(r) { return r.risk; }).join('<br>')
        };
    }

    // ── 14. Enrich deepAnalysis with lossDetector rows ──
    if (mo.lossDetector && mo.lossDetector.rows) {
        mo.lossDetector.rows.forEach(function(row) {
            if (row.code && row.code !== '--') {
                if (d.deepAnalysis[row.code]) {
                    d.deepAnalysis[row.code].risk = row.feature || d.deepAnalysis[row.code].risk;
                    d.deepAnalysis[row.code].action = '回避';
                    if (row.change !== '--') d.deepAnalysis[row.code].change = row.change;
                } else {
                    d.deepAnalysis[row.code] = {
                        code: row.code, name: row.name || '--', sector: '负反馈标的',
                        price: '--', change: row.change !== '--' ? row.change : '--',
                        board: '--', volume: '--', turnover: '--',
                        logic: row.feature || '暂无逻辑分析', risk: row.feature || '暂无风险提示', action: '回避'
                    };
                }
            }
        });
    }

    // ── 15. logicCheck fallback ──
    if (!d.logicCheck) {
        d.logicCheck = { errorRecall: '暂无历史误判记录', logicRows: [], correction: '' };
    }

    // ── 16. nextDayPlan → tradePlan ──
    if (!d.tradePlan && d.nextDayPlan) {
        var np = d.nextDayPlan;
        var guideRows = [];
        if (np.stance) guideRows.push({ dim: '进攻/防守', suggest: np.stance });
        if (np.strategy) guideRows.push({ dim: '操作模式', suggest: np.strategy });
        if (np.avoid) guideRows.push({ dim: '回避方向', suggest: np.avoid, type: 'neg' });
        var actionRows = [];
        if (np.primaryTarget) {
            var pt = np.primaryTarget;
            actionRows.push({
                direction: pt.name + '（首选）', dirType: 'pos',
                target: pt.name + ' (' + pt.action + ')', code: pt.code || '--', trigger: pt.trigger || ''
            });
        }
        if (np.secondaryTarget) {
            var st = np.secondaryTarget;
            actionRows.push({
                direction: st.name + '（次选）', dirType: 'pos',
                target: st.name + ' (' + st.action + ')', code: st.code || '--', trigger: st.trigger || ''
            });
        }
        var avoidList = np.avoid ? np.avoid.split('/').map(function(s) { return s.trim(); }) : [];
        d.tradePlan = {
            strategy: np.stance || '', guideRows: guideRows, actionRows: actionRows,
            avoidList: avoidList,
            conclusion: np.primaryTarget ? '首选 ' + np.primaryTarget.name + '，触发条件：' + np.primaryTarget.trigger : ''
        };
        // Enrich deepAnalysis with nextDayPlan targets
        ['primaryTarget', 'secondaryTarget'].forEach(function(key) {
            var t = np[key];
            if (!t || !t.code) return;
            var actionText = t.action ? t.name + '（' + t.action + '）' : '';
            if (t.trigger) actionText += '；触发：' + t.trigger;
            if (t.cancel) actionText += '；取消：' + t.cancel;
            if (t.position) actionText += '；仓位：' + t.position;
            if (d.deepAnalysis[t.code]) {
                d.deepAnalysis[t.code].action = actionText || d.deepAnalysis[t.code].action;
            } else {
                d.deepAnalysis[t.code] = {
                    code: t.code, name: t.name || '--', sector: '明日预案标的',
                    price: '--', change: '--', board: '--', volume: '--', turnover: '--',
                    logic: '暂无逻辑分析', risk: t.cancel || '暂无风险提示', action: actionText || '暂无操作建议'
                };
            }
        });
    }

    // ── 17. Ensure all canonical sections exist ──
    if (!d.deepAnalysis) d.deepAnalysis = {};
    if (!mo.indices) mo.indices = [];
    if (!mo.sentiment) mo.sentiment = [];
    if (!mo.mainlines) mo.mainlines = [];
    if (!mo.topTier) mo.topTier = [];
    if (!mo.lossDetector) mo.lossDetector = { rows: [], alert: '' };
    if (!mo.lossDetector.rows) mo.lossDetector.rows = [];
    if (!mo.emotionCycle) mo.emotionCycle = '暂无数据';
    if (!d.tradePlan) d.tradePlan = { strategy: '', guideRows: [], actionRows: [], avoidList: [], conclusion: '' };
    if (!d.tradePlan.guideRows) d.tradePlan.guideRows = [];
    if (!d.tradePlan.actionRows) d.tradePlan.actionRows = [];
    if (!d.tradePlan.avoidList) d.tradePlan.avoidList = [];

    // ── 18. Cleanup: remove source fields that have been converted ──
    delete d.mainThemes;
    delete d.coreStocks;
    delete d.riskAlerts;
    delete d.riskWarnings;
    delete d.risks;
    delete d.nextDayStrategy;
    delete d.tomorrowPlan;
    delete d.nextDayPlan;

    // Clean up snake_case fields from marketOverview (keep only camelCase canonical)
    Object.keys(moAliases).forEach(function(snakeKey) {
        delete mo[snakeKey];
    });
    // Clean up meta-level snake_case
    if (d.meta) {
        delete d.meta.trade_date;
        delete d.meta.report_date;
        delete d.meta.generated_at;
        delete d.meta.report_type;
        delete d.meta.market_sentiment;
        delete d.meta.sentiment_score;
        delete d.meta.broken_rate;
        delete d.meta.total_limit_up;
        delete d.meta.total_limit_down;
        delete d.meta.total_zhaban;
        delete d.meta.lianban_height;
    }

    return d;
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
                version: '3.7',
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

                    // ── Normalize to canonical schema before writing ──
                    // This ensures data.json always contains the same format,
                    // regardless of what format QwenPaw pushes.
                    var normalized = normalizeToCanonical(data);
                    console.log('[API] Data normalized to canonical schema');

                    // Write canonical data to data.json
                    var dataPath = getDataPath();
                    fs.writeFileSync(dataPath, JSON.stringify(normalized, null, 2), 'utf-8');
                    console.log('[API] data.json updated:', dataPath);

                    // Write to history directory
                    var dir = ensureHistoryDir();
                    var dateStr = normalized.meta.date || new Date().toISOString().split('T')[0];
                    var historyPath = path.join(dir, dateStr + '.json');
                    fs.writeFileSync(historyPath, JSON.stringify(normalized, null, 2), 'utf-8');
                    console.log('[API] History saved:', historyPath);

                    // Notify renderer process to refresh
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('data-updated', normalized);
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
