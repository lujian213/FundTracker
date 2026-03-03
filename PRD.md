# FundTracker — 产品需求文档 (PRD)

版本：1.2
最后更新：2026-03-03

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
  - 测试、验收与 CI 要求

高优先级交付物（v1）
- 主界面：自选卡片（TickerCard）列表（响应式布局）
- 添加弹窗：`AddTickerModal`（支持批量输入、验证）
- 详情弹窗：`FundDetailsModal` / `IndexDetailsModal`（历史曲线 + SMA）
- 交易管理弹窗：`TradeManager`（新增/编辑/删除/分页/导入/导出）
- 交易明细弹窗：`TransactionsModal`（按日期展示所有基金当日交易汇总，含统计行）
- 本地持久化：portfolio/indices 与 trades 存于 localStorage
- 单元测试：服务层（fundService）和关键组件（AddTickerModal、TickerCard、ConfirmDialog、TradeManager、TransactionsModal）

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

服务层（`services/fundService.ts`）行为约定
- `fetchFundData(symbol: string): Promise<ValuationData | null>`
  - 内部对 symbol 执行 `padStart(6,'0')` 后构建请求（JSONP 专用）。
  - 在异常/超时情况下返回 null（当前策略）。
  - JSONP 超时：8000ms
- `fetchFundHistory(symbol: string): Promise<HistoricalPoint[]>`
  - 返回抓取到的完整历史（按时间升序），组件决定截断数目。
  - 若失败返回 []
- 请求速率控制：内部有 `RequestQueue` 做排队与随机小延迟（150–350ms）以减缓并发请求

UI / 视觉与交互规范（可直接实现）

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
    - 第五列：净额 = 卖出总额之和 − 买入总额之和；净额 > 0 → `{千分位}（入账）`；净额 < 0 → `{|净额|千分位}（出账）`；净额 = 0 → 黑色 `"-"`
  - 列宽（table-fixed）：基金名称 30%、类型 10%、份额 13%、手续费 15%、交易总额 32%

- 交易记录行高度规范（界面上合理展示多条记录）
  - 目标：每条记录视觉上尽量控制在两行文字内。实现建议：
    - 使用较小字体（text-xs / text-[11px]）、减小垂直内边距（px-2 py-1）
    - 对文本使用单行截断（`truncate`）或多行截断（可选：`-webkit-line-clamp:2` 结合 `display:-webkit-box`）
    - 确保 flex 子项使用 `min-w-0` 以允许截断生效
  - PRD 规范（可作为验收项）：记录行在常用桌面分辨率下不超过两行；超出使用省略号显示

风险评级与均线（实现细节）
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
- 交易管理：
  - 添加/编辑/删除 功能在 UI 上生效并持久化到 `fund_trades`
  - 导出 JSON/CSV 包含正确 total 值（数值精度检验：price 4 位，total 2 位）
  - 导入会在用户确认后覆盖数据并触发 UI 刷新
  - 分页逻辑正确（上一页/下一页、页数显示正确）
- 交易明细窗口（TransactionsModal）：
  - 无交易时：日期按钮 disabled，表格区域显示"无任何交易存在"
  - 默认显示最近有交易记录的 local 日期（`getAllTradeDates()[0]`）
  - 日历仅允许选择有交易记录的日期；有交易日期加粗+蓝色下划线标注
  - 五列表头文字正确（基金名称 / 类型 / 份额 / 手续费 / 交易总额）
  - 基金名称优先取 `marketData.name`，兜底 `portfolio` 的 `Ticker.name`
  - 统计行：条数正确、手续费合计正确、净额（入账/出账）正确；净额 = 0 显示黑色 `"-"`
  - 切换日期后表格内容正确更新
  - 0 值全部显示黑色 `"-"`；数值千分位两位小数
- 风险评级：在给定历史/当前价样例中输出预期 rating 与 reasons（单元测试覆盖）
- UI 视觉：交易记录在常见桌面宽度下保持不超过两行显示（或使用多行截断展示两行）

测试计划（开发者可直接运行）
- 单元测试（High）
  - `tests/services/fundService.test.ts`：fetchFundData 的正常/边界/超时/错误用例；fetchFundHistory 返回结构测试
  - `tests/utils/movingAverage.test.ts` 与 `tests/utils/riskTooltip.test.ts`：均线算法与交叉检测
  - `tests/hooks/useTrades.test.ts`：localStorage 读写、导入覆盖、导出格式、CustomEvent 与 storage 同步
  - `tests/hooks/getAllTradeDates.test.ts`：`getAllTradeDates` 去重、降序、跨 symbol 合并；`readAll` 正常/损坏 JSON 容错
- 组件/集成测试（Medium）
  - `tests/components/AddTickerModal.test.tsx`、`TickerCard.test.tsx`、`ConfirmDialog.test.tsx`、`TradeManager.test.tsx`：交互路径、表单校验、导入导出、分页
  - `tests/components/TransactionsModal.test.tsx`：无交易状态、默认日期、五列表头、基金名称来源、买入/卖出标签、统计行（条数/净额/出入账/零值）、日期切换、零值显示、关闭按钮
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
- [ ] 为 `TradeManager` 添加导入前确认弹窗（若需要，我可以立即实现并添加测试）
- [ ] 在 tests/ 中补充 `hooks/useTrades.test.ts`、`TradeManager.test.tsx`、`utils/riskTooltip.test.ts`（优先级按上）
- [ ] 在 CI workflow 中加入 `npm test` 步骤（如需我可以提交 workflow 修改建议）

变更记录
- 2026-02-11 v1.0：初始 PRD
- 2026-02-16 v1.1：整合实现对照、产品确认项（均线默认 5/10/20、导入覆盖、local day-end 回溯等）并生成可执行的开发任务清单
- 2026-03-03 v1.2：新增基金交易明细功能（TransactionsModal）：主界面"交易"按钮、日期选择器（react-day-picker、仅允许有交易日期、日历标注）、五列交易明细表、统计行（条数/手续费合计/净额入出账）；导出 `readAll` 与 `getAllTradeDates`；新增测试 23 个用例

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
  - 日期1必须早于日期2。
  - 日期1不得早于图上x轴起始日期。
  - 日期2不得晚于x轴终止日期。
  - 若区间不合法，清空表格并显示错误信息。
- 计算机制：
  - 整体累计盈利趋势图的数据集为所有基金（排除无起始日期的基金）在时间窗口内每日累计盈利的加总。
  - 表格数据为趋势图数据集的子集，通过日期1和日期2过滤。
  - 单个基金在x日的累计盈利算法与单基金盈利窗口一致，保证一致性。
  - 若某基金在x日无净值或估值，则累计盈利按前推最近可用净值/估值计算。

---

### 文档变更与测试目录指令（快速引用）
- 新增/扩充的单元测试文件建议：
  - `tests/utils/riskTooltip.test.ts`（覆盖交叉、跌破 20 日、数据不足）
  - `tests/utils/returnsCalculator.test.ts`（收益计算：FIFO、手续费、超卖）
  - `tests/components/FundDetailsModal.trades.test.tsx`（图表 markers 映射/聚合/交互）

- 验证命令（开发者本地运行）

```powershell
npm test -- tests/utils/riskTooltip.test.ts
npm test -- tests/utils/returnsCalculator.test.ts
npm test -- tests/components/FundDetailsModal.trades.test.tsx
```
