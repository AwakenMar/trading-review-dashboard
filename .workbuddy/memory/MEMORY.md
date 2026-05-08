# Project Memory

## User Profile
- GitHub 用户名: AwakenMar
- 量化交易背景，关注芯片/半导体/一季报增长/医药CRO等板块
- 使用交易复盘报告（扫地僧逻辑深度复盘）
- 使用 QwenPaw（阿里 AI Agent 桌面端，前身为 CoPaw）做投资分析

## Project: Trading Review Dashboard
- 本地路径: c:\Users\96584.TUF-GAMING\WorkBuddy\20260428223711
- GitHub Repo: https://github.com/AwakenMar/trading-review-dashboard
- Live URL: https://awakenmar.github.io/trading-review-dashboard/
- 部署方式: GitHub Pages + GitHub Actions (static.yml workflow)
- gh CLI 已安装并登录 (路径: /c/Program Files/GitHub CLI)

## Design System
- 风格: 彭博终端 / TradingView 深色金融终端 (v3.5.1 Professional Grade)
- 主背景: #0D1117, 卡片: #161B22, 边框: #30363D, 玻璃: rgba(22,27,34,0.85)
- **A股涨红跌绿配色**: 涨/正面→红(#F85149), 跌/负面→绿(#3FB950), 警告→琥珀(#D29922), 中性→蓝(#58A6FF), 霓虹→#00E5FF
- 字体: JetBrains Mono (Google Fonts), 等宽数字 tabular-nums
- 圆角: 12px, 表格无竖线
- v3.5 UI 特性: 毛玻璃侧边栏(drawer/history/sidebar), 霓虹高亮条, Sparkline, 负反馈斜纹, LIVE脉冲灯, 霓虹渐变分割线

## Tech Stack (v3.5.1 Electron Desktop + Web + HTTP API)
- **双模架构**: Electron 桌面端 + Web 端共用同一 index.html
- **Electron**: v33.4.11, contextIsolation:true, nodeIntegration:false
- **打包**: electron-builder, nsis target (npm run build)
- **⚠️ 部署注意**: 用户运行的是安装版 (Desktop/Alpha-Q/)，开发目录改动不生效！每次修改 index.html 后必须 npm run build 打包新安装程序
- **打包流程**: 改 index.html → 更新 package.json version → npm run build → 复制 exe 到 Desktop/Alpha-Q/ → 用户双击安装
- **字体**: JetBrains Mono (Google Fonts CDN) + fallback
- **数据加载**: Electron 用 IPC (readData), Web 用 fetch (./data.json)
- **HTTP API**: 本地 127.0.0.1:18901, 供 QwenPaw 等外部工具推送数据
- **一页滚动模式**: 6 大板块 (壹~陆) + 侧边栏锚点跳转 + 滚动高亮
- **日期导航**: 头部 ◀/▶ 按钮切换历史复盘，"今天"按钮回到实时数据

## Architecture (v3.3 Electron Desktop)
- main.js: Electron 主进程, frameless 1280x800 窗口, 自定义标题栏
  - ELECTRON_RUN_AS_NODE guard: 自动检测并 re-spawn (用户环境 VS Code 集成终端会设置此变量)
  - HTTP API 服务器: startApiServer(), 端口自动递增
- preload.js: contextBridge IPC 桥接 (minimize/maximize/close/readData/getDataPath/onDataUpdated/onApiPushReceived/getApiPort/listHistory/loadHistory/fetchChart)
- index.html: 自定义 titlebar + 左侧 sidebar (5板块锚点跳转) + 主内容区 (一页滚动6板块)
  - 壹·市场环境 → 贰·板块主线 → 叁·核心标的 → 肆·负反馈 → 伍·逻辑对账 → 陆·交易预案
  - 日期导航: ◀/▶ 切换历史复盘 + "今天" 回到实时
  - isElectron flag 检测 window.electronAPI 存在来切换模式
  - Web 模式下自动隐藏 titlebar, 高度 100vh
- fs.watch() 监听 data.json 变更, 150ms debounce, IPC 推送到渲染进程
- electron-builder: nsis 安装包, appId com.alpha-q.terminal

## QwenPaw Integration
- QwenPaw Agent Prompt 模板: QWENPAW-AGENT-PROMPT.md (v3.3)
- Agent 通过 HTTP POST 推送 JSON 到 http://127.0.0.1:18901/api/update-data
- 推送后 Electron 自动刷新界面, 数据同时保存到 history
- **⚠️ 数据格式兼容**: QwenPaw Agent 可能输出非标准字段名
  - 实际推送: `mainThemes`, `coreStocks`, `riskAlerts`, `nextDayPlan`, `meta.trade_date`, 扁平字段
  - 期望格式: `marketOverview.mainlines`, `topTier`, `lossDetector`, `tradePlan`, `meta.date`, `indices[]`, `sentiment[]`
  - **已内置 adaptData() 适配层**，在 renderAll() 前自动转换两种格式
- **MCP Bridge** (推荐方式): mcp-bridge/index.js
  - 基于 @modelcontextprotocol/sdk, stdio 传输
  - 暴露 push_report + check_status 两个 MCP 工具
  - QwenPaw 配置: 智能体→MCP→创建→粘贴 JSON
  - `{"mcpServers":{"alpha-q":{"command":"node","args":["path/to/mcp-bridge/index.js"]}}}`
- 可选进阶: 开发 QwenPaw Skill (clawhub init) 实现自动调用

## Key Bugs Fixed
- JSON parse error: data.json 中的 ASCII 引号改为中文角引号「」
- npm install timeout: 设置 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
- ELECTRON_RUN_AS_NODE=1 导致 require('electron') 返回路径字符串:
  - 根因: VS Code / WorkBuddy 集成终端继承该环境变量
  - 修复: main.js 顶部 guard 检测该变量, 自动清除后 re-spawn
- **头部遮挡 bug**: date-banner h2 和 meta 文字重叠 → 改为 flex 横向排列
- **A股配色 bug**: 涨红跌绿反转 → 全局修正 m-pos=红, m-neg=绿, tag-green=红底, tag-red=绿底
- **QwenPaw 格式不匹配**: Agent 推送的 JSON 字段名与渲染代码期望不同 → 添加 adaptData() 适配层自动转换
- **日期导航按钮永远禁用**: refreshAvailableDates() 异步完成后没调 updateDateNavUI() → 添加调用 (v3.3.1 修复)
- **最大化空白**: .container max-width 1400px 改为 100% (v3.3.2)
- **跌幅列全显"--"**: riskAlerts 无跌幅字段 → 正则提取 + 风险标签自动检测 (v3.3.2)
- **深度数据缺失**: QwenPaw 不推送 deepAnalysis → 从 coreStocks/mainThemes/riskAlerts 自动合成 (v3.3.2)
- **侧边栏分界线不清楚**: drawer-section间仅margin间隔 → 添加border + 霓虹渐变分割线 + 卡片边框 (v3.5.1)
