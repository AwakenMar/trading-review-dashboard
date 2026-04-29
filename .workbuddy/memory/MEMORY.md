# Project Memory

## User Profile
- GitHub 用户名: AwakenMar
- 量化交易背景，关注芯片/半导体/一季报增长/医药CRO等板块
- 使用交易复盘报告（扫地僧逻辑深度复盘）

## Project: Trading Review Dashboard
- 本地路径: c:\Users\96584.TUF-GAMING\WorkBuddy\20260428223711
- GitHub Repo: https://github.com/AwakenMar/trading-review-dashboard
- Live URL: https://awakenmar.github.io/trading-review-dashboard/
- 部署方式: GitHub Pages + GitHub Actions (static.yml workflow)
- gh CLI 已安装并登录 (路径: /c/Program Files/GitHub CLI)

## Design System
- 风格: 彭博终端 / TradingView 深色金融终端
- 主背景: #0D1117, 卡片: #161B22, 边框: #30363D
- 绿色(盈利): #3FB950, 红色(亏损): #F85149, 琥珀(警告): #D29922, 蓝色(中性): #58A6FF
- 等宽字体族: SF Mono, Cascadia Code, Fira Code, Consolas
- 圆角: 12px, 表格无竖线

## Tech Stack (v3.0 Electron Desktop + Web)
- **双模架构**: Electron 桌面端 + Web 端共用同一 index.html
- **Electron**: v33.4.11, contextIsolation:true, nodeIntegration:false
- **打包**: electron-builder, nsis target (npm run build)
- **数据加载**: Electron 用 IPC (readData), Web 用 fetch (./data.json)
- 自适应响应式布局
- 实时时钟 JS 脚本
- 左侧 Sidebar 导航 (64px 宽, 图标+文字)
- 右侧 Drawer 侧边栏 (标的深度分析)
- Toast 通知系统 + 数字闪烁动画

## Architecture (v3.0 Electron Desktop)
- main.js: Electron 主进程, frameless 1280x800 窗口, 自定义标题栏
  - ELECTRON_RUN_AS_NODE guard: 自动检测并 re-spawn (用户环境 VS Code 集成终端会设置此变量)
- preload.js: contextBridge IPC 桥接 (minimize/maximize/close/readData/getDataPath/onDataUpdated)
- index.html: 自定义 titlebar (drag region) + 左侧 sidebar + 主内容区
  - isElectron flag 检测 window.electronAPI 存在来切换模式
  - Web 模式下自动隐藏 titlebar, 高度 100vh
- fs.watch() 监听 data.json 变更, 150ms debounce, IPC 推送到渲染进程
- electron-builder: nsis 安装包, appId com.alpha-q.terminal

## Key Bugs Fixed
- JSON parse error: data.json 中的 ASCII 引号改为中文角引号「」
- npm install timeout: 设置 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
- ELECTRON_RUN_AS_NODE=1 导致 require('electron') 返回路径字符串:
  - 根因: VS Code / WorkBuddy 集成终端继承该环境变量
  - 修复: main.js 顶部 guard 检测该变量, 自动清除后 re-spawn
