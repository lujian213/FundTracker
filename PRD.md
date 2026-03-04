# FundTracker — 产品需求文档 (PRD)

版本：1.7
最后更新：2026-03-04

---

简述
- FundTracker 是一款前端单页（SPA）应用，面向普通投资者，用于添加/管理自选基金/指数，展示实时估值、涨跌、历史净值趋势及交易记录管理（本地持久化），目标是快速构建可交付的前端版本（vibe coding 可直接实现）。

目标与范围
- 目标：提供稳定、直观、可测试的核心功能：自选列表管理、基金/指数估值显示、历史曲线、交易记录（添加/编辑/删除/导入/导出）以及基本风险提示。
- 范围（本 PRD 覆盖）：
  - 自选基金/指数的添加/删除/排序/批量管理
  - 实时估值展示与历史净值曲线（含 SMA 指标）
  - 交易记录模块（本地存储、分页、导入/导出、价格回溯策略）
  - 风险评级与 tooltip（基于均线）
  - 本地化时间规则（交易记录价格回溯使用用户本地日终）
  - **内存数据缓存层（性能优化）**：将数据获取与界面展示分离，实现所有界面操作秒开
  - **数据备份与恢复（导出/导入）**：全量 JSON 备份、手动导出、定时自动导出、导入覆盖、兼容性保障
  - 测试、验收与 CI 要求

高优先级交付物（v1）
- 主界面：自选卡片（TickerCard）列表（响应式布局）
- 添加弹窗：`AddTickerModal`（支持批量输入、验证）
- 详情弹窗：`FundDetailsModal` / `IndexDetailsModal`（历史曲线 + SMA）
- 交易管理弹窗：`TradeManager`（新增/编辑/删除/分页/导入/导出）
- 交易明细弹窗：`TransactionsModal`（按日期展示所有基金当日交易汇总，含统计行）
- 持仓弹窗：`PositionsModal`（持仓市场价值饼图 + 持仓表格，含空状态）
- 备份设置弹窗：`BackupSettingsModal`（配置每日自动导出时间、倒计时显示）
- 本地持久化：portfolio/indices 与 trades 存于 localStorage
- 单元测试：服务层（fundService）和关键组件（AddTickerModal、TickerCard、ConfirmDialog、TradeManager、TransactionsModal、PositionsModal、BackupSettingsModal）

关键确认（已由产品在 2026-02-16 确认）
- 均线默认可视：显示 SMA5、SMA10、SMA20（即 DEFAULT_VISIBLE_MAS = [5,10,20]）。
- `fetchFundHistory`：服务返回完整抓取历史，由消费组件按需截断（TickerCard/FundDetailsModal 使用最近 90 点，TradeManager 使用最近 365 点）。
- 交易导入策略：导入为覆盖（overwrite）指定 symbol 的交易；导入前需提示并建议用户备份（导出）现有数据。
- `total` 字段：不作为持久化字段，仅在导出（JSON/CSV）时动态计算并包含。
- 日期/时间 & 价格回溯：使用用户本地时区的当日 23:59:59 作为回溯截止点来匹配历史价格（TradeManager 的 getPriceForDate 行为）。
- 分页：交易记录默认每页 10 条（pageSize = 10）。

数据模型与契约（开发者参考）

- types.ts（摘要）
  - Ticker { id: string; symbol: string; name: string; market: MarketType }
  - ValuationData { symbol, name, currentPrice, previousPrice, changePercentage, lastUpdated, realtimeDate, netWorthDate, valuationDate, sourceUrl }
  - HistoricalPoint { date: number (ms timestamp), value: number, equityReturn: number }

- 交易记录（localStorage）
  - 存储 key：`fund_trades`
  - 存储结构（JSON）：

```json
{
  "000001": [
    {
      "id": "abc123",
      "date": "2026-02-16",
      "type": "buy",
      "shares": 10.1234,
      "price": 1.2345,
      "fee": 0.50
    }
  ],
  "000002": [ ... ]
}
```

  - 字段精度与约定：
    - `date` 格式为 YYYY-MM-DD（local），用于 UI 显示与价格回溯匹配
    - `shares` 精度建议 4 位小数（输入 step=0.0001）
    - `price` 精度展示 4 位小数（currentPrice & price 存储为 Number）
    - `fee` 精度 2 位小数（输入 step=0.01）
    - `total` 不持久化；导出时 total = (type==='sell' ? price*shares - fee : price*shares + fee)，导出到 CSV 时保留 2 位小数

- 导出格式
  - JSON 导出：{ symbol, trades: [ { id, date, type, shares, price, fee, total } ] }
  - CSV 导出 header：id,date,type,shares,price,fee,total

- 事件与通知
  - 在写入 localStorage 后触发 `CustomEvent('fund-trades-changed', { detail: { time: Date.now() } })`（用于同窗口刷新）
  - 同时监听 `storage` 事件以支持跨 tab 同步

- 工具函数（`hooks/useTrades.ts` 导出）
  - `readAll(): Record<string, TradeRecord[]>`：直接读取并返回 `fund_trades` 中所有 symbol 的交易数组；JSON 损坏时安全返回 `{}`
  - `getAllTradeDates(): string[]`：遍历所有 symbol 的所有 `TradeRecord.date`（本身为 local `YYYY-MM-DD`），去重后降序排列返回；无交易时返回 `[]`

- 持仓配置（localStorage）
  - 存储 key：`fund_position_${symbol}`（每只基金独立一条）
  - 存储结构（JSON）：`{ fullCapacity: number, initialPosition: number, startDate: string | null, initialPrice: number | null }`
  - `fullCapacity > 0` 表示该基金已配置持仓，否则不参与持仓计算
  - 当前份额计算：`currentShares = initialPosition + Σ buyShares − Σ sellShares`（基于 `fund_trades` 中该 symbol 的全部交易）

- 持仓工具函数（`utils/positionHelper.ts` 导出）
  - `PositionEntry { symbol, name, currentShares, marketValue, ratio, color }`
  - `POSITION_COLORS: string[]`：32 色调色板，采用黄金角（≈137.5°）色相跳跃 + 两档亮度（48%/62%）交替，确保相邻颜色视觉差异最大；超出 32 只基金时循环复用
  - `computePositions(portfolio, marketData): { entries: PositionEntry[], totalMarketValue: number }`：
    - 仅纳入 `fullCapacity > 0` 且 `currentShares > 0` 的基金
    - 市场价值 = `currentShares × currentPrice`；若 `currentPrice = 0` 则回退到 `previousPrice`
    - 无 marketData 或价格仍为 0 时排除该基金
    - 结果按市场价值降序排列，`ratio` 为占总市场价值比例（0~1），`color` 按索引从 `POSITION_COLORS` 分配

服务层（`services/fundService.ts`）行为约定
- `fetchFundData(symbol: string): Promise<ValuationData | null>`
  - 内部对 symbol 执行 `padStart(6,'0')` 后构建请求（JSONP 专用）。
  - 在异常/超时情况下返回 null（当前策略）。
  - JSONP 超时：8000ms
- `fetchFundHistory(symbol: string): Promise<HistoricalPoint[]>`
  - 返回抓取到的完整历史（按时间升序），组件决定截断数目。
  - 若失败返回 []
  - **优先读取内存缓存（`cacheService`）**；缓存命中时直接返回，不发起网络请求；未命中时走网络并将结果写入缓存。
- `forceFetchFundHistory(symbol: string): Promise<HistoricalPoint[]>`
  - **强制绕过缓存**，始终从网络重新获取历史净值。
  - 用于定时刷新（每 20 分钟）和手动全量刷新，获取完成后自动写入 `cacheService`。
- 请求速率控制：内部有 `RequestQueue` 做排队与随机小延迟（150–350ms）以减缓并发请求

---

## 性能优化：内存数据缓存层

### 目标

- 所有界面操作对应的数据显示做到**秒开**，除首次打开网页（无任何缓存）外不需要任何网络数据获取。
- 数据刷新在后台进行，不阻塞界面操作；刷新完成后主界面上的对应基金信息能够立即更新。
- 确保单个基金内的数据不一致情况不会出现——每个基金的数据刷新完成后，主界面立即原子更新该基金的信息。
- 通过并发池方式提高数据刷新效率，同时不过度占用系统资源。

### 缓存数据范围

| 数据类型 | 缓存 | 说明 |
|---|---|---|
| 实时估值（`ValuationData`）| ✅ | 每只基金一条，存入内存 Map 并同步写 localStorage `fund_market_data` |
| 历史净值（`HistoricalPoint[]`）| ✅ | 每只基金一条，存入内存 Map 并同步写 localStorage `fund_history_{symbol}` |
| 市场热点（新闻列表）| ✅ | 仅内存缓存，不持久化到 localStorage |
| 交易记录（`fund_trades`）| ❌ | 更新频率低，沿用现有 localStorage 直读方案 |
| 基金基本信息（`fund_portfolio`）| ❌ | 更新频率低，沿用现有 localStorage 直读方案 |
| 历史净值持久化导入/导出 | ❌ | `fund_history_*` 不纳入备份导出/导入，仅用于本地加速 |

### 缓存服务（`services/cacheService.ts`）

- 维护三个内存 `Map`：`valuationMap`、`historyMap`、`newsCache`。
- **模块加载时自动预读 localStorage**：将 `fund_market_data` 中所有估值条目和所有 `fund_history_{symbol}` 历史净值加载到内存 Map，使页面刷新后无需等待网络即可渲染已有数据。
- 对外暴露同步接口：
  - `getValuation(symbol) / setValuation(symbol, data)`
  - `getHistory(symbol) / setHistory(symbol, points)`
  - `getAllValuations() / getAllHistories()`
  - `getNews() / setNews(items)`
- `setValuation` 写入时同步更新 `localStorage['fund_market_data']`（整体覆盖写入，保持与原 App.tsx 的 key 兼容）。
- `setHistory` 写入时同步更新 `localStorage['fund_history_{symbol}']`（每基金独立 key）。
- `setNews` 不写 localStorage（市场热点为纯内存缓存，跨页面刷新不需要保留）。

### 数据获取与缓存集成

- **`fetchFundHistory`**：函数内优先调用 `cacheService.getHistory()`，命中直接返回；未命中才走网络，成功后写入 `cacheService.setHistory()`。
- **`forceFetchFundHistory`**：始终走网络，成功后写入 `cacheService.setHistory()`，用于定时/手动强制刷新。
- **`computeOverallProfit`**：内部调用 `fetchFundHistory`（已走缓存优先路径）；补充当天实时数据点时优先读 `cacheService.getValuation()`，缓存未命中才调用 `fetchFundData()`，避免为每个基金发起额外网络请求。

### 刷新机制

#### 定时刷新（自动）

| 数据类型 | 刷新间隔 | 刷新函数 |
|---|---|---|
| 实时估值 | **每 3 分钟** | `runBatchUpdate(portfolio)` |
| 历史净值 | **每 20 分钟** | `runBatchHistoryUpdate(portfolio)`（调用 `forceFetchFundHistory`）|
| 市场指数 | **每 2 分钟** | `refreshMarketIndicesAsync()` |
| 市场热点 | **每 3 分钟** | `MarketNewsTicker` 内部自刷新 |

- 上述定时器各自独立（对应四个独立的 `setInterval`），互不干扰，组件卸载时 `clearInterval` 清理。

#### 手动刷新

- 点击右上角刷新按钮触发 `refreshAll()`。
- `refreshAll()` 并发执行：实时估值刷新 + 市场指数刷新 + **历史净值强制刷新**（三者并行 `Promise.allSettled`）。
- 刷新期间 `isRefreshing = true`，顶部加载指示器（`animate-spin`）可见；刷新完成后恢复。

#### 并发控制

- `runBatchUpdate` 与 `runBatchHistoryUpdate` 均使用**大小为 3 的并发池**（`Array(Math.min(3, targets.length)).fill(null).map(async () => {...})`）。
- 并发池确保同时最多 3 个基金在刷新，与 `fundService` 内部的 `RequestQueue`（串行限速 150–350ms）协调，避免过度并发。

### 界面加载行为（冷启动 → 热缓存）

1. **冷启动（首次访问，无任何缓存）**：`cacheService` 预读 localStorage 均为空；`marketData` state 初始化为空对象；`FundDetailsModal` 打开时触发网络请求，正常展示 loading 动画。
2. **热缓存（刷新页面 / 再次访问）**：`cacheService` 模块加载时从 localStorage 恢复估值和历史净值到内存 Map；`marketData` 初始化直接读 `cacheService.getAllValuations()`，**页面无白屏、无 loading**，所有基金卡片立即展示上次数据；后台定时任务按上述间隔自动刷新最新数据。
3. **`FundDetailsModal` 打开**：先查 `cacheService.getHistory(symbol)`，命中则同步秒开（`loading` 标志立即置 false）；未命中才走网络请求路径并在完成后写入缓存。
4. **`OverallProfitModal` 打开**：`computeOverallProfit` 内部的 `fetchFundHistory` 全部走缓存，历史净值已在内存中；实时估值补充点也从 `cacheService.getValuation()` 读取；整体计算**仅调用一次**，结果直接用于图表和表格，不再发起第二次重复计算。
5. **`MarketNewsTicker` 渲染**：`news` state 初始值从 `cacheService.getNews()` 读取，立即展示上次热点；后台刷新完成后更新 state 并写入缓存。

### 实时估值写入路径

- `updateSingleFund(symbol)` 获取数据后：
  1. 调用 `cacheService.setValuation(symbol, data)`（同步写内存 + localStorage）。
  2. 调用 `setMarketData(prev => ({...prev, [symbol]: data}))`（原子更新 React state）。
- `App.tsx` 中**不再有** `useEffect(() => localStorage.setItem('fund_market_data', ...), [marketData])` 的重复同步，改由 `cacheService` 统一管理。

### 实现文件清单

| 文件 | 角色 |
|---|---|
| `services/cacheService.ts` | 集中式内存缓存层（新增）|
| `services/fundService.ts` | `fetchFundHistory` 走缓存优先；新增 `forceFetchFundHistory`；`computeOverallProfit` 读缓存估值 |
| `App.tsx` | 初始化读 `getAllValuations()`；`updateSingleFund` 写缓存；新增 `runBatchHistoryUpdate`；20 分钟历史净值定时器；备份定时器（每分钟检查）；备份提示 state（idle/pending/done） |
| `components/FundDetailsModal.tsx` | 打开时先查 `cacheService.getHistory()`，命中秒开 |
| `components/OverallProfitModal.tsx` | 合并为单次 `computeOverallProfit` 调用；图表 timeline 按 `chartFromDate` 客户端裁剪（修复 x 轴日期） |
| `components/MarketNewsTicker.tsx` | 初始 state 从 `cacheService.getNews()` 读取；刷新后写入缓存 |
| `utils/backupService.ts` | `buildBackupData`、`downloadBackupFile`、`applyBackupData`、`readBackupConfig`、`writeBackupConfig`（新增）|
| `components/BackupSettingsModal.tsx` | 自动备份时间配置弹窗（新增）|

---

## 数据备份与恢复（导出 / 导入）

### 目标

允许用户将所有关键本地数据导出到 JSON 文件，并能从该文件将数据完整恢复，实现跨设备迁移或定期备份。

### 导出内容（JSON 数据结构）

导出文件为单个 JSON，包含以下所有字段（括号内标注为 optional 的字段在导出时**必须导出**，仅为说明该字段相对于关键字段在功能上是可选的辅助信息；实际导出时应尽量填充以保证兼容性）：

```json
{
  "portfolio": [
    {
      "id": "string",
      "symbol": "string",
      "name": "string (optional — 基金名称，从缓存获取)",
      "market": "MarketType",
      "currentPrice": "number (optional)",
      "previousPrice": "number (optional)",
      "netWorthDate": "string (optional — 最近确认净值日期)",
      "lastUpdated": "string (optional — 最新估值时间)"
    }
  ],
  "indices": [
    {
      "symbol": "string",
      "name": "string (optional)",
      "price": "number (optional — 最近行情)",
      "changePercent": "number (optional)",
      "time": "string (optional — 最近行情时间)"
    }
  ],
  "globalIndices": [
    {
      "symbol": "string",
      "name": "string (optional)",
      "price": "number (optional)",
      "changePercent": "number (optional)",
      "time": "string (optional)"
    }
  ],
  "trades": {
    "symbol": [
      {
        "id": "string",
        "date": "YYYY-MM-DD",
        "type": "buy | sell",
        "shares": "number",
        "price": "number (optional)",
        "fee": "number"
      }
    ]
  },
  "positions": {
    "symbol": {
      "fullCapacity": "number",
      "initialPosition": "number",
      "startDate": "string | null",
      "initialPrice": "number | null (optional)"
    }
  },
  "config": {
    "autoExportTime": "HH:mm (string — 每日自动导出时间，默认 '16:00')"
  }
}
```

- `fund_history_*`（历史净值缓存）**不纳入**备份导出，仅用于本地加速，恢复后由后台重新拉取。
- optional 字段由实现层（`utils/backupService.ts` 的 `buildBackupData`）在构建时从 `cacheService` 和当前 state 填充，以确保导入后页面能秒开显示数据。

### 导出行为

#### 手动导出

- 触发方式：顶部菜单栏点击 **"导出备份"**。
- 文件名格式：`fund_backup_<yyyy-MM-dd>_<HH-mm-ss>.json`（本地时间戳），例如 `fund_backup_2026-02-27_13-05-04.json`。
- 实现：调用 `buildBackupData()` 构建数据对象，再由 `downloadBackupFile(data, 'manual')` 触发浏览器下载。

#### 自动导出

- 触发方式：系统在每日本地时间达到配置的 `autoExportTime`（默认 `16:00`）时自动触发；由 `App.tsx` 中的定时器（每分钟检查一次）驱动。
- 文件名格式：`fund_backup_auto_<yyyy-MM-dd>.json`（本地当天日期），例如 `fund_backup_auto_2026-02-27.json`。
- 实现：调用同样的 `buildBackupData()` + `downloadBackupFile(data, 'auto')`，**无需用户干预，全自动进行**。
- **UI 提示（主界面顶部固定区域）**：
  - 自动导出触发前 **5 秒**：显示"正在自动备份数据…"（浅绿色底色）。
  - 导出完成后：切换为"备份成功"，显示 **3 秒**后自动消失。
  - 该提示区域在主界面顶部**预先保留高度**（`min-height` 固定），不因提示出现或消失而影响其他内容的布局位置。

### 导入行为

- 触发方式：顶部菜单栏点击 **"导入备份"**，弹出文件选择框（accept=`.json`）。
- **导入前必须弹出确认框**，明确告知用户"导入将完全覆盖现有的基金列表、大盘/全球市场指数配置、持仓配置及交易记录"，用户确认后方可执行。
- 导入动作（`applyBackupData`）执行以下步骤：
  1. 解析 JSON 文件，进行数据归一化（处理旧格式兼容问题，见兼容性章节）。
  2. **完全清除**原有数据：`fund_portfolio`、`fund_trades`、所有 `fund_position_*` key。
  3. 写入新 portfolio（`localStorage['fund_portfolio']`）、新 trades（`localStorage['fund_trades']`）、新 positions（`localStorage['fund_position_*']`）、新 indices 配置（`localStorage['fund_indices']`、`localStorage['fund_global_indices']`）、新 `autoExportTime`（`localStorage['fund_backup_config']`）。
  4. **evict 旧 symbol 的估值缓存**（调用 `cacheService.evictValuations`），并将导入数据中的 optional 估值作为 fallback 写入缓存（仅当缓存中该 symbol 尚无数据时，调用 `cacheService.setValuationIfAbsent`），确保页面能即时展示已有数据。
  5. **不清除** `fund_history_*` 缓存 key（历史净值保留，用于加速下次展示）。
  6. 返回新的 `portfolio`、`indicesConfig`、`globalIndicesConfig`，供 `App.tsx` 更新 state 并触发 UI 重新渲染。

### 备份配置（BackupSettingsModal）

- 入口：顶部菜单栏点击 **"备份设置"** 打开弹窗。
- 功能：
  - 时间选择器（`<input type="time">`），初始值为当前已保存的 `autoExportTime`（默认 `16:00`）。
  - 下方实时显示"距下一次自动备份还有 X 小时 Y 分钟"（倒计时，基于当前本地时间和配置时间计算）。
  - **修改时间后，倒计时文字随即更新**，反映新时间下的剩余时长。
  - 保存（`保存` 按钮）：调用 `writeBackupConfig({ autoExportTime: newTime })`，持久化到 `localStorage['fund_backup_config']`，并通知 `App.tsx` 更新定时器。
  - 取消/关闭：不保存，关闭弹窗。
- 配置持久化 key：`fund_backup_config`；JSON 格式：`{ "autoExportTime": "HH:mm" }`。
- `readBackupConfig()` 在读取失败或格式不合法时返回默认值 `{ autoExportTime: '16:00' }`。

### 兼容性（旧格式导入）

导入功能**必须兼容原有（旧版）导出的数据文件**，不得出现无法导入或关键数据缺失的情况：

| 旧格式情形 | 处理策略 |
|---|---|
| `indices` / `globalIndices` 为纯字符串数组（非对象数组）| 将每个字符串视为 `symbol`，其余字段置空，正常导入 |
| `indices` 数组中混合字符串和对象 | 逐项判断：字符串直接取为 `symbol`，对象正常解构 |
| `portfolio` 中无 optional 字段（name、currentPrice 等）| 仅用 `id`、`symbol`、`market` 核心字段，optional 字段置空 |
| 缺少 `config` 字段 | 取 `localStorage['fund_backup_config']` 中已存储的值；若也无则用默认值 `16:00` |
| `positions` 中缺少 `initialPrice` | 归一化为 `null` |
| `trades` 中缺少 `price` | 归一化为 `0` |
| 缺少 `trades` 或 `positions` 字段 | 视为空对象 `{}` |
| 缺少 `globalIndices` 字段 | 视为空数组 `[]` |

### 工具函数（`utils/backupService.ts`）

| 函数 | 说明 |
|---|---|
| `buildBackupData(portfolio, indicesState, globalIndicesState)` | 构建完整备份数据对象（从 localStorage 读取 trades/positions，从 cacheService 读取估值填充 optional 字段） |
| `downloadBackupFile(data, mode: 'manual' \| 'auto')` | 生成 Blob，触发浏览器下载；`manual` 模式文件名含本地时间戳，`auto` 模式含 `_auto_` 和日期 |
| `applyBackupData(raw)` | 解析、归一化、写入 localStorage，更新缓存，返回新 state |
| `readBackupConfig()` | 读取并验证 `fund_backup_config`，失败时返回默认值 |
| `writeBackupConfig(cfg)` | 将配置序列化后写入 `fund_backup_config` |

### 数据最终一致性

- 所有 optional 字段（估值、价格等）在页面使用过程中会被实时/历史净值网络数据覆盖更新，写入 `cacheService`；**下次导出时导出的是最新、最准确的数据**。
- 导入后的 optional fallback 数据为临时展示用途，后台刷新完成后会自动替换，无需用户干预。

---

- 全体风格：Tailwind utility-first。保持现有组件样式约定（rounded-2xl、shadow-sm、text-xs 等）。

- TickerCard（卡片）
  - 显示要素：基金/指数名称（或占位）、symbol、实时估值（4 位小数）、涨跌幅、上次更新时间、风险 badge、删除按钮
  - 风险 badge：基于 `computeRatingFromHistory` 输出（rating, color, reasons），hover/focus 显示 tooltip（aria 支持）
  - 点击卡片打开 `FundDetailsModal`（非 selection 模式）；在 selection 模式下点击触发选择

- FundDetailsModal
  - 加载并展示最近 90 个历史点（若可用），svg 曲线 + area + 可切换的 SMA（5/10/20）
  - 默认可见：5/10/20（如上确认）
  - Hover 在图上时显示每条可见均线的数值

- TradeManager（交易管理）
  - 弹窗包含：表单（date, type, shares, fee, price(只读按日期), computed total(只读)）、交易记录列表（分页）、导入/导出按钮
  - 分页：pageSize = 10，显示“第 X / Y 页”与上一页/下一页按钮
  - 价格回溯（getPriceForDate）：
    1. 若 `fetchFundHistory` 返回包含与 `date`（local YYYY-MM-DD）完全匹配的历史点，使用该点的 value
    2. 否则将 `date` 的本地时间设置为 23:59:59（local），在 history 中查找 <= 该 timestamp 的最近点
    3. 若仍无则使用 history 的最早点
    4. 若 history 为空则回退到传入的 `currentPrice`
  - 导入：覆盖策略；导入前弹出确认（提示备份/导出现有数据），确认后覆盖并触发 UI 刷新事件
  - 导出：导出 JSON / CSV（含动态计算的 total）

- TransactionsModal（基金交易明细）
  - 入口：主界面"盈利"按钮旁的"交易"按钮（同款样式：`px-4 py-1.5 rounded-full bg-blue-600 shadow-md text-[11px] font-bold text-white`）
  - 弹窗：`createPortal` + 半透明遮罩，`z-[130]`，`max-w-2xl`，`minHeight: 520px`（确保日历下拉不被遮挡），样式与 `OverallProfitModal` 一致
  - 日期选择器（顶部）：
    - 使用 `react-day-picker@^8.x`（内联嵌入 Modal，不额外 portal）
    - 默认值：`getAllTradeDates()[0]`（最近有交易记录的 local 日期）；无任何交易时按钮 disabled
    - 有交易的日期在日历上**加粗+蓝色下划线**标注（`modifiers={{ hasTrack }}`）
    - 仅允许选择有交易记录的日期（无交易日期 disabled）
    - 选择日期后日历收起，表格内容动态更新
    - 无任何交易时，日历区域不显示，表格区域显示"无任何交易存在"
  - 表格（五列）：
    - 第一列"基金名称"：`名称（代码）` 格式，单行截断（`truncate`）+ `title` tooltip 显示完整内容；名称优先取 `marketData[symbol].name`，兜底用 `portfolio` 中的 `Ticker.name`
    - 第二列"类型"：买入（红色）/ 卖出（绿色）
    - 第三列"份额"：右对齐，千分位两位小数
    - 第四列"手续费"：右对齐，千分位两位小数
    - 第五列"交易总额"：右对齐，千分位两位小数；计算口径与 `TradeManager` 一致（买入 = `price × shares + fee`，卖出 = `price × shares − fee`）
    - 0 值全部显示黑色 `"-"`
    - 结构：外层固定 thead + `max-height: 400px` 滚动 tbody + 外层固定 tfoot 统计行（三段式，与 `OverallProfitModal` 相同）
    - 选定日期无交易时 tbody 显示"该日期无任何交易"
  - 统计行（固定在底部）：
    - 第一列：`总计：n 条记录`
    - 第二、三列：空
    - 第四列：所有交易手续费总和
    - 第五列：净额 = 卖出总额之和 − 买入总额之和；净额 > 0 → `{千分位}（卖出）`；净额 < 0 → `{|净额|千分位}（买入）`；净额 = 0 → 黑色 `"-"`
  - 列宽（table-fixed）：基金名称 30%、类型 10%、份额 13%、手续费 15%、交易总额 32%

- PositionsModal（基金持仓）
  - 入口：主界面"持仓"按钮，位于"盈利"按钮左侧（同款样式：`px-4 py-1.5 rounded-full bg-blue-600 shadow-md text-[11px] font-bold text-white`）
  - 弹窗：`createPortal` + 半透明遮罩（`bg-black/40`），`z-[130]`，`max-w-[56rem]`，`maxHeight: 90vh`，样式与 `OverallProfitModal` 一致
  - 数据来源：调用 `computePositions(portfolio, marketData)`（`utils/positionHelper.ts`），仅纳入 `fullCapacity > 0 && currentShares > 0` 的基金
  - 弹窗布局（从上到下，内容区不产生外层滚动条）：
    1. 顶部 header（固定）：标题"基金持仓" + 关闭按钮
    2. 汇总行（flex-shrink-0）：`n只基金 · 市场总价值：x,xxx.xx元`
    3. 饼图区（flex-shrink-0）：饼图 + 图例（图例独立滚动，高度与饼图等高）
    4. 持仓表格（flex-1 min-h-0）：单张表，thead/tfoot `sticky`，tbody 独立滚动
  - 饼图规格：
    - 纯 SVG 实现（无外部图表库），直径 220px，从 12 点钟方向起始，顺时针绘制
    - 每个扇区颜色来自 `POSITION_COLORS[index]`，`stroke="white" strokeWidth=2` 分隔
    - Hover 扇区：非 hover 扇区 `opacity=0.55`（CSS transition 0.15s），hover 扇区保持 `opacity=1`；SVG 中心区域显示该基金占比（如 `38.50%`）和市场价值（如 `1,234.56元`）
    - 点击扇区：触发 `onSelectFund(symbol)`，关闭持仓弹窗并打开对应 `FundDetailsModal`（与手动点击 TickerCard 路径一致）
    - 每个扇区内含 `<title>` 标签供浏览器默认 tooltip 使用（格式：`基金名称（代码）\n市场价值：x,xxx.xx元\n占比：xx.xx%`）
    - 无持仓数据时，饼图区域显示居中灰色圆形占位"无持仓数据"
  - 图例规格：
    - 位于饼图右侧，`max-height=220px`，`overflow-y: auto`
    - 每行：`● 基金名称（基金代码）`，单行截断（`truncate`）+ `title` 完整内容
    - 点击某行：触发 `onSelectFund(symbol)`
    - Hover 图例行：联动饼图（对应扇区高亮，其余半透明），`opacity` 与扇区 hover 逻辑相同
  - 持仓表格规格：
    - 单张表（thead + tbody + tfoot 同属一个 `<table>`），外层 `overflow-y: auto` 容器
    - `thead` 加 `sticky top-0 z-10 bg-gray-50`，`tfoot` 加 `sticky bottom-0 z-10 bg-gray-50`
    - 四列（列宽：基金名称 42%、持仓份额 18%、市场价值 24%、占比 16%）
    - 表头对齐：与所在列内容对齐一致（基金名称列左对齐，其余三列右对齐）
    - 第一列（基金名称）：`基金名称（基金代码）` 格式，单行截断 + `title`，左对齐；色块（8×8px）+ 文字；点击触发 `onSelectFund`
    - 第二列（持仓份额）：右对齐，千分位两位小数
    - 第三列（市场价值）：右对齐，千分位两位小数
    - 第四列（占比）：右对齐，百分比两位小数（如 `38.50%`）
    - 记录按市场价值降序排列
    - tbody 最多同屏显示约 10 行（通过 `flex-1 min-h-0 overflow-y-auto` 自适应剩余高度）
    - tfoot 统计行：第一列"总计：n条记录"、第二列空、第三列总市场价值（千分位两位小数）、第四列"100%"
  - 空状态：无任何持仓时，饼图区、图例区各显示"无持仓数据"文字，表格区域不渲染，底部另有居中空状态提示（图标 + "无持仓数据" + "请先在基金详情页配置仓位信息"）
  - onSelectFund 实现：`setShowPositions(false)` + `setViewingSymbol(sym)`，复用 `App.tsx` 已有逻辑，与手动点击 TickerCard 路径完全一致

- 交易记录行高度规范（界面上合理展示多条记录）
  - 目标：每条记录视觉上尽量控制在两行文字内。实现建议：
    - 使用较小字体（text-xs / text-[11px]）、减小垂直内边距（px-2 py-1）
    - 对文本使用单行截断（`truncate`）或多行截断（可选：`-webkit-line-clamp:2` 结合 `display:-webkit-box`）
    - 确保 flex 子项使用 `min-w-0` 以允许截断生效
  - PRD 规范（可作为验收项）：记录行在常用桌面分辨率下不超过两行；超出使用省略号显示

- BackupSettingsModal（备份设置）
  - 入口：顶部右侧菜单（`···` 按钮展开后）点击 **"备份设置"** 打开；同菜单内保留 **"导出备份"** 和 **"导入备份"** 两个独立入口
  - 弹窗：`createPortal` + 半透明遮罩（`bg-black/40`），`z-[130]`，`max-w-sm`，居中，样式与其他 Modal 一致（`rounded-2xl shadow-2xl`）
  - 内容区：
    - 标题"备份设置" + 右上角关闭按钮（`×`）
    - 时间选择：标签"每日自动备份时间" + `<input type="time">` 输入框，初始值为已保存的 `autoExportTime`（默认 `16:00`）
    - 倒计时提示：输入框下方一行文字"距下一次自动备份还有 X 小时 Y 分钟"；**当用户修改时间输入后，倒计时文字随即实时更新**，无需保存即可预览
    - 底部按钮行：左侧"取消"（灰色），右侧"保存"（绿色/`bg-emerald-500`）
  - 保存行为：调用 `writeBackupConfig({ autoExportTime })`，关闭弹窗，通知 `App.tsx` 更新定时器基准时间
  - 取消/关闭/Escape/遮罩点击：不保存，直接关闭

- 主界面备份提示区域（自动导出通知）
  - 位置：主界面 `<header>` 内部，紧跟导航行之下，**独立占用固定高度**（`min-height: 28px` 或等效固定行高），即使无提示内容时也保留占位，避免页面内容跳动
  - 状态一（无提示）：区域透明/空白，高度占位不变
  - 状态二（备份中）：触发自动导出前 5 秒出现，显示"⏳ 正在自动备份数据…"，浅绿色背景（`bg-green-50 text-green-700`），居中，圆角，过渡动画
  - 状态三（备份完成）：导出完成后切换为"✅ 备份成功"，同底色，保持 3 秒后自动清除回状态一
  - 实现要点：`backupStatus: 'idle' | 'pending' | 'done'` state；`idle` 时 `<div>` 保留高度但不渲染文字；`pending`/`done` 时渲染对应文字与样式

### 风险评级与均线（实现细节）
- 使用 `utils/movingAverage.ts` 的 `computeSMA` / `computeMultipleSMAs` 计算 SMA5/10/20
- 使用 `utils/riskTooltip.ts` 的 `computeRiskRating` 进行评级，输入为 price、maValues、index 与 prevIndex，输出包含 rating、color、action、reasons
- TOLERANCE = 0.995（maConfig）用于判断 price 回踩是否破位
- 无历史时 `computeRatingFromHistory` 会退化地使用 `previousPrice` 与 `currentPrice` 来尝试计算（已实现并被接受）

错误处理、边界条件与安全
- 服务层在异常情况下返回 null 或 []（不抛出），以便 UI 选择友好回退策略
- jsonp 全局回调 `jsonpgz` 与注册表 `fundRegistry`：实现时应注意回调名安全与清理逻辑
- localStorage 操作包裹 try/catch，写入失败时应用友好提示（浏览器存储满或私有模式）

验收标准（可自动化测试/手工验收）
- 服务函数：`fetchFundData` 在正常/异常/超时场景下行为符合契约（单元测试）
- 历史数据：`fetchFundHistory` 返回数组并且组件正确截断（TickerCard/FundDetailsModal 90，TradeManager 365）
- **性能缓存验收**：
  - `cacheService` 模块加载时从 localStorage 的 `fund_market_data` 与 `fund_history_{symbol}` 预读数据到内存 Map（单元测试覆盖）
  - `setValuation` / `setHistory` 写入内存后同步更新对应 localStorage key（单元测试覆盖）
  - `getNews` 默认返回空数组；`setNews` / `getNews` 正确读写；`setNews` 不写 localStorage（单元测试覆盖）
  - 页面刷新后（热缓存场景），`marketData` 初始 state 来自 `cacheService.getAllValuations()`，无白屏无 loading（手工验收）
  - `FundDetailsModal` 打开时，历史净值缓存命中则秒开（无 loading 动画）；未命中时正常显示 loading（手工验收）
  - `OverallProfitModal` 打开时，历史净值全部来自缓存，弹窗加载速度明显快于改造前（手工验收）
  - `MarketNewsTicker` 渲染时立即展示上次缓存热点，不显示"正在接入..."（热缓存场景，手工验收）
  - 手动刷新（刷新按钮）正确触发实时估值 + 历史净值 + 市场指数三类数据的并行更新（手工验收）
  - 定时刷新间隔符合规范：实时估值 3 分钟、历史净值 20 分钟、市场指数 2 分钟（代码审查）
- 交易管理：
  - 添加/编辑/删除 功能在 UI 上生效并持久化到 `fund_trades`
  - 导出 JSON/CSV 包含正确 total 值（数值精度检验：price 4 位，total 2 位）
  - 导入会在用户确认后覆盖数据并触发 UI 刷新
  - 分页逻辑正确（上一页/下一页、页数显示正确）
- 数据备份与恢复验收：
  - **手动导出**：点击"导出备份"生成文件，文件名形式为 `fund_backup_yyyy-MM-dd_HH-mm-ss.json`（本地时间戳）；文件内容包含 portfolio、indices、globalIndices、trades、positions、config 所有字段（含 optional 字段）
  - **自动导出**：系统在配置时间触发，生成文件名形式为 `fund_backup_auto_yyyy-MM-dd.json`；无需用户操作，全自动
  - **备份提示 UI**：自动导出前 5 秒主界面顶部出现"正在自动备份数据…"（浅绿色底色），完成后切换为"备份成功"并在 3 秒后消失；提示区域高度预先保留，不引起其他内容布局偏移
  - **导入确认**：点击"导入备份"后必须弹出确认框，提示数据覆盖风险；取消则不执行导入
  - **导入覆盖**：确认后完全覆盖 portfolio、trades、positions、indices 配置；`fund_history_*` 不受影响
  - **兼容性**：旧版导出文件（indices 为字符串数组、缺少 config/globalIndices 等字段）可正常导入，关键数据（portfolio、trades、positions）不丢失（单元测试覆盖所有兼容场景）
  - **Fallback 数据**：导入后 optional 字段（估值、价格）作为初始展示 fallback，页面能秒开；后台刷新完成后自动更新为最新数据
  - **备份配置弹窗**：`BackupSettingsModal` 能正确读取/保存 autoExportTime；保存后倒计时文字更新；修改时间输入后倒计时随即更新（单元测试覆盖）
  - **倒计时准确性**：`BackupSettingsModal` 中显示的"距下一次自动备份"倒计时正确反映当前本地时间与配置时间的差值
- 交易明细窗口（TransactionsModal）：
  - 无交易时：日期按钮 disabled，表格区域显示"无任何交易存在"
  - 默认显示最近有交易记录的 local 日期（`getAllTradeDates()[0]`）
  - 日历仅允许选择有交易记录的日期；有交易日期加粗+蓝色下划线标注
  - 五列表头文字正确（基金名称 / 类型 / 份额 / 手续费 / 交易总额）
  - 基金名称优先取 `marketData.name`，兜底 `portfolio` 的 `Ticker.name`
  - 统计行：条数正确、手续费合计正确、净额（卖出/买入）正确；净额 = 0 显示黑色 `"-"`
  - 切换日期后表格内容正确更新
  - 0 值全部显示黑色 `"-"`；数值千分位两位小数
- 持仓弹窗（PositionsModal）：
  - 无持仓配置（fullCapacity = 0）或持仓净份额为 0 的基金不纳入计算
  - 无满足条件的基金时，饼图区和图例区各显示"无持仓数据"，底部显示空状态提示，不渲染表格
  - 汇总行：基金数量正确（n只基金），总市场价值千分位两位小数
  - 市场价值优先使用 `currentPrice`，`currentPrice=0` 时回退到 `previousPrice`，仍为 0 时排除该基金
  - 当前份额 = `initialPosition + Σbuy - Σsell`（含所有历史交易记录）
  - 饼图：扇区数量 = 持仓基金数，各扇区颜色与图例一致；hover 联动（扇区高亮、中心显示占比和市场价值）；点击扇区跳转到对应 `FundDetailsModal`
  - 图例：点击触发 `onSelectFund`；hover 联动饼图扇区高亮
  - 表格：记录按市场价值降序；份额保留两位小数；统计行"总计：n条记录"、总市场价值、"100%"
  - 表头对齐与内容对齐一致（名称列左对齐，数值列右对齐）；thead/tfoot sticky，tbody 独立滚动
  - 点击表格基金名称列触发 `onSelectFund`，关闭持仓弹窗并打开 `FundDetailsModal`
  - 调色板：32 色，超出 32 只基金时循环复用
- 风险评级：在给定历史/当前价样例中输出预期 rating 与 reasons（单元测试覆盖）
- UI 视觉：交易记录在常见桌面宽度下保持不超过两行显示（或使用多行截断展示两行）

测试计划（开发者可直接运行）
- 单元测试（High）
  - `tests/services/fundService.test.ts`：fetchFundData 的正常/边界/超时/错误用例；fetchFundHistory 返回结构测试
  - `tests/services/cacheService.test.ts`：预加载 localStorage → 内存 Map；读写接口正确性；写入时同步更新 localStorage key；news 不写 localStorage（11 用例）
  - `tests/utils/movingAverage.test.ts` 与 `tests/utils/riskTooltip.test.ts`：均线算法与交叉检测
  - `tests/hooks/useTrades.test.ts`：localStorage 读写、导入覆盖、导出格式、CustomEvent 与 storage 同步
  - `tests/hooks/getAllTradeDates.test.ts`：`getAllTradeDates` 去重、降序、跨 symbol 合并；`readAll` 正常/损坏 JSON 容错
  - `tests/utils/positionHelper.test.ts`：`computePositions` 的过滤逻辑（fullCapacity=0、净份额=0、无 marketData）、市场价值计算（currentPrice 优先/previousPrice 回退）、份额累加（含买卖交易）、排序（降序）、ratio 总和为 1、颜色分配与循环复用；`POSITION_COLORS` 数量（32）与格式（hsl 字符串）
  - `tests/utils/backupService.test.ts`：`buildBackupData` 数据结构完整性（含 optional 字段从缓存填充）；`downloadBackupFile` 文件名格式（手动含时间戳、自动含 `_auto_`）、Blob 创建；`applyBackupData` 完全覆盖、evict 旧缓存、setValuationIfAbsent fallback；兼容性场景（旧格式 string[] indices、缺少 config/globalIndices、缺少 price/initialPrice 等）；`readBackupConfig` / `writeBackupConfig` 读写与默认值容错
- 组件/集成测试（Medium）
  - `tests/components/AddTickerModal.test.tsx`、`TickerCard.test.tsx`、`ConfirmDialog.test.tsx`、`TradeManager.test.tsx`：交互路径、表单校验、导入导出、分页
  - `tests/components/TransactionsModal.test.tsx`：无交易状态、默认日期、五列表头、基金名称来源、买入/卖出标签、统计行（条数/净额/买卖标签/零值）、日期切换、零值显示、关闭按钮
  - `tests/components/PositionsModal.test.tsx`：空状态（无持仓配置、净份额为 0）、汇总行（基金数/总市值）、表格行数与排序、统计行（条数/总价值/"100%"）、交易记录影响份额、SVG 扇区数量、关闭按钮（按钮 + 遮罩）、`onSelectFund` 回调（表格 + 图例点击）
  - `tests/components/BackupSettingsModal.test.tsx`：渲染初始时间值、倒计时文字显示、修改时间后倒计时更新、保存按钮调用 writeBackupConfig 并回调 onSave、取消/关闭按钮行为、Escape 键关闭、点击遮罩关闭、输入错误后清空错误提示
- 手工/视觉回归
  - 检查 TradeManager 中记录展示在常见窗口尺寸下不超出两行

CI 与发布
- 在 GitHub Actions 中的工作流应包含：checkout、setup-node、`npm ci`、`npm test`（失败阻止后续步骤）、`npm run build`、deploy（仅当测试/构建成功）
- 建议部署到 `gh-pages`（与 repository environment protection 兼容），或配置合适的 deploy 权限

实现注意与开发指引
- 尽量保持服务层（fundService）无副作用，返回 null/[] 代替抛错，便于测试
- 组件对历史点数量应做防御性编程：在计算均线或索引时校验长度并妥善处理 null
- 交易导入前提示：在 `TradeManager` 的导入按钮上弹出 ConfirmDialog 或自定义 modal 提示“导入将覆盖当前交易，建议先导出备份”，确认后执行 `setAll(parsed.trades)`
- 交易记录双行显示：实现时使用 Tailwind 类组合 + 一段小 CSS（若需要多行截断则加入 `.line-clamp-2` 的样式规则）

开发任务清单（可直接执行）
- [x] 将 PRD 中实现细节与确认结果整合（本文件）
- [x] 实现 `TransactionsModal`（基金交易明细弹窗）及主界面"交易"按钮入口
- [x] 在 `hooks/useTrades.ts` 中导出 `readAll` 与 `getAllTradeDates`
- [x] 安装 `react-day-picker@^8.x` 并在入口引入 CSS
- [x] 新增测试：`tests/hooks/getAllTradeDates.test.ts`（7 用例）
- [x] 新增测试：`tests/components/TransactionsModal.test.tsx`（16 用例）
- [x] 实现 `utils/positionHelper.ts`（`computePositions`、`POSITION_COLORS`）
- [x] 实现 `components/PositionsModal.tsx`（饼图 + 图例 + 表格，含空状态）
- [x] 在 `App.tsx` 集成"持仓"按钮与 `PositionsModal` 渲染
- [x] 在 `index.html` 补充 `.no-scrollbar` 全局 CSS 工具类
- [x] 新增测试：`tests/utils/positionHelper.test.ts`（15 用例）
- [x] 新增测试：`tests/components/PositionsModal.test.tsx`（13 用例）
- [x] 实现内存数据缓存层 `services/cacheService.ts`（估值 / 历史净值 / 市场热点三类 Map，含 localStorage 预加载与持久化）
- [x] 改造 `services/fundService.ts`：`fetchFundHistory` 走缓存优先；新增 `forceFetchFundHistory`；`computeOverallProfit` 读缓存估值代替每次 `fetchFundData` 网络请求
- [x] 改造 `App.tsx`：初始化读 `getAllValuations()`；`updateSingleFund` 写 `cacheService`；新增 `runBatchHistoryUpdate`；独立 20 分钟历史净值定时器；手动刷新并行覆盖三类数据
- [x] 改造 `FundDetailsModal.tsx`：打开时先查 `cacheService.getHistory()`，命中秒开
- [x] 改造 `OverallProfitModal.tsx`：合并为单次 `computeOverallProfit` 调用；新增 `chartFromDate` state 修复图表 x 轴日期错误
- [x] 改造 `MarketNewsTicker.tsx`：初始 state 读 `cacheService.getNews()`；刷新后写入缓存
- [x] 新增测试：`tests/services/cacheService.test.ts`（11 用例，覆盖三类缓存的读写、预加载、持久化行为）
- [x] 实现 `utils/backupService.ts`（`buildBackupData`、`downloadBackupFile`、`applyBackupData`、`readBackupConfig`、`writeBackupConfig`）
- [x] 实现 `components/BackupSettingsModal.tsx`（autoExportTime 时间选择、倒计时显示、保存/取消/关闭）
- [x] 改造 `App.tsx` 导出功能：调用 `buildBackupData` + `downloadBackupFile`（含所有字段、正确文件名格式），替换旧的简易导出逻辑
- [x] 改造 `App.tsx` 导入功能：调用 `applyBackupData`，导入前弹出 `ConfirmDialog` 确认，确认后更新 state 并触发 UI 重渲染
- [x] 改造 `App.tsx` 自动导出定时器：每分钟检查本地时间是否达到 `autoExportTime`，触发时调用 `downloadBackupFile(data, 'auto')`
- [x] 实现主界面顶部备份提示区域（高度预先保留，避免布局偏移）：自动备份前 5 秒显示"正在自动备份数据…"，完成后显示"备份成功"3 秒
- [x] 顶部菜单栏新增"备份设置"入口，点击打开 `BackupSettingsModal`
- [x] 新增测试：`tests/utils/backupService.test.ts`（覆盖 buildBackupData 数据结构、downloadBackupFile 文件名、applyBackupData 覆盖逻辑、兼容性场景、readBackupConfig/writeBackupConfig）
- [x] 新增测试：`tests/components/BackupSettingsModal.test.tsx`（11 用例）
- [x] 交易表单输入模式优化（v1.7）：买入时总额可输、份额只读（2位小数）；卖出时份额可输、总额只读；类型切换自动清零；编辑回填逻辑适配；新增测试5个用例（`tradeManagerIntegration.test.tsx`）
- [ ] 为 `TradeManager` 添加导入前确认弹窗（若需要，我可以立即实现并添加测试）
- [ ] 在 tests/ 中补充 `hooks/useTrades.test.ts`、`TradeManager.test.tsx`、`utils/riskTooltip.test.ts`（优先级按上）
- [ ] 在 CI workflow 中加入 `npm test` 步骤（如需我可以提交 workflow 修改建议）

变更记录
- 2026-02-11 v1.0：初始 PRD
- 2026-02-16 v1.1：整合实现对照、产品确认项（均线默认 5/10/20、导入覆盖、local day-end 回溯等）并生成可执行的开发任务清单
- 2026-03-03 v1.2：新增基金交易明细功能（TransactionsModal）：主界面"交易"按钮、日期选择器（react-day-picker、仅允许有交易日期、日历标注）、五列交易明细表、统计行（条数/手续费合计/净额买卖标签/零值）、日期切换、零值显示、关闭按钮；导出 `readAll` 与 `getAllTradeDates`；新增测试 23 个用例
- 2026-03-03 v1.3：新增基金持仓功能（PositionsModal）：主界面"持仓"按钮（位于"盈利"左侧）、`computePositions` 工具函数、32 色黄金角调色板（`POSITION_COLORS`）、纯 SVG 饼图（含 hover 联动）、持仓表格（单张表 sticky thead/tfoot）、空状态；持仓配置数据模型补充至 PRD；新增测试 28 个用例（positionHelper 15 + PositionsModal 13）
- 2026-03-03 v1.4：新增内存数据缓存层（性能优化）：新建 `cacheService.ts`（三类内存 Map + localStorage 预加载/持久化）；改造 `fetchFundHistory` 走缓存优先、新增 `forceFetchFundHistory` 强制刷新；改造 `computeOverallProfit` 读缓存估值（消除每基金额外网络请求）；改造 `App.tsx`（初始化秒开、独立 20 分钟历史净值定时器、并发池大小 3）；改造 `FundDetailsModal`（打开秒开）、`OverallProfitModal`（单次计算 + x 轴日期修复）、`MarketNewsTicker`（读缓存即时展示）；新增测试 11 个用例（cacheService.test.ts）
- 2026-03-04 v1.5：新增数据备份与恢复功能（导出/导入）：完整 JSON 备份格式规范（含 portfolio、indices、globalIndices、trades、positions、config 所有字段）；手动导出（本地时间戳文件名）与自动导出（`_auto_` 文件名、定时触发）；主界面顶部备份提示 UI（预留高度避免布局偏移、前 5 秒提示 + 完成后 3 秒提示）；导入前确认弹窗；applyBackupData 完全覆盖逻辑 + 缓存 evict + fallback setValuationIfAbsent；BackupSettingsModal（时间配置、实时倒计时、修改即时更新）；兼容性规范（旧格式 string[] indices、缺失字段归一化）；新增测试文件 backupService.test.ts 和 BackupSettingsModal.test.tsx
- 2026-03-04 v1.6：整体盈亏日期默认值优化（日期1默认为日期2前一天）；添加版本号管理机制（version.ts + 主界面标题栏显示）
- 2026-03-04 v1.7：交易添加表单输入模式优化：买入时总额可输入、份额只读（2位小数）；卖出时份额可输入、总额只读；类型切换自动清零；编辑回填逻辑适配；新增测试 5 个用例（`tradeManagerIntegration.test.tsx`）

---

### 风险评级算法细则

目的：对每只基金给出可解释的风险评级（危险/谨慎/安全/机会），并在 UI tooltip 中列出判定理由（reasons），便于用户理解与决策。

输入（必须提供给算法的最小数据）
- price: number （当前用于评级的价格，通常为 data.currentPrice）
- maValues: Record<number, (number | null)[]> — 预计算的均线数组，key 为窗口（如 5/10/20），value 为与历史 price 数组等长的均线值数组（不足位置为 null）
- index: number — 当前用于评级的索引（对应 maValues 中的最后一个索引，一般为 values.length - 1）
- prevIndex?: number — 可选，前一日索引（若存在用于交叉检测）

输出
- RatingResult / RiskResult：{ rating: '危险' | '谨慎' | '安全' | '机会', color: string, action?: string, reasons: string[] }

关键判定规则（实现应严格遵循）
1. 金叉/死叉检测（交叉必须依赖前一日数据）：
   - 黄金交叉（golden cross）：当 prev_sma5 <= prev_sma10 且 sma5 > sma10 且同时 sma20 可用且 sma5 > sma10 > sma20（多头排列）时认定；在 reasons 中加入 “最近发生 5 日均线向上突破 10 日均线（黄金交叉）”。
   - 死亡交叉（death cross）对称定义：prev_sma5 >= prev_sma10 且 sma5 < sma10 且 sma5 < sma10 < sma20（空头排列）。加入对应 reasons。
2. 20 日均线保护位（首要风险判定）：
   - 若 sma20 可用且 price < sma20 => rating = '危险'，color = 红，action = '撤离'，并在 reasons 中加入跌破 20 日均线的说明（包含数值）。
3. 短期多头判定：
   - 若 sma5 > sma10（且数据可用）：将视为短期上升趋势；进一步判断是否存在黄金交叉且 price >= sma5 * TOLERANCE（机会）或 price < sma5 * TOLERANCE（安全/稳健），按 PRD 已定义逻辑给出 reasons 与 action。
4. 短期弱势或下穿：
   - 若 sma5 <= sma10：判为谨慎（并根据是否跌破 10 日线给出额外 reasons）。

边界与降级逻辑
- 若某些均线数据不可用（例如历史点不足），computeRiskRating 应尽量使用已有数据并在 reasons 中标注“数据不足”类理由；不得抛异常。
- 若 prevIndex 不可用，则不认定金叉/死叉（必须有上一日数据支持交叉判定）。
- TOLERANCE（来自 `maConfig`）用于判断 price 对 sma5 的“回踩未破”条件：price >= sma5 * TOLERANCE 视为未破。

示例：在 tooltip 中应显示至少 1-3 条 reasons，按优先级（交叉>跌破20日>短期排列等）排序。

验收标准（Risk）
- `utils/riskTooltip.computeRiskRating` 对给定的 maValues 与 price 在单元测试中输出可预测、可解释的 reasons；覆盖金叉、死叉、跌破 20 日、数据不足四类场景。


### 整体收益（盈亏）计算规范（必须保留）

目的：对某一 symbol 给出准确、可复现的“整体收益”指标，包含已实现收益（realized P&L）、未实现收益（unrealized P&L）、持仓数量、平均成本与累计投资额，供 UI 展示（例如 FundDetailsModal 的 summary 或 TradeManager 的头部统计）。

核心定义（术语）
- 逐笔交易的字段：date (YYYY-MM-DD local), type (buy/sell), shares, price, fee
- 持仓（position）：对 trades 按时间顺序应用后的净份额（买入为正，卖出为负）
- 成本计量：采用 FIFO（先进先出）或加权平均成本（可在 PRD 中指定默认为 FIFO，并在未来提供配置）。本 PRD 默认：使用 FIFO 计算已实现收益，并用加权平均（running average）辅助展示当前平均成本。

算法（建议实现步骤，开发可直接实现）
1. 对该 symbol 的交易按 `date` 升序排序；在同日存在多笔交易时按记录顺序处理。所有比较与时间点均使用本地日期的当日 23:59:59 时间戳作为交易“发生时点”。
2. 初始化：position = 0，realizedPL = 0，inventory queue = []（每项 { shares, price, feePerShare }）
3. 处理每笔 trade：
   - 若 type === 'buy'：将 { shares, price, feeDistributed } 推入 inventory queue，position += shares，累计投入金额 += shares * price + fee
   - 若 type === 'sell'：从 inventory queue 按 FIFO 弹出份额直至满足卖出份额，针对每个匹配批次计算 realized 部分：(sellPrice - buyPrice) * matchedShares - proRatedFees；position -= soldShares；若超卖（卖出大于当前持仓），应允许并把超出部分记为负持仓（短仓），并在 UI 中用特殊标识提示用户（并在 PRD 中建议阻止或提示超卖情况）。
4. 计算未实现收益（unrealized）：使用当前位置 position 与最新市场价（data.currentPrice 或历史价点的对应 price），unrealizedPL = position * (marketPrice - currentAvgCost)（若 position < 0，解释为空头），并注明计算所用 cost 方法（FIFO 平均或加权平均）。
5. 输出汇总：{ position, avgCost, investedAmount, realizedPL, unrealizedPL, totalPL = realizedPL + unrealizedPL }

额外细节：
- 手续费分配：在买入时将手续费计入成本（分摊到每股/份），在卖出时手续费从 realizedPL 中扣除（或同样分摊），实现时保持一致性并在输出中说明。导出/展示中的 total 精度按 PRD 规范（price 4 位、total 2 位）。
- 历史时间序列（每日市值）：为了在图上叠加“账户净值曲线”或“持仓市值”，生成每日时间序列：对每个历史点（timestamp ordered），计算当日 23:59:59 之前的 trades 累计位置 position_t，然后市值 = position_t * price_t，记录 dailyInvested（累计投入）与 dailyRealized（当日实现）以便绘制多线图（净值、持仓市值、累计投入）。

测试与验收（收益计算）
- 单元测试案例包括：单次买入、买入后部分卖出（部分实现收益）、多笔买入后卖出（FIFO 匹配），手续费影响验证，超卖场景处理。
- 在 TradeManager 的 UI 中显示的汇总数字应与该逻辑输出一致（保留小数位说明）。


### 在基金趋势图上展示交易记录（可交互规范）

目的：在 `FundDetailsModal` 的历史净值图（或 IndexDetailsModal 的图）上直观展示相关交易（买/卖）以帮助用户回顾交易决策与绩效。

要素与行为（可直接开发实现）
1. 标记类型：为每笔交易绘制一个 marker（marker 类型：buy -> 绿色向上三角或圆点，sell -> 红色向下三角或空心圆），并在 marker 上显示小型标签（例如买入份额或净额）。
2. X 轴 对齐：将交易的 `date`（local YYYY-MM-DD）映射到图表上的对应 timestamp，使用与 `TradeManager` 相同的回溯逻辑以决定在图上放置的价格点：
   - 若历史点包含该日期 exact match，marker 位置使用该点的 value；
   - 否则使用当日 23:59:59 的回溯结果（即取 <= 当日结束时间的最近点）；
   - 若仍然没有历史点，则 marker 放在图表最早点处并在 tooltip 中注明“使用回退价格”。
3. 多笔同日交易聚合：若同一日存在多笔交易，支持两种可选展示策略（在 PRD 中默认采用“堆叠”展示）：
   - Stack（默认）：在同一 x 位置沿 y 方向堆叠多个 marker（保留每笔的颜色与顺序），hover 时显示每笔交易的详细 tooltip；
   - Aggregate（可选）：合并为一笔净交易（显示总买入/卖出数量与净资金流），Tooltip 展示拆分明细。
4. Tooltip 内容（必须包含）:
   - date, type (买/卖), shares, price (用于该点显示的 price), fee, total (计算值), 累计持仓（交易后的 position）以及该笔交易对整体收益的即时影响（例如本笔 realized 增量或对 unrealized 的影响）。
5. 交互
   - Hover marker：显示 Tooltip；
   - Click marker：在图表侧边或 modal 下方高亮该条交易并在 TradeManager 中滚动到对应记录（若 TradeManager 可见或在子页面间联动）
   - 开关：在 FundDetailsModal 的图表控件内提供开关（显示/隐藏 交易 markers）以节省视图空间
6. 性能注意
   - 若历史点与交易数目较大（例如 trade 数以千计），在图上渲染 markers 应做采样或分页（例如只显示最近 N 笔或聚合早期批次），并在 tooltip/详情中允许查询完整历史。

验收标准（图表交易展示）
- 在不同历史/交易组合下，marker 正确对应交易日期并展示正确 price（遵循回溯规则）；同日多笔正确堆叠或聚合；hover 与 click 行为工作正常并能联动 TradeManager。
- 单元/集成测试覆盖：映射规则（date->timestamp）与聚合/堆叠逻辑应有对应测试用例。


## 盈亏计算功能需求

### 单个基金盈利计算
- 在基金详情窗口（FundDetailsModal）增加盈利图标，点击后弹出基金盈利窗口，展示累计盈利曲线（基于持仓与价格计算）。
- 盈利趋势图：
  - 横轴为日期，纵轴为累计盈利金额。
  - hover 显示每日对应点的日期、当日盈利金额和累计盈利金额。
  - x轴起始为基金持仓起始日期，终止为当天日期。
- 盈利表格：
  - 图表下方，用户可选择两个日期（起始和结束），展示该期间的每日盈亏。
  - 表格三列：日期、当日净值、当日盈利。
  - 一屏最多显示10条，带滚动条。
  - 表格下方显示该区间累计盈亏。
  - 正数红色，负数绿色，0值用黑色“-”表示。
  - 用户选择不同日期范围时，盈亏数字动态更新。
- 盈亏计算逻辑：
  - x日累计盈利 = x日份额 * x日净值或估值（若无则取最近前一日）- 初始份额*初始价格 - 截止x日所有买入交易总和 + 截止x日所有卖出交易总和。
  - x日份额 = 初始份额 + 截止x日（含x日）所有买入份额 - 截止x日（含x日）所有卖出份额。
  - 每日盈利 = 当日累计盈利 - 前一日累计盈利。
- 日期选择规则：
  - 开始日期必须早于结束日期（默认结束为当天）。
  - 开始日期不得早于持仓开始日期（默认即持仓开始日期）。
  - 若区间不合法，显示错误提示。

### 整体盈利计算
- 主界面管理按钮旁增加“盈利”按钮，点击后弹出整体盈利窗口。
- 整体累计盈利趋势图：
  - 横轴为日期，纵轴为累计整体盈利金额。
  - hover 显示每日日期、当日整体盈利金额和累计整体盈利金额。
  - x轴起始为所有已注册基金中最早的持仓起始日期，终止为当天日期。
- 整体盈利表格：
  - 图表下方，用户可选择两个日期（日期1/日期2），仅影响表格数据。
  - 表格四列：基金名称（代码）、日期1累计盈利、日期2累计盈利、盈利差额。
  - 一屏最多显示10条，带滚动条。
  - 表头和统计行固定，滚动时始终可见。
  - 表格下方显示统计信息：总计、区间累计值总和、区间末累计值总和、总额总和。
  - 正数红色，负数绿色，0值用黑色“-”表示。
  - 用户选择不同日期范围时，表格数据动态更新。
- 统计与过滤规则：
  - 只有具有持仓开始日期且早于日期2的基金才纳入整体盈亏计算和表格展示。
  - 若基金持仓开始日期晚于日期x，则该基金在x日的累计盈利为0。
  - 没有持仓开始日期的基金不参与整体累计盈利计算，也不在表格显示。
- 日期选择规则：
  - 日期1必须早于日期2（默认为时间轴最后一天）。
  - 日期1的默认值为日期2默认值的前一天。
  - 日期1不得早于图上x轴起始日期。
  - 日期2不得晚于x轴终止日期。
  - 若区间不合法，清空表格并显示错误信息。
- 计算机制：
  - 整体累计盈利趋势图的数据集为所有基金（排除无起始日期的基金）在时间窗口内每日累计盈利的加总。
  - 表格数据为趋势图数据集的子集，通过日期1和日期2过滤。
  - 单个基金在x日的累计盈利算法与单基金盈利窗口一致，保证一致性。
  - 若某基金在x日无净值或估值，则累计盈利按前推最近可用净值/估值计算。

---

