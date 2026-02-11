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

## 10. 具体 Test Cases（示例）

services/fundService.test.ts (high)
- "returns ValuationData for valid 6-digit symbol"
- "returns null for symbol too short or non-numeric"
- "produces deterministic currentPrice for symbol X"
- "handles jsonp timeout / callback not invoked"
- "edge length symbols 4/5/6/7"

components/TickerCard.test.tsx (high)
- "renders symbol and price"
- "applies positive class when changePercentage > 0, negative when < 0"
- "calls onRemove when remove button clicked"

components/AddTickerModal.test.tsx (high)
- "shows validation error when symbol empty"
- "calls onAdd with normalized symbols after submit"
- "disables submit while fetching (isLoading true)"

components/ConfirmDialog.test.tsx (high)
- "calls onConfirm when OK clicked"
- "calls onCancel when Cancel clicked or Escape pressed"

Integration (medium)
- "AddTickerModal triggers fetchFundData on submit and shows loading then success"

---

## 11. Implementation Notes & 建议
- 测试隔离：`fundService` 的 JSONP/RequestQueue 需要被抽象或在测试中替换/spy。建议：
  - 在 `fundService` 中把 `jsonp` 导出或允许注入一个 `jsonpImpl`，以便测试中替换为同步 stub。
  - 或者在测试中直接覆盖 `global.jsonpgz` 并触发注册回调，模拟真实 JSONP 回调。

- 测试位置：请将所有测试文件放到仓库已有的 `tests/`（已有 tests/components 下的示例），不要和源码放在同一目录（按你的要求）。

- CI：为避免 main 无法部署问题，建议:
  - 在 `deploy.yml` 中把 `test` 步骤和 `build` 步骤设置为必须通过；
  - 将部署到 github-pages 的 job 设为只在 `gh-pages` 或特定 tag 上运行，或使用仓库管理员添加的 deploy token。

- 错误策略统一：目前服务 swallow 错误返回 null；建议在未来版本明确两种策略：`null`（业务可接受）或 throw（用于上层统一处理）。在 PRD 中保持当前行为，并在服务层形成文档注释。

---

## 12. 风险与待决事项
- JSONP 全局回调复杂度：在并发请求时需要确保注册/反注册逻辑健壮；单元测试需要覆盖并发场景。
- 部署受 GitHub 环境保护限制：需要仓库管理员更改 settings 才能允许 main 触发部署，或调整 workflow。
- 对 7 位及以上 symbol 的处理需与业务方确认（是否需要截断或报错）。

---

## 13. 下一步（行动项）
- [ ] 在 `tests/` 中创建所需测试骨架（我可以代为创建这些测试文件并确保 jest 能跑通）。
- [ ] 修改 `.github/workflows/deploy.yml`：在 deploy 流程中加入 `npm ci` + `npm test` 步骤（我可以按你之前批准的 “go ahead” 实施）。
- [ ] （可选）重构 `fundService` 以便更易于测试（将 jsonp 抽象或导出可替换实现）。
- [ ] 将 PRD 保存为 `PRD.md` 到仓库（已完成）。

---

## 附加功能：均线（Moving Average, SMA）

说明
- 在基金详情的趋势图中增加移动均线（Simple Moving Average, SMA）作为技术参考指标，初始支持 SMA5（5 日均线），并可扩展为 SMA10、SMA20 等。

目的
- 为用户提供短期价格趋势的平滑视图，帮助观察短期支撑/阻力与趋势方向。

功能需求（高层）
- 在 `FundDetailsModal` 的净值趋势图上显示 SMA5，默认开启。
- 提供用户开关，允许显示/隐藏 SMA5、SMA10、SMA20（默认只打开 SMA5）。
- 在鼠标 hover（或触摸交互）的点信息中，显示对应索引处的可见均线值（若有）。
- 为均线计算提供独立的可测试公用函数（例如：`utils/movingAverage.ts`），并为该函数添加单元测试。

数据契约 / 算法
- 输入：历史净值数组 values: number[]（按时间升序）。
- SMA(window) 的定义：对于索引 i，当 i + 1 >= window 时，SMA(i) = 平均(values[i-window+1..i])；否则 SMA(i) = null。
- 输出：与输入同长度的数组，位置 i 对应的 SMA 值或 null。
- 兼容性：`FundDetailsModal` 在合并实时点后会把实时值追加到历史数组再计算 SMA；SMA 计算使用追加后的完整数组。

UI/视觉规范
- 主价线（当前实现）使用红色（#ef4444），SMA5 使用蓝色（#2563eb），SMA10 使用绿色（#059669），SMA20 使用琥珀色（#f59e0b）。颜色可配置。
- SMA 线宽：SMA5 为 2px，其他均线为 1.5px（可微调）。
- 在图例或控制区放置小开关/按钮，标注为“均线：5 10 20”，当前可点击切换显隐。
- Hover 弹出框中显示当前点的净值、当日涨跌、以及所有可见均线（按颜色前置与数值）的即时值。

可访问性
- 均线控制需要可通过键盘聚焦与操作（button 元素，自带 focus），按钮应有明确文本与 aria-label，例如 `aria-label="切换 5 日均线"`。
- 图形元素（SVG）应保留必要的文本替代/数据表或提供 aria-describedby 链接到弹出信息（按需补充）。

测试计划（新增项）
- 单元测试（utils）
  - `tests/utils/movingAverage.test.ts`：覆盖 `computeSMA` 与 `computeMultipleSMAs` 的边界和正确性（空数组、window 大于数组长度、正常窗口）。
- 组件测试（最佳实践）
  - `tests/components/FundDetailsModal.test.tsx`（新增）
    - 渲染包含 5 个或以上历史点时，默认显示 SMA5 路径（通过查询 SVG path 的 stroke 或路径 `d` 属性断言）。
    - 点击均线切换按钮后，SMA 线可见性切换（assert 显示/隐匿）。
    - Hover 任一点时，弹框中显示 SMA5/SMA10/SMA20 的数值（mock history + realtime，查找文本）。
- 集成测试（中优先）
  - 在 `AddTickerModal` 或 `App` 的流程中，mock `fetchFundHistory` 返回已知历史点，打开 `FundDetailsModal`，断言图上显示 SMA（端到端逻辑正确）。

验收准则（可自动化验证）
- 自动化：新增 `tests/utils/movingAverage.test.ts` 与 `tests/components/FundDetailsModal.test.tsx` 的测试通过。
- 视觉：当历史点 >= 5 且 SMA5 可见时，SVG 中存在对应的 path（可通过 `getByRole` / query selector 验证其 stroke 色或 `d` 属性）。
- 交互：点击均线按钮能在 UI 上开/关对应均线（并在 DOM 中反映）。
- Hover：当鼠标移动到某历史点的交互区域，弹出框中列出该点的可见均线值且数值与 utils 计算结果一致。

性能与实现注意事项
- SMA 计算为 O(n * m)（n = 点数，m = 窗口）实现足够快（n <= 90，m <= 20）；若扩展到更长窗口或实时流，可将 SMA 计算优化为滑动窗口累计法 O(n).
- 建议将 SMA 计算封装为纯函数（无副作用）并放置于 `utils/` 以便单元测试与复用。
- 图形路径构建应与主曲线共享坐标变换逻辑（使均线与主价位对齐）；在实现中以 `chartData` 为单一数据源并在同一 scale 下计算坐标。

文档更新
- 在 PRD 的测试计划与验收准则中新增本节的测试项。
- 在 README 或组件注释中记录均线的颜色/默认可见性与 API（如 `utils/movingAverage.ts` 的导出函数名称与参数说明）。

迁移/回退策略
- 若新增均线导致性能或视觉问题，可通过在 UI 层默认为关闭（visibleMAs 默认 {}）并仅在用户明确开启的情况下计算并渲染；或通过开关将均线渲染延迟到用户请求时再计算。
