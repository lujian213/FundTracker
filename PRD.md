# FundTracker — 产品需求文档 (PRD)

版本：1.0  
生成日期：2026-02-11

---

## 1. 概述
FundTracker 是一个前端单页应用，用于添加/管理“自选基金/指数”，展示实时估值、涨跌、历史净值曲线与详情链接，支持本地持久化（localStorage），并通过简单的交互（添加、删除、查看详情）帮助用户监控其关注的基金或指数。

技术栈（从仓库观察）：
- React + TypeScript
- Vite
- Jest + @testing-library/react（用于单元/组件测试）
- JSONP 调用（用于天天基金实时估值）
- Tailwind CSS（类名风格）
- CI: GitHub Actions（存在 deploy 工作流，需在其上增加测试步骤）

---

## 2. 目标与成功度量

目标
- 提供稳定、可测的“自选基金/指数”展示功能，包含实时估值与历史趋势。
- 保持核心服务（fetchFundData/fetchFundHistory）可单元测试（可模拟 jsonp 或错误）。
- CI 流程在合并/部署前自动运行单元与组件测试，阻止有问题的代码进入生产。

成功度量
- 单元测试覆盖关键服务（fundService）和主要交互组件（AddTickerModal、TickerCard、ConfirmDialog、FundDetailsModal）：关键路径覆盖率 >= 85%（目标）。
- CI 在每次 PR/合并时执行测试步骤并阻止失败的合并（由 GitHub 分支保护配合实现）。

---

## 3. 用户与使用场景

用户：需要实时查看/管理基金/指数估值的普通投资者。

主要场景
- S1: 添加基金/指数到自选（通过 `AddTickerModal`），显示加载状态、校验不合法输入。
- S2: 在主界面查看多个 `TickerCard`，能看到符号、名称、当前估值、涨跌幅、上次更新时间与操作（删除/查看详情）。
- S3: 点击某个卡片展开 `FundDetailsModal` 或 `IndexDetailsModal`，查看历史净值趋势（近90个交易日）、最近更新与在第三方页面查看链接。
- S4: 删除某个自选项（弹出 `ConfirmDialog`）。
- S5: 本地持久化（localStorage）以便刷新后数据仍然存在。

---

## 4. 数据模型（契约）

文件：`types.ts`

主要类型摘要：

- MarketType (enum)
  - FUND, INDEX

- Ticker
  - id: string
  - symbol: string
  - name: string
  - market: MarketType

- ValuationData
  - symbol: string
  - name: string
  - currentPrice: number         // 实时估值 gsz
  - previousPrice: number        // 昨日净值 dwjz
  - changePercentage: number     // 估值涨跌幅 gszzl
  - lastUpdated: string          // 完整更新时间 gztime -> "YYYY-MM-DD HH:mm"
  - realtimeDate: string         // 提取日期 -> "YYYY-MM-DD"
  - netWorthDate: string         // jzrq -> 确认净值日期
  - valuationDate: string
  - sourceUrl: string

- HistoricalPoint
  - date: number (timestamp)
  - value: number
  - equityReturn: number

契约说明
- `fetchFundData(symbol: string): Promise<ValuationData | null>`
  - 输入：symbol（可能为数字字符串或编号），函数会在内部 padStart(6,'0') 并调用 jsonp
  - 返回：若成功返回 `ValuationData`，否则 `null`
  - 错误模型：当前实现在 catch 后 swallow 错误并返回 null；未来可能改为抛出网络错误（需测试兼容）

- `fetchFundHistory(symbol: string): Promise<HistoricalPoint[]>`
  - 返回按时间排序的历史点数组；`FundDetailsModal` 会使用最近 90 个点。

---

## 5. 主要功能与组件行为（映射到源代码）

- `App` (`App.tsx`)
  - 管理 portfolio, indices 和 globalIndices
  - 保存/加载到 `localStorage`（键：`fund_portfolio` 等）
  - 打开/关闭相关 modal（Add/Details）
  - 触发批量更新 `runBatchUpdate`

- `TickerCard` (`components/TickerCard.tsx`)
  - 显示 symbol、name 或占位、当前价格、涨跌幅、上次更新信息
  - 根据 `changePercentage` 决定样式（`text-red-600` vs `text-green-600` 等）
  - 在 selection 模式下显示勾选状态
  - 可触发 `onRemove`、`onClick`、`onSelect` 回调
  - 风险评级：在卡片 header（删除按钮左侧）显示风险评级 badge（危险/谨慎/安全/机会），badge 支持 hover/focus 展示 tooltip，列出判定依据与推荐操作（见算法与配置）

- `AddTickerModal` (`components/AddTickerModal.tsx`)
  - 三个 tab：`fund` / `domestic` / `global`（输入格式与占位、建议不同）
  - 支持输入多个 symbol（用空格/逗号/换行分隔）
  - 验证空输入并阻止提交；提交时调用 `onAdd(symbols, MarketType)`
  - 在 `isLoading` 状态下禁用提交按钮

- `ConfirmDialog` (`components/ConfirmDialog.tsx`)
  - 显示确认/取消按钮
  - 按钮点击与键盘（Enter/Esc）应触发 `onConfirm` / `onCancel`

- `FundDetailsModal` (`components/FundDetailsModal.tsx`)
  - 在 mount 时调用 `fetchFundHistory(symbol)`，限制成最近 90 个交易日点
  - 将实时估值点（基于 `data.realtimeDate` + 15:00）合并到历史数组（当时间戳大于历史最后一个点时）
  - 生成曲线 path/area/points，用于 svg 绘制
  - 均线（SMA）显示：默认打开 SMA5 与 SMA20，支持 SMA10 的开关；在图表 hover 时显示各可见均线的当前点数值；提供图例/控件切换均线显隐

- `IndexDetailsModal` (`components/IndexDetailsModal.tsx`)
  - 与 `FundDetailsModal` 类似但使用 `fetchIndexHistory`

---

## 6. 错误处理、边界条件与安全约束

已知行为
- `fetchFundData` 在发生错误时目前 swallow 并返回 `null`（service 内部 try/catch 并返回 null）
- `jsonp` 机制通过全局回调注册表 (`fundRegistry`) 将回调映射到 fundCode（实现复杂度需要单元测试模拟）

边界与输入规范
- symbol normalization：`fetchFundData` 会 `padStart(6,'0')`，因此短数字会补零（比如 '123' => '000123'）
- 允许的 symbol 长度测试范围：4, 5, 6, 7 digits（需在测试中覆盖）。

安全/隐私
- 不持久化任何敏感用户信息；只在 localStorage 保存 portfolio/indices。
- JSONP 使用全局回调，注意避免可注入的回调名；代码中通过 `code` 参数作为 callback 名称（需要评估安全性）。

---

## 7. 测试计划（总体）

目标：为高优先级路径（fundService 与主要交互组件）提供确定性、可重复的单元/组件测试。测试代码放置位置：仓库已有 `tests/` 目录，约定将所有测试放在顶级 `tests/`（或 `__tests__`）而不是与源文件夹混放。

总体测试优先级（来自用户需求）
- High: services/fundService.ts（详见下文），components/TickerCard, AddTickerModal, ConfirmDialog
- Medium: 集成 AddTickerModal → fetchFundData (mocked)，App smoke test
- Low: 快照、无障碍审计、E2E

具体测试点（高优先级，必须）
1. services/fundService.test.ts
   - Case A: Valid 6-digit symbol -> 返回 `ValuationData` 结构（所有字段存在与类型正确）
   - Case B: Invalid symbol (含字母或空字符串) -> 返回 `null`
   - Case C: Deterministic currentPrice for same symbol（seeded pseudo-random）
   - Case D: Error handling: 模拟 jsonp 或 queue 抛出（或 callback 未触发），期望 `fetchFundData` 返回 `null`（当前行为）
   - Case E: Edge length: 对 4/5/6/7 位 symbol 的行为断言（映射到 padStart 或直接请求）
   - Case F: `fetchFundHistory`：返回数组，排序与长度截断（只取最后 90）

2. components/TickerCard.test.tsx
   - 渲染 symbol, name, price, lastUpdated
   - 根据 `changePercentage` 应用正确类名（positive/negative）
   - 点击 remove 调用 `onRemove`
   - Badge 与 tooltip：断言风险评级 badge 出现，hover/focus 后 tooltip 显示判定理由（SMA 基于历史数据）

3. components/AddTickerModal.test.tsx
   - 当输入空字符串显示校验/阻止提交
   - 输入多个代码后点击提交，调用 `onAdd` 并传递标准化 symbol 列表
   - 提交时 `isLoading` 禁止按钮

4. components/ConfirmDialog.test.tsx
   - 点击 Confirm/Cancel 调用对应回调
   - 键盘 Enter/Escape 调用对应回调

中优先级（建议在主分支稳定后实现）
- AddTickerModal 在提交时对 `fetchFundData` 的交互（使用 jest.mock 模拟 service）
- App.tsx 的挂载 smoke test

低优先级
- Snapshot 测试（选择稳定组件）
- a11y 自动化（axe）

测试桩与工具
- 把 `fetch`/`jsonp` 抽象并在测试中进行 mock
- 为 `fundService` 提供「注入式」测试桩或在测试中直接替换 `global.jsonpgz` 回调触发
- 建议创建 `tests/fixtures/fundData.ts`，包含 createValuationFixture(symbol) 帮助函数，保证测试中使用确定性数据

测试目录约定
- tests/
  - services/fundService.test.ts
  - components/
    - AddTickerModal.test.tsx
    - TickerCard.test.tsx
    - ConfirmDialog.test.tsx
  - fixtures/
    - fundFixtures.ts

测试命令（开发者使用）
- 运行所有测试：

```bash
npm test
```

---

## 8. CI / 部署 与 分支保护

CI 要求（必须）
- 在 GitHub Actions 工作流（现有 `deploy.yml`）中添加 test 步骤，在部署前运行 `npm ci`（或 `npm install`）以及 `npm test`，并在测试失败时阻止部署。
- 若主分支（`main`）被 GitHub 环境保护规则阻止发布到 `github-pages`，需要在部署工作流中：
  - 使用受保护的分支策略（例如通过检查 `GITHUB_REF` 是否为允许分支），或者
  - 将部署分支切换到 `gh-pages` 分支，并通过工作流创建/强制推送到 `gh-pages`（在有分支保护时需使用、或者管理员作业 token）
- CI 必须设置 node 版本与缓存（actions/setup-node），并且在拉取依赖前先运行 `npm ci`。

示例工作流步骤（说明，不直接修改文件）
- Checkout
- Setup Node (用项目支持的版本)
- Install deps: `npm ci`
- Run tests: `npm test` — 若失败，停止流程（exit non-zero）
- Build: `npm run build`
- Deploy: 执行现有 deploy 步骤（仅在 test & build 成功后）

关于“Branch 'main' is not allowed to deploy to github-pages due to environment protection rules.”
- 这是 GitHub 的环境保护（Environment protection / branch protection / required reviewers / required status checks）配置导致的限制，不是代码层面的规则。
- 来源：仓库的 GitHub Settings -> Environments/Branches，管理员可配置哪个分支/谁能触发对某个 environment 的部署。
- 建议：将部署工作流改为使用专门的部署分支（如 `gh-pages`）或调整 repository 的 environment protection（需要仓库管理员操作）。

---

## 9. 验收准则（Per Feature / Testable）

1. fetchFundData 基本契约
   - 验证命令：运行 `npm test -- tests/services/fundService.test.ts`
   - 预期：所有 fundService 相关测试通过，包括 4/5/6/7 位边界测试、错误处理与确定性输出测试。

2. AddTickerModal 行为
   - 测试：`tests/components/AddTickerModal.test.tsx`
   - 预期：valid 输入会调用 `onAdd`，空输入阻止提交，加载状态禁用按钮。

3. TickerCard
   - 测试：`tests/components/TickerCard.test.tsx`
   - 预期：渲染文本与 class 匹配 `changePercentage` 值。

4. ConfirmDialog
   - 测试：`tests/components/ConfirmDialog.test.tsx`
   - 预期：点击/键盘触发相应回调。

5. CI
   - 验证：提交 PR，检查 Actions `deploy.yml` 执行，确保 test step 在 build/deploy 之前运行；尝试向受保护的 environment 部署（应失败或需要权限），再使用允许的分支/凭证成功部署。

---

## 附录：均线（SMA）与基金风险评级 — 需求细节（保留）

本附录保存所有关于均线（SMA）与基于均线的风险评级的详尽需求与判定规则，便于后续实施与审计。下面为摘要与详尽说明（开发/测试/验收细节）：

### A. 均线（Moving Average, SMA）

说明
- 在 `FundDetailsModal` 的净值趋势图中增加移动均线（Simple Moving Average, SMA）作为技术参考指标，支持 SMA5、SMA10、SMA20。

功能需求
- `FundDetailsModal` 在图上默认显示 SMA5 与 SMA20；提供控制允许开启 SMA10。
- Hover 时显示每条可见均线在该点的数值。
- 提供可测试的纯函数 `utils/movingAverage.ts`（computeSMA / computeMultipleSMAs）。

算法与契约
- 输入：values: number[]（按时间升序）
- 输出：Record<number, (number | null)[]> 或 number[] 与 null 占位，保证长度与输入一致。
- SMA 定义：当 i + 1 >= window 时，SMA(i) = 平均(values[i-window+1..i])，否则 null。

测试点（utils）
- 空数组、window > length、正常窗口、多个 window 同时计算。

UI 要求与视觉
- SMA5: #2563eb（蓝），SMA10: #059669（绿），SMA20: #f59e0b（琥珀）。
- SMA5 线宽略宽（2px）以突出短期趋势。

### B. 基于均线的风险评级（概述）

评级类别与举例触发条件
- 危险（红） — price < SMA20
- 谨慎（黄） — SMA5 <= SMA10 或 5 日下穿 10 日但未跌破 20 日
- 安全（绿） — SMA5 > SMA10 且 price 未跌破 SMA5
- 机会（蓝） — 最近发生 SMA5 上穿 SMA10（金叉），且 price >= SMA5 * TOLERANCE（回踩未破）

UI 与交互
- 在 `TickerCard` header 显示 badge，hover/focus 显示 tooltip（判定理由 + 推荐操作）。
- Tooltip 提供简明的判据列表（reasons），并可在 `FundDetailsModal` 查看更详细分析。

测试要点
- `tests/components/TickerCard.test.tsx`：断言 badge 出现且 tooltip 显示判据。
- `tests/components/FundDetailsModal.test.tsx`：在不同历史/价格情形下断言评级逻辑输出。

### C. 配置与可访问性

- 常量 `TOLERANCE`（默认 0.995）暴露于 `utils/maConfig.ts`，并建议实现设置面板以允许用户调整。
- Badge/tooltip 要支持 keyboard focus 与 aria 描述（`aria-label`/`aria-describedby`/`role="tooltip"`）。

### D. 验收与回退策略

- 自动化验收：新增 utils 与组件测试通过；视觉与交互通过测试断言（SVG 有 path、tooltip 出现）。
- 回退策略：若均线功能引发性能或 UI 问题，可默认将均线设为关闭，或延迟计算/渲染直至用户显式开启。

### E. 变更记录：统一风险 tooltip 与金叉/死叉定义

2026-02-12 更新：将风险评级与 tooltip 逻辑抽取为共享模块 `utils/riskTooltip.ts`，并统一 `TickerCard` 与 `FundDetailsModal` 使用该模块，以避免不同组件间判定不一致的问题。主要变更点：

- 统一实现：`utils/riskTooltip.ts` 导出 `computeRiskRating`，输入为当前价格、预计算的均线数组（5/10/20）以及索引位置，输出包含 `rating`、`color`、`action` 与 `reasons`（用于 tooltip 展示）。
- 金叉（黄金交叉）新定义：当日 5 日均线向上穿越 10 日均线（即上一交易日 5 <= 10，当日 5 > 10），并且当日呈现多头排列（5 > 10 > 20）。仅在满足上述条件并且前一日均线数据存在时认定为金叉。
- 死叉（死亡交叉）对称定义：上一日 5 >= 10，当日 5 < 10，并且当日呈现空头排列（5 < 10 < 20）。
- Tooltip 改进：若当日发生金叉或死叉，`reasons` 中会包含相应条目（“最近发生 ...（黄金交叉）” 或 “最近发生 ...（死亡交叉）”），`TickerCard` 与 `FundDetailsModal` 的 hover tooltip 均会显示该信息。
- 测试覆盖：新增 `tests/utils/riskTooltip.test.ts`（单元测试金叉/死叉检测边界与 prev-null 行为），并扩展 `tests/components/TickerCard.test.tsx` 与 `tests/components/FundDetailsModal.test.tsx`，加入金叉场景断言（tooltip 包含“黄金交叉”）。

注意事项与假设：
- 为避免误判，金叉/死叉需依赖上一日的均线值（若上一日数据缺失则不认定为交叉）。
- 在当日缺少 SMA20 值时，不会认定为金叉/死叉（无法判断 5/10/20 的多空排列）。

验收标准：
- `computeRiskRating` 返回的 `reasons` 在有交叉时包含交叉描述；`TickerCard` 与 `FundDetailsModal` 的 tooltip 在 hover 时展示这些描述。
- 新增/修改的测试均通过（参见 tests/ 目录）。

---

(文档结束)
