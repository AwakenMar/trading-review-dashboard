# Alpha-Q Terminal JSON 格式规范 v3.8

> **此文件是 Alpha-Q Terminal 唯一接受的 JSON Schema。**
> QwenPaw 每次输出复盘数据时，必须严格遵循此格式。任何字段名偏差、类型错误或结构层级错误，都会导致渲染异常（如 `--`、空白、"未找到"）。

---

## 总结构

```
{
  "meta": { ... },
  "marketOverview": {
    "indices": [ ... ],
    "sentiment": [ ... ],
    "emotionCycle": "...",
    "mainlines": [ ... ],
    "topTier": [ ... ],
    "lossDetector": { rows: [ ... ], alert: "..." }
  },
  "logicCheck": { ... },
  "tradePlan": { ... },
  "deepAnalysis": { ... }
}
```

---

## 一、meta（元数据）

| 字段 | 类型 | 必填 | 示例 |
|------|------|------|------|
| `date` | string | ✅ | `"2026-05-18"` |
| `version` | string | ✅ | `"3.8"` |
| `mode` | string | ❌ | `"交互式交易终端"` |
| `title` | string | ❌ | `"Alpha-Q 3.8"` |

**⚠️ 禁止**：`report_date`、`trade_date`、`generated_at`

---

## 二、marketOverview.indices（盘面指标）

数组，每个元素：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | string | ✅ | 指标名称，如 `"上证指数"`、`"涨停"` |
| `value` | string | ✅ | 显示值，如 `"+0.45%"`、`"65 家"` |
| `type` | string | ✅ | 颜色类型：`"pos"`(红/涨)、`"neg"`(绿/跌)、`"neu"`(中性) |
| `note` | string | ❌ | 补充说明，如 `"缩量1200亿"` |

**示例**：
```json
{ "label": "上证指数", "value": "+0.45%", "type": "pos", "note": "缩量反弹" }
{ "label": "涨停", "value": "65 家", "type": "pos", "note": "昨日48家" }
{ "label": "成交额", "value": "1.23", "type": "neu", "note": "万亿 缩量1200亿" }
```

---

## 三、marketOverview.sentiment（情绪维度）

数组，每个元素：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `dim` | string | ✅ | 维度名称，如 `"涨跌比"`、`"炸板率"` |
| `data` | string | ✅ | 数据值，如 `"3200 : 1800"`、`"18%"` |
| `conclusion` | string | ✅ | 结论，如 `"多方占优"`、`"炸板率正常"` |
| `type` | string | ❌ | 可选颜色覆盖：`"pos"`、`"neg"` |

**示例**：
```json
{ "dim": "涨跌比", "data": "3200 : 1800", "conclusion": "多方占优" }
{ "dim": "跌停", "data": "8家", "conclusion": "可控", "type": "neg" }
```

---

## 四、marketOverview.emotionCycle（情绪周期）

| 类型 | 必填 | 说明 |
|------|------|------|
| string | ✅ | HTML 字符串，描述当前情绪周期阶段 |

**示例**：
```json
"当前处于<strong>高潮期分歧初期</strong>，涨停数量维持高位但高位股开始分歧"
```

**⚠️ 禁止**：`sentiment` 作为字符串（如 `"高位分歧"`），必须为上述数组格式。

---

## 五、marketOverview.mainlines（主线板块）

数组，每个元素：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | ✅ | 板块标题，如 `"主线：芯片/存储"` |
| `status` | string | ✅ | 状态文字，如 `"强化"`、`"延续"` |
| `statusType` | string | ✅ | 颜色：`"green"`(主线)、`"amber"`(次线)、`"red"`(退潮) |
| `indicator` | string | ✅ | 同 `statusType`，用于左侧指示条 |
| `body` | string | ✅ | 详细分析，支持 HTML 标签 |

**示例**：
```json
{
  "title": "主线：芯片/存储",
  "status": "强化",
  "statusType": "green",
  "indicator": "green",
  "body": "板块强度断层第一，大单净入28亿。<br><strong>核心标的：</strong>兴福电子(688545)、同有科技(300302)"
}
```

---

## 六、marketOverview.topTier（核心地位标的 — 最高辨识度）

**⚠️ 这是最容易出错的区域。必须严格按以下格式输出。**

数组，每个元素：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `rank` | number | ✅ | 排名，从 1 开始 |
| `tier` | number | ✅ | 级别：1=首板/观察，2=1进2，3=连板龙头，4+=高度板 |
| `code` | string | ✅ | **6 位股票代码**，如 `"600130"`。❌ 禁止 `"--"`、空字符串、8 位带前缀 |
| `name` | string | ✅ | 股票名称，如 `"波导股份"`。❌ 禁止空字符串 |
| `desc` | string | ✅ | 描述，如 `"3板 · 航天+北斗"` |
| `chip` | string | ✅ | 标签/属性，如 `"连板龙头"`、`"1进2标的"` |

**错误示例（会导致 `--` 显示）**：
```json
// ❌ 错误：code 为空
{ "rank": 1, "tier": 3, "code": "", "name": "柏诚股份", "desc": "3板", "chip": "芯片/半导体" }

// ❌ 错误：使用 stockCode 而非 code
{ "rank": 1, "tier": 3, "stockCode": "601133", "name": "柏诚股份", ... }

// ❌ 错误：code 带前缀
{ "rank": 1, "tier": 3, "code": "sh601133", "name": "柏诚股份", ... }
```

**正确示例**：
```json
[
  { "rank": 1, "tier": 3, "code": "600130", "name": "波导股份", "desc": "3板 · 航天+北斗", "chip": "连板龙头" },
  { "rank": 2, "tier": 2, "code": "688545", "name": "兴福电子", "desc": "首板 · 存储+国企", "chip": "1进2标的" }
]
```

**数据来源**：可以从 `coreStocks` 自动转换，但为了保证数据完整性，**强烈建议直接输出 `topTier` 数组**。

---

## 七、marketOverview.lossDetector（亏钱效应）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `rows` | array | ✅ | 亏钱标的数组 |
| `alert` | string | ✅ | 总体预警文字 |

`rows` 数组每个元素：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | number | ✅ | 序号 |
| `code` | string | ✅ | 6 位代码 |
| `name` | string | ✅ | 股票名称 |
| `change` | string | ✅ | 涨跌幅，如 `"-7.8%"`、`"跌停"`。❌ 禁止 `"--"` |
| `feature` | string | ✅ | 特征描述 |
| `tag` | string | ❌ | 标签，如 `"炸板"`、`"核按钮"`、`"跌停"` |

---

## 八、logicCheck（逻辑校验）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `errorRecall` | string | ✅ | 昨日预判回顾 |
| `logicRows` | array | ✅ | 对比行 |
| `correction` | string | ✅ | 修正总结 |

`logicRows` 数组每个元素：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `dim` | string | ✅ | 维度 |
| `yesterday` | string | ✅ | 昨日预判 |
| `today` | string | ✅ | 今日实际 |
| `diff` | string | ✅ | 差异文字 |
| `diffType` | string | ✅ | 颜色：`"green"`(符合预期)、`"red"`(低于预期)、`"amber"`(超预期) |

---

## 九、tradePlan（明日预案）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `strategy` | string | ✅ | 总体策略概述 |
| `guideRows` | array | ✅ | 操作指引行 |
| `actionRows` | array | ✅ | 具体行动行 |
| `avoidList` | array | ✅ | 回避方向列表（字符串数组） |
| `conclusion` | string | ✅ | 军师总结 |

`guideRows` 数组每个元素：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `dim` | string | ✅ | 维度，如 `"进攻方向"` |
| `suggest` | string | ✅ | 建议内容 |
| `type` | string | ❌ | 颜色：`"pos"`、`"neg"`、`"warn"` |

`actionRows` 数组每个元素：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `direction` | string | ✅ | 方向标签，如 `"首选"`、`"次选"` |
| `dirType` | string | ✅ | 颜色：`"pos"`、`"neg"`、`"warn"` |
| `target` | string | ✅ | 标的名称，如 `"兴福电子 (1进2)"` |
| `code` | string | ❌ | 6 位股票代码（有则显示为可点击） |
| `trigger` | string | ✅ | 触发条件 |

---

## 十、deepAnalysis（深度分析）

对象，键为股票代码（6 位），值为：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `code` | string | ✅ | 6 位代码 |
| `name` | string | ✅ | 股票名称 |
| `sector` | string | ✅ | 所属板块，如 `"芯片/存储 · 首板"` |
| `price` | string | ✅ | 当前价，如 `"32.45"`。无则填 `"--"` |
| `change` | string | ✅ | 涨跌幅，如 `"+20.0%"`。无则填 `"--"` |
| `board` | string | ✅ | 连板数，如 `"1"`、`"3"`。无则填 `"--"` |
| `volume` | string | ✅ | 成交额，如 `"8.2亿"`。无则填 `"--"` |
| `turnover` | string | ✅ | 换手率，如 `"15.3%"`。无则填 `"--"` |
| `logic` | string | ✅ | 上涨逻辑 |
| `risk` | string | ✅ | 风险提示 |
| `action` | string | ✅ | 操作建议 |

**示例**：
```json
{
  "688545": {
    "code": "688545", "name": "兴福电子", "sector": "芯片/存储 · 首板",
    "price": "32.45", "change": "+20.0%", "board": "1",
    "volume": "8.2亿", "turnover": "15.3%",
    "logic": "存储芯片+电子化学品+国企，板块龙头首板爆发",
    "risk": "1进2失败风险，注意换手是否充分",
    "action": "1进2，竞价高开3%以内且量能放大介入"
  }
}
```

---

## 十一、⛔ 绝对禁止字段清单

以下字段名 **绝对禁止使用**，否则会被归一化层删除或导致数据丢失：

| 禁止字段 | 原因 | 正确替代 |
|----------|------|----------|
| `mainThemes` | v1 旧字段 | `marketOverview.mainlines` |
| `coreStocks` | v1 旧字段 | `marketOverview.topTier` + `deepAnalysis` |
| `riskWarnings` / `risks` / `riskWarning` | 旧字段/单字符串 | `marketOverview.lossDetector` |
| `nextDayStrategy` / `tomorrowPlan` / `nextDayPlan` | 旧字段 | `tradePlan` |
| `observationPool` | v4 字段 | `tradePlan.actionRows` + `deepAnalysis` |
| `sentiment` (字符串) | v4 旧格式 | `marketOverview.sentiment` (数组) |
| `sentimentScore` | v4 扁平字段 | 合并到 `indices` / `sentiment` 数组 |
| `volume` / `breadth` / `brokenRate` (描述性字符串) | v4 扁平字段 | 合并到 `indices` / `sentiment` 数组 |
| `report_date` / `trade_date` | 旧字段 | `meta.date` |
| **任何 snake_case** | 格式不兼容 | 统一 camelCase |

---

## 十二、完整正确示例

```json
{
  "meta": {
    "date": "2026-05-18",
    "version": "3.8",
    "mode": "交互式交易终端",
    "title": "Alpha-Q 3.8"
  },
  "marketOverview": {
    "indices": [
      { "label": "上证指数", "value": "+0.45%", "type": "pos", "note": "缩量反弹" },
      { "label": "深证成指", "value": "+0.32%", "type": "pos", "note": "" },
      { "label": "创业板指", "value": "-0.15%", "type": "neg", "note": "" },
      { "label": "成交额", "value": "1.23", "type": "neu", "note": "万亿 缩量1200亿" }
    ],
    "sentiment": [
      { "dim": "涨跌比", "data": "3200 : 1800", "conclusion": "多方占优" },
      { "dim": "涨停", "data": "65家 (昨日48家)", "conclusion": "涨停增多，情绪回升" },
      { "dim": "跌停", "data": "8家", "conclusion": "可控", "type": "neg" },
      { "dim": "连板高度", "data": "7板 (股名)", "conclusion": "高度拓展" },
      { "dim": "炸板率", "data": "18%", "conclusion": "炸板率正常" }
    ],
    "emotionCycle": "当前处于<strong>高潮期分歧初期</strong>，涨停数量维持高位但高位股开始分歧",
    "mainlines": [
      {
        "title": "主线：芯片/存储",
        "status": "强化",
        "statusType": "green",
        "indicator": "green",
        "body": "板块强度断层第一，大单净入28亿。核心标的集体爆发，资金真金白银进场。<br><strong>核心标的：</strong>兴福电子(688545)、同有科技(300302)"
      },
      {
        "title": "次线：通信/CPO",
        "status": "延续",
        "statusType": "amber",
        "indicator": "amber",
        "body": "字节AI预算利好光模块，但主力净流出23亿，机构在卖游资在接。"
      }
    ],
    "topTier": [
      { "rank": 1, "tier": 3, "code": "600130", "name": "波导股份", "desc": "3板 · 航天+北斗", "chip": "连板龙头" },
      { "rank": 2, "tier": 2, "code": "688545", "name": "兴福电子", "desc": "首板 · 存储+国企", "chip": "1进2标的" }
    ],
    "lossDetector": {
      "rows": [
        { "id": 1, "code": "600130", "name": "波导股份", "change": "+10.0%", "feature": "3板炸板14次，换手36%，明天竞价低开-5%以下核按钮", "tag": "炸板" },
        { "id": 2, "code": "002902", "name": "铭普光磁", "change": "-7.8%", "feature": "换手37%+超大单流出-3.8亿，主力借板块拉高出货", "tag": "核按钮" }
      ],
      "alert": "3板以上接力风险极大，<strong>炸板率高</strong>，高位股谨防核按钮"
    }
  },
  "logicCheck": {
    "errorRecall": "昨日预判芯片分歧加大，实盘芯片强化超预期",
    "logicRows": [
      { "dim": "芯片/存储", "yesterday": "预判分歧加大", "today": "板块强化涨停65只", "diff": "超预期", "diffType": "amber" },
      { "dim": "商业航天", "yesterday": "预判延续", "today": "高位炸板退潮", "diff": "低于预期", "diffType": "red" }
    ],
    "correction": "芯片板块强度持续超预期，需修正'分歧'判断为'强化'。航天利好出尽是利空。"
  },
  "tradePlan": {
    "strategy": "偏防守不空仓，<span style=\"color:var(--amber-bright)\">5成</span>仓位。进攻低位回避高位。",
    "guideRows": [
      { "dim": "进攻方向", "suggest": "首板打板(芯片/存储) + 1进2(换手充分)" },
      { "dim": "防守策略", "suggest": "高位接力减半仓，尾盘不追高", "type": "warn" },
      { "dim": "回避方向", "suggest": "商业航天、3板以上接力、量化主导票", "type": "neg" }
    ],
    "actionRows": [
      { "direction": "首选", "dirType": "pos", "target": "兴福电子 (1进2)", "code": "688545", "trigger": "竞价高开3%以内且量能放大" },
      { "direction": "次选", "dirType": "pos", "target": "同有科技 (首板)", "code": "300302", "trigger": "分时站稳均线+放量突破" }
    ],
    "avoidList": ["商业航天", "3板以上接力", "量化主导票", "病毒防治轮动"],
    "conclusion": "首选兴福电子1进2，<strong>触发条件：竞价高开3%以内量能放大</strong>。回避高位接力。"
  },
  "deepAnalysis": {
    "688545": {
      "code": "688545", "name": "兴福电子", "sector": "芯片/存储 · 首板",
      "price": "32.45", "change": "+20.0%", "board": "1",
      "volume": "8.2亿", "turnover": "15.3%",
      "logic": "存储芯片+电子化学品+国企，板块龙头首板爆发",
      "risk": "1进2失败风险，注意换手是否充分",
      "action": "1进2，竞价高开3%以内且量能放大介入"
    },
    "600130": {
      "code": "600130", "name": "波导股份", "sector": "商业航天 · 3板炸板",
      "price": "18.76", "change": "+10.0%", "board": "3",
      "volume": "12.3亿", "turnover": "36.1%",
      "logic": "航天+北斗导航芯片，3板但反复炸板",
      "risk": "3板炸板14次，换手36%，明天竞价低开-5%以下核按钮",
      "action": "回避"
    }
  }
}
```

---

## 十三、常见问题速查

| 现象 | 原因 | 解决 |
|------|------|------|
| topTier 显示 `--` | `code` 为空或字段名错误 | 确保 `code` 为 6 位数字字符串，字段名是 `code` 不是 `stockCode` |
| topTier 标签全是"芯片/半导体" | `chip` 字段被统一填充 | `chip` 应为个股属性（如"连板龙头"），板块名放 `desc` |
| 深数据区域显示"未找到" | `deepAnalysis` 键名不是 6 位代码 | 确保 `deepAnalysis` 的键为 `"688545"` 格式 |
| 情绪维度空白 | `sentiment` 是字符串而非数组 | `sentiment` 必须是 `[{dim, data, conclusion}]` 数组 |
| 指标区域空白 | `indices` 数组为空 | `indices` 至少包含上证指数、成交额等基础指标 |
| 主线不显示 | `mainlines` 数组为空或字段名用了 `mainThemes` | 使用 `mainlines`，且放在 `marketOverview` 内 |
