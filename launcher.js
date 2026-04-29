// Alpha-Q 3.0 — Desktop Launcher (Node.js)
// Double-click this file or the desktop shortcut to launch.
// Unsets ELECTRON_RUN_AS_NODE so Electron runs in app mode.

const { spawn } = require('child_process');
const path = require('path');

const projectDir = __dirname;
const electronExe = path.join(projectDir, 'node_modules', 'electron', 'dist', 'electron.exe');

const fs = require('fs');
if (!fs.existsSync(electronExe)) {
    console.error('[ERROR] Electron not found. Please run: npm install');
    process.exit(1);
}

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronExe, [projectDir], {
    env: env,
    stdio: 'ignore',
    detached: true
});

child.unref();
process.exit(0);
