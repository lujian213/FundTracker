# FundTracker — 产品需求文档 (PRD)

版本：1.33
最后更新：2026-03-29

---

简述
- FundTracker 是一款前端单页（SPA）应用，面向普通投资者，用于添加/管理自选基金/指数，展示实时估值、涨跌、历史净值趋势及交易记录管理（本地持久化），目标是快速构建可交付的前端版本（vibe coding 可直接实现）。

---

## 系统配置管理 (System Config Management) — 新增功能说明 (v1.32)

将目前系统中所有配置相关的功能进行整合和规范化管理。

### 界面入口
* 在主界面右上角新增系统配置图标按钮（齿轮图标 `fa-cog`），点击后进入系统配置界面。
* 移除原有的下拉菜单中的配置相关选项（备份设置、同步配置、AI配置、系统开关、数据同步）。

### 系统配置界面
* 界面形式：居中模态框，尺寸类似 OverallProfitModal（max-w-4xl，约64rem宽，90vh高）。
* 关闭方式：点击关闭按钮或点击背景。
* 布局结构：
  * 左侧：配置功能导航栏（200px宽度），包含4个导航项
  * 右侧：配置内容展示区，根据选中的导航项显示对应内容

### 导航项
1. **备份管理** - 包含自动备份设置和手动备份/导入功能
2. **同步管理** - Eggfund 账户配置和同步功能
3. **AI配置** - AI 模型配置管理
4. **系统开关** - 系统功能启用/禁用开关

### 备份管理
* 自动备份：时间设置（HH:mm 格式）、启用/禁用开关、倒计时显示
* 手动备份：导出备份按钮、导入备份按钮

### 同步管理
* 用户名/密码配置
* 测试连接按钮（界面内执行，2秒后自动消失）
* 立即同步按钮（点击后弹出同步确认框）

### AI配置
* 配置列表展示
* 添加/编辑/删除配置
* 从模板创建配置
* 激活配置管理

### 系统开关
* 初始价格调整开关（控制基金详情页的初始价格调整功能）
* 开关状态即时生效并持久化到 localStorage

### 实现细节
* 界面中的配置和动作行为与原有功能保持一致
* 系统配置界面的设计风格、布局和交互逻辑与主界面保持一致

---

## 初始价格调整功能 (Initial Price Adjustment) — 新增功能说明 (v1.31)

目前由于历史原因，现有基金的初始价格是不正确的。因此需要一个根据当前正确的盈利参考值，倒推每个基金的初始价格的功能。

### 界面入口
* 在每个基金详情页的工具栏上，显示一个"调整初始价格"的扳手图标按钮，点击后弹出初始价格调整窗口。
* 在系统配置界面的"系统开关"导航项中可控制该功能启用/禁用。
* 扳手图标按钮仅在以下条件同时满足时显示：初始份额 > 0，且系统开关中的功能已启用。

### 初始价格调整窗口
* 窗口标题为"调整初始价格"。
* 窗口采用三列布局，每行三项内容，左列标签固定宽度，其他列上下对齐。
* 第一排（只读）：
  * 目前盈利：只读输入框，正数显示红色，负数显示绿色，保留两位小数。
  * 当前价格：只读输入框，保留四位小数。
  * 目前初始价格：显示系统目前设置的初始价格。
* 第二排：
  * 参考盈利：输入框，用户可输入正确的盈利参考值，默认值为目前盈利值。正数显示红色，负数显示绿色，保留两位小数。
  * 参考价格：输入框，用户可输入正确的价格参考值，默认值为当前价格值，保留四位小数。
  * 建议初始价格：只读显示，根据用户输入的盈利参考值和价格参考值计算出的建议初始价格。若无法计算则显示"-"。
* 实时计算：用户输入参考盈利或参考价格时，建议初始价格实时更新。
* 窗口底部居中显示"保存"按钮。
* 窗口右上角有关闭按钮，点击后关闭窗口而不保存。

### 系统开关
* 在系统配置界面的"系统开关"导航项中控制。
* 包含"初始价格调整"功能的开关控制，默认关闭。
* 开关状态即时生效并持久化到 localStorage。

### 实现细节
* 计算公式：初始价格 = ((当前份额 × 参考价格) + 卖出总额 - 买入总额 - 参考盈利) / 初始份额
* 卖出总额和买入总额不包含今日交易，但使用今日估值计算。
* 建议初始价格若无法计算则显示"-"。

---

## 后台任务功能 (Background Job) — 新增功能说明 (v1.27)

后台任务功能主要是在后台进行一些AI相关的操作，能够定时获取基金相关的信息，并将这些信息存储到localStorage中，以便在界面上展示给用户。比如，基金相关市场的节假日提醒，交割日提醒等。

### 信息存储

#### alert_list字段
在基金Ticker中增加一个字段，叫做`alert_list`，存储基金相关的信息列表。这个字段是一个列表，其中每一项都是一个对象，包含以下内容：
* `type`：信息的类型，比如节假日信息（holiday），交割日信息（delivery）等。
* `date`：信息的生效日期，比如节假日的日期，交割日的日期等。
* `content`：信息的内容，比如节假日的名字，交割日的相关说明等。

#### recommended_strategy字段 (v1.29)
在基金Ticker中增加一个字段，叫做`recommended_strategy`，存储系统推荐的交易策略。对应到目前已有的一个虚拟交易策略。包含以下内容：
* `strategy_id`：交易策略的唯一标识符，可以用来在系统内查找这个策略的具体内容。
* `reason`：推荐这个交易策略的理由，可以是一些简短的文本说明。

后台任务会定时更新这些字段里的信息。

### 界面显示

#### Alert显示
如果基金的`alert_list`字段里有信息，在这些信息中找出生效日期在当前日期之后的3天以内的信息。如果有这样的信息，就在基金card上显示一个小图标，提示用户有相关的信息需要注意。图标位于基金card的右上角，位置在风险评级图标的右边。用户将鼠标悬停在这个图标上时，会显示一个tooltip，里面列出这些相关的信息的内容和生效日期。信息按照生效日期进行排序，最近的日期排在最前面。用bullet point的形式来展示这些信息。

后台任务对基金的`alert_list`字段进行更新时，会触发这个检查，并对基金card上的图标进行更新。比如，如果之前没有相关的信息，基金card上没有这个图标，当后台任务更新了`alert_list`字段，并且有相关的信息时，就会在基金card上显示这个图标。反之，如果之前有相关的信息，基金card上有这个图标，当后台任务更新了`alert_list`字段，并且没有相关的信息时，就会在基金card上隐藏这个图标。

#### 推荐交易策略显示 (v1.29)
如果基金的`recommended_strategy`字段里有信息：
* 在基金的虚拟交易窗口中，对应的交易策略的tab上显示一个推荐图标（星形），提示用户有推荐的交易策略。用户将鼠标悬停在这个图标上时，会显示一个tooltip，里面显示推荐这个交易策略的理由。
* 在投顾窗口的表格里，每个策略列后面单独增加一个图标列（无列名），用来显示可能的两个图标：推荐策略图标（星形）和最佳策略图标（大拇指）。推荐策略图标支持tooltip显示推荐理由。两个图标均采用上对齐方式显示。

### 后台任务
后台任务和目前系统中其他定时任务一样，由统一的调度器来管理。后台任务会定时调用AI功能，获取系统内所有基金的相关信息，并将这些信息更新到基金的`alert_list`字段中。更新按照信息的类型来进行增加、修改或删除。简单来说就是以信息的类型为key来更新。每个后台任务都对应一个信息类型x。
* 如果获取到基金A的信息，则在A的`alert_list`字段里，找到type为x的信息，如果找到了，就更新这个信息的date和content；如果没有找到，就在`alert_list`里增加一个新的对象，包含type为x，date和content。
* 如果没有获取到基金A的信息，则在A的`alert_list`字段里，找到type为x的信息，如果找到了，就删除这个信息；如果没有找到，就不做任何操作。

#### 节假日信息
* 后台任务信息类型：`holiday`
* 执行频率：每6个小时执行一次。页面刷新时也会触发一次。
* 信息对象填充：
  * `type`: `"holiday"`
  * `date`: AI获取到的最近的节假日的开始日期（holiday_date_start）
  * `content`: AI获取到的节假日的相关说明（explanation）

#### 交割日信息
* 后台任务信息类型：`delivery`
* 执行频率：每6个小时执行一次。页面刷新时也会触发一次。
* 信息对象填充：
  * `type`: `"delivery"`
  * `date`: AI获取到的最近的交割日（delivery_date）
  * `content`: AI获取到的交割日的相关说明（explanation）

#### 推荐交易策略信息 (v1.29)
* 后台任务信息类型：`strategy`
* 执行频率：每6个小时执行一次。页面刷新时也会触发一次。
* 信息对象填充：直接将AI获取到的推荐交易策略的唯一标识符填充到`recommended_strategy`字段的`strategy_id`中，将推荐理由填充到`reason`中。
* 错误处理：如果后台任务出错或未配置AI或没有API-Key，保留已有的推荐策略信息，不进行更新。错误信息在市场热点区域显示。

### 实现细节
* 提示词模板放在一个配置文件中（`public/assets/config/background-job-prompts.json`），方便将来的修改和扩展。模板中可以使用一些预定义好的变量：如基金代码列表（code_list）、当前日期（current_date）、交易策略列表（strategy_list）等。
  * strategy_list中的每个交易策略应该包含策略id、策略名称、策略描述等信息，以便在提示词中使用。
* 如果后台任务出错或未配置AI或没有API-Key，也要像其他定时任务一样在市场热点区域显示错误，并打印出错信息到console。
* 类型定义：
  * `TickerAlert { type: 'holiday' | 'delivery'; date: string; content: string }`
  * `RecommendedStrategy { strategy_id: string; reason: string }`
* 组件：
  * `AlertTooltip` - 显示alert图标的tooltip
  * `SimpleTooltip` - 显示推荐策略理由的tooltip
* 服务：
  * `services/backgroundJobService.ts` - 后台任务服务，包含`refreshTickerAlerts`函数
  * `services/strategyRecommendationService.ts` - 推荐策略服务，包含`refreshStrategyRecommendations`函数
- `ALERT_VISIBILITY_DAYS = 3`：alert显示的日期范围（天）

### 日历功能 (Calendar) — v1.33

#### 信息存储

在系统中增加一个全局的calendar对象，存储相关的节假日信息和交割日信息。这个信息会被储存在localStorage中，并且会被定期更新。
* 存储key：`fund_tracker_calendar`
* 数据结构：字典，key是日期（YYYY-MM-DD格式），value是一个列表，列表里每个元素都是一个描述这个日期的事件对象（calendar_event），包含以下内容：
  * `type`：事件的类型，可选值包括：
    * `holiday_china`（显示值为"节假日"）
    * `holiday_hk`（显示值为"节假日"）
    * `holiday_us`（显示值为"节假日"）
    * `delivery`（显示值为"交割日"）
  * `content`：事件的内容，简要描述
  * `description`：事件的详细描述
  * `market`：市场信息（如"A股"、"港股"、"美股"），可选

#### 界面显示

在主界面的右上角，增加一个Calendar图标按钮，位于系统配置图标的左边。用户点击这个图标后，会弹出一个日历窗口。

##### 日历窗口
* 窗口形式：居中模态框，尺寸约1100px宽，680px高。
* 默认显示当前月份的日历，并在日历上突出显示当前日期。
* 窗口内可以显示本年内的节假日信息和交割日信息。
* 用户可以通过点击左右箭头或下拉选择框来切换不同月份的日历。
* 窗口内提供"今日"按钮，点击后立即跳转到当前日期所在的月份。

##### 日期格子显示
* 每个日期格子显示日期数字。
* 如果该日期有相关事件（节假日或交割日），在日期下方显示对应的事件图标和简要内容。
* 同一日期有多个事件时，显示多个图标和内容（最多4条，超出显示"+N"）。
* 事件图标颜色：
  * 节假日：红色圆点
  * 交割日：橙色圆点

##### 事件提示（Tooltip）
* 用户将鼠标悬停在有事件的日期格子上时，显示一个tooltip。
* tooltip内容按事件类型分类展示：
  * 先展示节假日信息（红色标题）
  * 再展示交割日信息（橙色标题）
* 每条信息显示市场标签（如果有）、描述内容。

##### 即将到来的事件提示
* 如果今日起三天内（不包含今天和周末）有节假日或交割日信息，在日历图标上显示一个小红点。
* 在日历窗口顶部显示即将到来的事件列表，包含日期和简要内容。

#### 后台任务（Calendar相关）

后台任务在每个节假日任务执行结束后，会自动计算并更新交割日信息。

##### 节假日信息_A股（calendar_holiday_china）
* 后台任务信息类型：`calendar_holiday_china`
* 数据来源：AI分析 https://www.sse.com.cn/disclosure/dealinstruc/closed 网页内容
* 执行频率：每天执行一次。页面刷新时也会触发一次。
* 信息对象填充：
  * `type`: `"holiday_china"`
  * `content`: 如"春节休市"
  * `description`: 如"中国，春节假期，休市1天"
  * `market`: "A股"

##### 节假日信息_港股（calendar_holiday_hk）
* 后台任务信息类型：`calendar_holiday_hk`
* 数据来源：AI分析 https://invest101.com.hk/hong-kong-stock-market-holiday 网页内容
* 执行频率：每天执行一次。页面刷新时也会触发一次。
* 信息对象填充：
  * `type`: `"holiday_hk"`
  * `content`: 如"春节休市"
  * `description`: 如"香港，春节假期"
  * `market`: "港股"
* 注意：若假期为半日市，在content和description中注明"半日市"

##### 节假日信息_美股（calendar_holiday_us）
* 后台任务信息类型：`calendar_holiday_us`
* 数据来源：AI分析 https://invest101.com.hk/stock-us-holidays 网页内容
* 执行频率：每天执行一次。页面刷新时也会触发一次。
* 信息对象填充：
  * `type`: `"holiday_us"`
  * `content`: 如"独立日休市"或"感恩节提前休市"
  * `description`: 如"美国，独立日假期"
  * `market`: "美股"
* 注意：提前休市或提前收盘的日期也需要列出

##### 交割日信息（calendar_delivery）
* 此任务不需要在定时器内注册和执行，而是在其他calendar相关的后台任务执行结束后，作为子任务被调用。
* 计算规则：基于已更新的节假日信息，计算各市场的交割日：

| 市场 | 合约类型 | 固定规则 | 说明 |
|-----|---------|---------|------|
| A股 | 中金所股指期货/期权交割日 | 每月第三个星期五 | 遇法定节假日顺延至下一交易日 |
| A股 | 上交所/深交所ETF期权交割日 | 每月第四个星期三 | 遇法定节假日顺延 |
| A股 | 富时中国A50指数期货（SGX） | 每月倒数第二个营业日 | 新加坡交易所规则 |
| 港股 | 恒指/H股/科指期货及期权（月度）交割日 | 合约月份倒数第二个营业日 | 港交所固定规则 |
| 美股 | 月度期权到期日 | 每月第三个星期五 | 个股、ETF、指数期权月度到期 |
| 美股 | 三巫日（季度） | 3、6、9、12月的第三个星期五 | 股指期货+股指期权+个股期权同时到期 |

* 信息对象填充：
  * `type`: `"delivery"`
  * `content`: 合约类型和交割日的简要内容，如"中金所股指期货交割日"
  * `description`: 合约类型和交割日的相关说明，如"每月第三个星期五，遇法定节假日顺延至下一交易日"
  * `market`: 对应市场信息，如"A股"、"港股"、"美股"

#### 更新逻辑

Calendar数据更新按照以下规则进行：
1. 扫描calendar对象里有记录的日期，删除该日期对应列表里所有type为holiday_china/holiday_hk/holiday_us/delivery的事件，以及系统不支持的事件类型的事件
2. 将AI获取到的新事件添加到对应日期的列表中
3. 删除所有没有任何事件的日期

#### 实现细节

* 组件：`CalendarModal` - 日历弹窗组件
* 服务：`services/calendarService.ts` - 日历数据服务
* 数据加载：按年加载，使用`getEventsForYear`函数
* 提示词模板：`public/assets/config/background-job-prompts.json`

---

## 交易管理增强 (Trade Enhancement) — 新增功能说明 (v1.26)

在基金的交易管理窗口内，下方的交易历史表格中，增加不同视图的功能。可以通过选择不同的视图来观察交易历史数据。

### 功能入口
在基金的交易管理窗口内下方的交易历史表格中，"交易记录（最近在上）"文字的右侧，增加三个radio按钮，分别命名为"普通视图"、"先进先出"、"后进先出"。默认选中"普通视图"。

### 表格基本结构
表格内的表头有以下列：日期、操作，数量、价格、交易额、手续费、盈利率、盈利额、action（占位，实际上不显示文字）。
每一行中的数据对应数据集合（dataSet）中每一条交易记录（record）的以下字段：
* 日期：对应交易记录的日期。格式为yyyy/MM/dd。
* 操作：对应交易记录的操作类型，买入，卖出或建仓。
* 数量：对应交易记录的数量。
* 价格：对应交易记录的价格。保留四位小数。
* 交易额：对应交易记录的交易额。
* 手续费：对应交易记录的手续费。如为0，则显示"-"。
* 盈亏率：对应交易记录的盈亏率，以百分比形式展示。负数以绿色展示，正数以红色展示。如为0，则显示"-"。
* 盈亏额：对应交易记录的盈亏额。负数以绿色展示，正数以红色展示。如为0，则显示"-"。
* action：占位列，不显示任何文字。该列的作用是为了在表格中占位，方便后续增加操作按钮等功能。

行的背景色：
* 买入：淡绿色背景。
* 卖出：淡红色背景。
* 建仓：淡蓝色背景。

其他要求：
* 表中记录按照日期降序排列，最近的交易记录在最上面。
* 表中数字列连同表头右对齐，文字列连同表头左对齐。
* 表中所有数字如无特殊说明，保留两位小数。以千分位分隔符展示。
* 表格一页展示10条数据，超过10条数据时分页展示。每页即使不到10条数据，表格也要保持表头和10行数据的格式。避免表格行数随数据量变化而变化，保持表格的整体结构稳定。
* 表格中的记录支持鼠标点击（单个选中），拖动（连续多选），Shift键+单击（连续多选），Ctrl+单击（非连续多选）选中，选中后，相关记录要能够和未选中记录进行区分（蓝色边框高亮），统计选中的所有买入/持仓记录的数量总和，并在表格下方信息显示区显示选中的买入/持仓记录条数和数量总和。以黑色字体展示。在表格外点击，则取消所有选中记录的选中状态，并清空表格下方信息显示区的内容。
* 表格下方对数量进行合计展示，合计行的背景色为灰色，合计行的日期列显示"合计"，其他列显示"-"。
  * 数量列的合计值为所有买入和建仓记录的数量总和减去所有卖出记录的数量总和。颜色为黑色。
  * 合计行不参与分页展示，始终显示在表格下方。也不占用表格的10条数据展示的行数。也就是说，表格每页展示10条数据之外，合计行始终显示在下方，不占用这10条数据展示的行数。
* 表格下方左边显示总记录条数和页数信息，例如"共25条记录 第 1 / 3 页"。中间部分为信息显示区（显示错误和其他信息），用来显示视图中的错误信息。右边显示分页控制组件，包括"上一页"、"下一页"按钮。分页控制组件根据当前页数和总页数的情况，动态调整按钮的可用状态。例如，在第一页时，"上一页"按钮不可用；在最后一页时，"下一页"按钮不可用。

### 普通视图
#### 数据集合
dataSet对应交易历史数据集合和建仓信息，包含所有的交易记录+建仓记录。

交易记录的各个字段取值如下：
* 日期：交易日期。格式为yyyy/MM/dd。
* 操作：买入或卖出。
* 数量：交易数量。
* 价格：交易价格。保留四位小数。
* 交易额：计算字段，如果是买入，则为交易数量*交易价格+手续费；如果是卖出，则为交易数量*交易价格-手续费。
* 手续费：交易记录中的手续费字段值。
* 盈亏率：计算字段，基金估值（经过getValuation增强过的currentPrice）-交易价格/交易价格。若为卖出记录，则为0。
* 盈亏额：计算字段，盈亏率*交易数量。若为卖出记录，则为0。
* action：编辑按钮和删除按钮。编辑按钮点击后可以编辑该条交易记录，删除按钮点击后可以删除该条交易记录。

建仓记录的各个字段取值如下：
* 日期：建仓日期。格式为yyyy/MM/dd。
* 操作：建仓。
* 数量：建仓数量。
* 价格：建仓价格。保留四位小数。
* 交易额：计算字段，建仓数量*建仓价格。
* 手续费：0。
* 盈亏率：0。
* 盈亏额：0。
* action：无内容。

### 先进先出视图
#### 数据集合
原始数据集合（rawDataSet）对应交易历史数据集合和建仓信息，包含所有的交易记录+建仓记录。
对rawDataSet进行处理：
1. 按先进先出原则对rawDataSet中的交易记录进行处理，生成新的数据集合dataSet。处理逻辑如下：
* 对rawDataSet中所有的记录，按照日期升序排列，生成交易记录列表dataSet（包含建仓记录）。
* 遍历交易记录列表中的每一条交易记录，按照先进先出原则匹配记录列表dateSet中的记录，计算盈亏率和盈亏额，并将计算结果填充到交易记录中。匹配逻辑如下：（因为对建仓记录和买入记录的处理方式相同，所以统称为买入记录）
  * 如果交易记录是买入记录，不做任何处理，直接跳过。
  * 如果交易记录是卖出操作，则从列表头开始，直到该卖出记录的前面的最后一条买入记录为止，对所有的买入记录进行匹配，直到卖出数量被完全匹配（或再无记录可被匹配）。对于每一个匹配的买入记录，计算份额，手续费，并将计算结果填充到交易记录中。匹配过程中，按照以下规则进行：
    * 如果卖出份额大于买入记录份额，则将该买入记录完全匹配，卖出份额减去建仓/买入份额，继续匹配下一个买入记录。原来的买入记录被完全匹配后，份额，手续费都变为0。
    * 如果卖出份额小于或等于买入记录份额，则将该买入记录部分匹配，匹配结束。原来的买入记录被部分匹配后，份额，手续费都按照比例进行计算（对冲）。
    * 如果匹配结束后，卖出份额仍然大于0，则说明数据异常，记录异常信息，提示用户检查数据的正确性。将该条卖出记录的份额置为对冲后剩余的卖出份额和手续费按照比例进行计算。
    * 如果匹配结束后，卖出份额为0，则说明匹配成功。
    * 继续处理下一条交易记录。
2. 在dataSet中，过滤掉所有份额为0的记录。因为这些记录已经被完全匹配了，不需要再展示了。
3. 将现在的dataSet按照普通视图里的操作进行处理。唯一的区别是，无需在action列展示编辑按钮和删除按钮了，因为这个视图是只读的。

### 后进先出视图
#### 数据集合
原始数据集合（rawDataSet）对应交易历史数据集合和建仓信息，包含所有的交易记录+建仓记录。
对rawDataSet进行处理：
1. 按后进先出原则对rawDataSet中的交易记录进行处理，生成新的数据集合dataSet。处理逻辑如下：
* 对rawDataSet中所有的记录，按照日期升序排列，生成交易记录列表dataSet（包含建仓记录）。
* 遍历交易记录列表中的每一条交易记录，按照后进先出原则匹配记录列表dataSet中的记录，计算盈亏率和盈亏额，并将计算结果填充到交易记录中。匹配逻辑如下：（因为对建仓记录和买入记录的处理方式相同，所以统称为买入记录）
  * 如果交易记录是买入记录，不做任何处理，直接跳过。
  * 如果交易记录是卖出操作，则从该卖出记录的前面的最后一条买入记录开始，直到列表中的第一条买入记录为止，对所有的买入记录进行匹配，直到卖出数量被完全匹配（或再无记录可被匹配）。对于每一个匹配的买入记录，计算份额，手续费，并将计算结果填充到交易记录中。匹配过程中，按照以下规则进行：
    * 如果卖出份额大于买入记录份额，则将该买入记录完全匹配，卖出份额减去建仓/买入份额，继续匹配下一个买入记录。原来的买入记录被完全匹配后，份额，手续费都变为0。
    * 如果卖出份额小于或等于买入记录份额，则将该买入记录部分匹配，匹配结束。原来的买入记录被部分匹配后，份额，手续费都按照比例进行计算（对冲）。
    * 如果匹配结束后，卖出份额仍然大于0，则说明数据异常，记录异常信息。将该条卖出记录的份额置为对冲后剩余的卖出份额和手续费按照比例进行计算。
    * 如果匹配结束后，卖出份额为0，则说明匹配成功。
    * 继续处理下一条交易记录。
2. 在dataSet中，过滤掉所有份额为0的记录。因为这些记录已经被完全匹配了，不需要再展示了。
3. 将现在的dataSet按照普通视图里的操作进行处理。唯一的区别是，无需在action列展示编辑按钮和删除按钮了，因为这个视图是只读的。

### 实现细节
* 各种视图的处理非常类似，唯一的区别就是匹配算法不同。可以将匹配算法抽象成一个抽象函数。这样可以避免代码重复，提高代码的可维护性。新的视图只要实现这个抽象函数，就可以得到正确的结果了。
  * 普通视图的匹配函数可以认为是懒惰匹配，直接什么都不处理。
  * 匹配算法可能还要考虑错误信息的记录。
* 因为当前估值可能会有变化，窗口内的估值显示，以及估值变化后对表格内的数据（主要是盈利率和盈利额）都要及时刷新。因为估值不对匹配算法产生影响，所以，可能对当前视图，不需要重新执行匹配算法，只需要对表格内的数据重新计算刷新即可。切换视图，反正是整体重新计算。另外增加，修改，删除交易记录都会对数据集产生影响，需要重新计算和展现。
* 切换视图时，请始终显示回到第一页。因为不同视图的数据量可能不同，页数也不同，所以切换视图时，回到第一页可以避免很多边界情况的处理。

---

## 投资草稿本 (Investment Draft) — 新增功能说明 (v1.23)

### 投资草稿本
投资草稿本是给用户用来记录当天的投资计划的工具。用户可以在投资草稿本中记录今天的投资计划（买入/卖出多少金额，折算份额多少）。为了方便用户做计划，
还应该在界面上显示基金的当日估值，前一个确认净值，以及估值与前一个确认净值的盈亏百分比。用户可以根据这些信息来做投资计划。
* 投资草稿本只保存当天的信息，第二天会自动清空。用户的输入自动保存到本地，用户关闭窗口后再次打开时可以看到之前输入的内容。
* 内容可以以文本形式复制到系统剪贴板，方便用户粘贴到其他地方。

#### 界面入口
* 在主页上增加一个草稿本按钮，放在投顾按钮后面，点击后打开投资草稿本窗口。

#### 投资草稿本窗口
* 显示一个表格，表格的每一行都是一个在系统里配置了仓位（有满仓份额数据）的基金，第一列表头是"基金名称"，第二列是实时估值，第三列是前值，第四列是涨跌幅，第五列是操作，第六列是金额，第七列是份额，第八列空白：
  * 基金名称列显示基金的名称，点击后可以跳转到该基金的详情页。如果名称太长，显示时可以截断，但hover时显示完整名称。与其他地方的处理一样。
  * 实时估值列显示该基金的当日估值，保留四位小数，没有估值的基金显示为"-"。
  * 前值列显示该基金的前一个确认净值，保留四位小数。没有前值的基金显示为"-"。
  * 涨跌幅列显示该基金的估值与前一个确认净值的盈亏百分比，保留两位小数，以百分号显示。盈亏百分比为正数时显示为红色，负数时显示为绿色。没有估值或前值的基金显示为"-"。
  * 操作列显示一个下拉菜单，用户可以选择"买入"、"卖出"或"不操作"。默认选择为"不操作"。
  * 金额列显示用户输入的金额，保留两位小数，以千分位分隔符显示。只有当操作列选择了"买入"或"卖出"时，金额列才允许输入，否则显示为"-"。
  * 份额列显示根据用户输入的金额和该基金的估值计算出的份额，保留两位小数，以千分位分隔符显示。只有当操作列选择了"买入"或"卖出"时，份额列才显示计算结果，否则显示为"-"。如果估值不可用，则份额列显示为"-"。
  * 最后一列显示一个重置按钮，点击后可以清空该行的操作、金额和份额输入，恢复到默认状态。
* 表格上方右侧显示一个复制图标，点击后将表格中的内容以文本形式复制到系统剪贴板。复制的内容格式如下：
* 表格下方右侧显示以下四列信息。在同一行显示。列宽固定。总额以千分位分隔符显示，保留两位小数。
    * 买入基金个数，"买入基金：X只"，其中X是操作列选择了"买入"的基金数量。
    * 买入总额，"买入总额：Y元"，其中Y是操作列选择了"买入"的基金的金额之和。
    * 卖出基金个数，"卖出基金：Z只"，其中Z是操作列选择了"卖出"的基金数量。
    * 卖出总额，"卖出总额：W元"，其中W是操作列选择了"卖出"的基金的金额之和。

```
今日操作

基金名称1:买入/卖出 金额
基金名称2:买入/卖出 金额
```

例如:
```
天弘中证新能源指数增强A:买入 10,000.00
建信深证100指数增强:卖出 10,000.00
```

#### 注意要点
* 投资草稿本只保存当天的信息，第二天会自动清空。无需保留历史数据。理论上，只在localStorage中保存当天的数据，第二天自动覆盖即可。
* 用户的输入自动保存到本地，用户关闭窗口后再次打开时可以看到之前输入的内容。
  * 实现上可以在用户每次修改操作、金额或份额时，立即将当前表格数据保存到localStorage中。
  * 可以在光标离开输入框时也保存一次，以防止用户修改后没有触发保存。
  * 投资草稿本窗口关闭时，也要保存一次当前数据。
  * 当用户点击链接到基金详情页时，也要保存一次当前数据，以防止用户修改后没有触发保存。
* 如果投资计划草稿窗口打开情况下，数据缓存里相关有实时估值，前值的任何变化，在表格里立刻体现，并重新计算其他信息，比如涨跌幅，份额换算，统计信息等

---

## 虚拟交易 (Virtual Trade) — 新增功能说明 (v1.19)

概述
- 虚拟交易功能利用预定义的交易策略，模拟用户在真实市场中的交易行为。用户可以通过虚拟交易功能回测和优化交易策略，而无需承担实际资金风险。

设计原则与假设
- 每日限制：虚拟交易每天最多进行一笔交易（0 或 1）。
- 策略固定：交易策略的算法和逻辑由系统预置，用户仅能查看不可修改。
- 性能优化：回测计算需覆盖从开始日期到当前日期的完整序列，应重用前一日结果以优化性能。

界面入口
- 在基金详情页（`FundDetailsModal`）新增”虚拟交易”按钮，点击进入虚拟交易配置与展示界面（`VirtualTradeModal`）。

核心输入与逻辑
- **现有现金**：默认 100,000 元。输入支持千分位分隔符，系统自动处理，保留两位小数且必须 >= 0。
- **开始日期**：
    - 默认值：该基金的建仓日期（若配置了初始仓位起始日期）；若无，则默认为 90 天前。
    - 约束：必须是历史日期，且不能早于基金历史净值的最早日期。
    - 联动：修改开始日期时，会触发”现有份额”默认值的更新。
- **现有份额**：
    - 默认值：取”开始日期”对应日期的真实持仓份额（使用项目统持仓计算逻辑）。若该日期份额为 0 或缺失，则默认为 `100,000 / 开始日期净值`。
    - 用户可手动修改覆盖默认值。
- **辅助显示**：
    - **当时市场价值**（红色小字）：显示在份额下方。`当时市场价值 = 现有份额 * 开始日期净值`。
    - **实盘盈亏**（蓝色小字）：若开始日期 >= 基金建仓日期，显示实盘盈亏（从开始日期至今的真实持仓盈亏，使用项目统一盈亏算法）。正数显示红色，负数显示绿色。
- **重置功能**：一键重置日期、份额、现金为系统默认计算值。

交易策略展示与交互
- **策略 Tab**：每个预置策略对应一个 Tab，Tab 标题为策略名称，Hover 显示策略原理。
- **大拇指奖杯**：计算完成后，在”策略总盈亏”最高的策略 Tab 标题后增加 👍 图标，并默认自动切换到该 Tab。如有并列，优先首个；若皆为 0 且无交易则不显示。
- **今日交易提示**：各策略 Tab 内需显示基于最新估值的”今日建议操作”（买入/卖出/不操作）及建议数量。

历史交易表格与指标
- **交易表格**：展示自开始日期至当前日期前一天的逐日结果（按日期降序，默认滚动到底部）。
    - 字段：日期 (YYYY-MM-DD)、方向、净值、交易数量、交易金额 (数量 * 净值)、交易后现金、交易后份额、交易后总资产、较前日盈亏、累计盈亏。
    - 资产计算逻辑：`交易后总资产 = 交易后现金 + 交易后份额 * 后一日基金净值`（若为最后一日则使用今日实时估值）。
    - 初始总资产：`现有现金 + 现有份额 * 开始日期净值`。
- **策略总盈亏**：`最后一日总资产 - 初始总资产`，并显示盈利率 `%`。

预置交易策略（`services/strategyConfig.ts``）
1. **趋势追踪策略 (Trend Following)**：基于均线金叉死叉。当短均线 (5日) 上穿长均线 (20日) 时买入，下穿时卖出。
2. **均值回归策略 (Mean Reversion)**：基于布林带。价格触及下轨 (20日均线 - 2倍标准差) 视为超卖买入，触及上轨视为超买卖出。
3. **恒定混合策略 (Constant Mix)**：股债平衡。维持基金仓位占总资产 50%。当偏离度超过 5% 时触发再平衡，实现高抛低吸。
4. **固定金额正金字塔买卖策略 (Fixed Amount Pyramid)**：采用固定金额方式执行金字塔式建仓和平仓操作。当净值下跌时以固定金额买入更多份额，当净值上涨时以固定金额卖出部分份额，帮助投资者在低位积累更多份额，在高位锁定利润。参数包括：初始净值参考（${fundConfig.initialPrice || 1.0}）、下跌触发幅度（3%）、上涨触发幅度（3%）、固定买入金额（10000元）、固定卖出金额（10000元）、最大仓位（${fundConfig.maxPosition || 100000}）、最小现金储备（${userConfig.minCashReserve || 1000}）。

测试要求
- 单元测试：对各策略类（`trendFollowing.ts`, `meanReversion.ts`, `constantMix.ts`, `fixedAmountPyramid.ts`）进行逻辑覆盖。
- 集成测试：验证 `VirtualTradeModal` 的输入联动、Tab 切换逻辑以及 👍 图标的分配正确性。

---

## 投资提示 (Investment Notice) — 新增功能说明 (v1.20)

概述
- 投资提示功能通过自动执行所有基金的虚拟交易策略，生成投资建议并集中展示。用户可快速浏览各基金在不同策略下的表现和操作建议，辅助投资决策。

界面入口
- 在主界面顶部菜单栏中，”交易”按钮之后新增”投顾”按钮（图标可使用 💡 或 📊），点击后自动计算所有基金的虚拟交易结果并打开投资提示窗口。

虚拟交易执行与数据收集
- **批量执行**：对 portfolio 中的所有基金自动执行预设的交易策略，使用各基金的默认参数（与 `VirtualTradeModal` 中的默认参数一致）。
- **数据汇总**：计算每个基金在每个策略下的盈亏总金额、今日提示（操作类型及份额）等关键指标。
- **数据过滤**：过滤掉所有策略下今日提示均为”不操作”的基金，只展示存在操作建议的基金。

投资提示窗口（`InvestmentNoticeModal`）
- **窗口布局**：采用 `createPortal` 创建的模态窗口，样式与其他 Modal 保持一致（固定定位、遮罩层、最大宽度等）。
- **信息表格**：
  - 表格头部：第一列为”基金名称”，后续各列为各交易策略名称（趋势追踪、均值回归、恒定混合等），最后一列为”实盘盈亏”。
  - 基金名称列：显示基金名称（带代码），支持点击跳转至该基金详情页；名称过长时截断显示，hover 显示完整名称。
  - 策略列：显示该基金在对应策略下的**策略总盈亏**（格式：如”策略总盈亏：1,234.56”，正数红色，负数绿色）**和今日提示**（如”买入 1234.56”或”-”），操作类型用颜色区分（买入-绿色，卖出-红色，不操作-灰色”-”）。**策略总盈亏与今日提示分别显示在两行**。
  - 策略链接：每个策略的**今日提示内容**添加超链接，点击可直接跳转到该基金的虚拟交易窗口。
  - 最佳策略标识：若某基金在某策略下的盈亏总额为**所有策略中最高（包括不操作策略）**，该策略提示旁显示 👍 图标。
  - 实盘盈亏列：显示该基金的真实持仓盈亏金额（保留两位小数，千分位分隔符），正数红色，负数绿色，无数据时显示”-”。
  - 表格底部：显示”总计：n条记录”，其中 n 为表格中基金的数量。
- **滚动与固定元素**：
  - 表格最多显示10行记录，超出部分通过滚动条查看。
  - 表头和表尾固定，滚动时保持可见。
- **免责声明**：表格上方显示文本：”以下是根据预设的交易策略计算出的投资提示，供您参考。请注意，虚拟交易的结果仅供参考，实际投资决策请谨慎考虑。”

性能与用户体验
- **异步计算**：虚拟交易批量执行采用异步方式，避免阻塞主线程；窗口显示”正在计算投资建议...”加载状态。
- **结果缓存**：计算结果可在内存中适当缓存（生命周期与窗口一致），避免重复计算；当基础数据（如基金净值、交易记录）发生变化时清除缓存。

测试要求
- 单元测试：验证 `InvestmentNoticeModal` 的数据获取与展示逻辑、策略链接跳转功能、表格渲染。
- 集成测试：验证”投顾”按钮触发逻辑、虚拟交易批量执行、投资建议准确性。

---

## 基金持有总金额趋势图（Position Trend） — 新增功能说明（v1.17）

概述
- 新增“基金持有总金额趋势图”，用于展示 portfolio 中所有已配置持仓基金随时间变化的持有总金额（按日粒度）。用户可从持仓页面的“市场总价值”右侧放大镜按钮打开趋势弹窗查看。

界面入口
- 在 `PositionsModal`（基金持仓弹窗）中，市场总价值数值后增加一个放大镜图标按钮（辅助可识别 data-testid），点击打开趋势图模态窗口（Trend Modal）。

数据来源与计算规则
- 基金 A 在 x 日的持有金额 = 基金 A 在 x 日的持仓数量 × 基金 A 在 x 日的估值/净值（估值优先，若当日无估值/净值则沿用最近的前一个可用估值/净值）。
- 基金 A 在 x 日的持仓数量 = 初始仓位（`fund_position_{symbol}.initialPosition`） + 截止到 x 日的所有买入份额和 − 截止到 x 日的所有卖出份额（交易汇总基于 `fund_trades` 存储，按日期累加）。
- 所有持仓基金在 x 日的持有总金额 = 所有被视为“有持仓配置”的基金在 x 日持有金额之和；“有持仓配置”指 `fund_position_{symbol}.fullCapacity > 0`（即该基金已配置持仓），不以当前份额是否为 0 作为排除条件。
- 时间范围：x 轴从所有持仓基金的最早持仓时间开始（按 `fund_position_{symbol}.startDate` 的最早值；若无配置 startDate 则回退到交易或历史数据的最早日期），到当天为止（local date，YYYY-MM-DD）。

数据处理细节
- 估值优先：计算时优先使用 `cacheService.getValuation(symbol)` 中的 `currentPrice` / `previousPrice`；若未命中，再使用历史净值时间序列（`cacheService.getHistory(symbol)`）的对应日期值，若仍未命中则向前回退至最近的已知价格。
- 交易累计：交易读取使用统一的 `fund_trades` 键（通过 `hooks/useTrades.getTradesForSymbol`），按日期升序累加以得到每日持仓份额序列。
- 最后一个点一致性：趋势图最后一个点应使用与 `PositionsModal` 汇总相同的实时估值来源（由调用方在打开趋势 modal 时将当前 `marketData` 作为 override 传入趋势计算逻辑），以保证图表的最后一点与界面上显示的“市场总价值”一致。

数据展示与交互
- 折线图：图中显示 portfolio 所有持仓基金的总市值随日期变化的曲线（折线 + area 填充可选）。
- x 轴：日期格式统一为 `yyyy-MM-dd`（本地时间），刻度从最早持仓日期到当日；刻度字体比主文小一号。
- y 轴：仅显示数值（不带“元”单元），刻度四分位显示，精确到个位数并四舍五入，字体比主文小一号；图表左侧留出足够空间（至少能显示 12 个字符）用于显示千分位后的数字，不发生截断或重叠。
- 相邻相同值压缩：若相邻日期的持有总金额完全相同，则在图上只显示为一个点（保留该连续段的首个日期点），以减少点的密度并提高可读性。
- Hover 交互：鼠标 hover 在某一日期时显示竖直虚线，并在图下方的预留信息区域以 hovertip/信息栏形式显示该日期（yyyy-MM-dd）与对应的持有总金额（千分位，精确到小数点后 2 位）。下方信息区列宽固定，字体缩小一号，避免 hover 时图表抖动。
- 交易 marker：趋势图只展示持仓总额，不需要单独的交易 marker（交易 marker 属于基金详情/历史趋势图的职责）。

性能与缓存
- 数据计算放在 hook 层（`hooks/usePositionTrend`）或服务层完成，图表组件仅负责渲染，遵循“数据与展示分离”。
- 如果序列点数量超过阈值（例如 500），应采用 LTTB 等下采样算法以保证渲染性能；下采样应在渲染层之前完成，且保留首尾点。
- 数据量上限假设：单次计算的数据点不会超过 3000 条（基于你的说明），因此内存与计算成本处于可控范围。

测试要求
- 单元测试：补充 `tests/utils/positionTrend.*.test.ts`，覆盖：
  - 基本聚合（初始仓位 + 交易累计 + 估值对齐）生成正确的每日总市值序列；
  - 相邻相同值压缩行为（连续相同 value 的段只保留首点或按约定保留首尾）;
  - 当传入 `valuationsOverride`（来自 `PositionsModal.marketData`）时，趋势序列的最后点使用 override 值。
- 集成测试：在 `tests/components/PositionsModal.test.tsx` 中加入：点击放大镜会打开趋势 modal，modal 内折线图渲染并且最后一点与 PositionsModal 的 `totalMarketValue` 在数值上相等（允许小范围四舍五入差异）。

注意事项
- 遵循项目中已定义的本地日期规范（所有日期显示/比较均使用本地 YYYY-MM-DD 字符串，避免时区偏差）。
- 图表组件 `HistoryChart` 的接口保持通用，其他模块（如日内趋势图）继续复用以保证一致性。若未来需要更复杂的压缩策略（例如保留平坦线段的首尾两个端点以保留形状），可将压缩策略参数化。

---

# FundTracker — 产品需求文档 (PRD)

版本：1.17
最后更新：2026-03-10

---

简述
- FundTracker 是一款前端单页（SPA）应用，面向普通投资者，用于添加/管理自选基金/指数，展示实时估值、涨跌、历史净值趋势及交易记录管理（本地持久化），目标是快速构建可交付的前端版本（vibe coding 可直接实现）。

---

## 深度刷新（Deep Refresh） — 新增功能说明（v1.16）

概述
- 在主界面右上角刷新按钮的右侧新增“深度刷新”按钮（图标按钮，数据测试 id: `deep-refresh-button`）。点击后会在后台强制刷新所有 portfolio 中基金的历史净值（调用 `forceFetchFundHistory(symbol)`），该过程为非阻塞（不改变页面级的 `isRefreshing`），并在顶部显示短暂 toast 以提示用户“已启动 / 完成 / 失败”。

设计与行为细节
- 位置与可见性：按钮位于原有刷新按钮右侧，桌面端始终显示为图标按钮以节省空间；可通过 data-testid 查询（便于自动化测试）。
- 后台执行：点击后使用并发池（与 `runBatchHistoryUpdate` 保持一致的并发策略）在后台顺序/并发发起 `forceFetchFundHistory` 调用，不阻塞 UI 线程；界面通过 `backgroundTasks` 计数显示同步链路活跃状态。
- 用户反馈：按钮触发后立刻显示短暂 toast（`深度刷新已启动（后台进行）`），完成/失败时更新为对应提示并短暂展示（约 3 秒）。
- 错误处理：对单个 symbol 的刷新失败不会中断其它 symbol 的刷新；所有错误被局部捕获并在后台记录，必要时可在后续版本中在日志/调试界面展示详细失败原因。

自动历史补全触发（估值驱动）
- 为减少历史数据滞后带来的误差，新增一条“估值驱动的自动历史补全”规则：当 `fetchFundData(symbol)` 返回的 `netWorthDate`（字符串，格式 YYYY-MM-DD）比本地缓存 `cacheService.getHistory(symbol)` 中最后一条历史的本地日期更晚时，自动在后台触发对该 symbol 的强制历史刷新（调用 `forceFetchFundHistory(symbol)`）。
- 判定逻辑：
  - 若估值返回 `netWorthDate` 为空或 `'---'`，不触发补全。
  - 若本地历史缺失或最后历史日期早于 `netWorthDate`，触发补全。
  - 补全为 fire-and-forget 异步操作，不会阻塞 `fetchFundData` 的返回或界面渲染；同时通过 `backgroundTasks` 计数反映后台活跃任务数量。
- 目的与注意事项：该机制用于确保当第三方估值源在新净值日期发布后，客户端能尽快补全缺失的历史点，避免估值与历史数据不一致导致的图表或盈利计算偏差。为避免过度请求，历史补全仅在估值日期领先时触发一次（后续常规的定时历史刷新仍然会按既定计划执行）。

测试要求
- 新增或更新单元/集成测试以覆盖：
  - 点击 `deep-refresh-button` 后触发 `runBatchHistoryUpdate` 的行为（mock `forceFetchFundHistory` 并断言按并发策略被调用）。
  - 当 `fetchFundData` 返回 `netWorthDate` 晚于本地历史最后日期时，`maybeTriggerHistoryRefresh` / 自动触发逻辑会调用 `_deps.forceFetchFundHistory`（通过 seam 注入 mock 并断言调用）。

---

## 日内趋势图（Intraday Trend） — 新增功能说明（v1.15）

概述
- 新增“日内趋势图”标签页，用以展示当天（本地时区）分钟级的实时估值变化，实现对市场在交易日内的细粒度观察。该功能同时适用于基金详情与指数详情（包括大盘和全球市场指数）。

设计原则（从 feature-intraday_trend.md 与实际实现一致性出发）
- 采集范围：覆盖 `portfolio` 中的自选基金及全局 `indices`（市场指数与全球市场）。
- 数据来源：复用现有的实时估值更新（不要新增独立的 intradayService）；在现有定时写入 `cacheService.setValuation` 的路径上做数据切分与缓存更新。
- 优先使用 `lastUpdated` 字段构建时间戳；若不可用则回退到系统当前时间。
- 维持目前的采样频率（遵循已有定时器/轮询节拍，不在本次迭代内提高频率）。

缓存策略与压缩（避免长水平线问题）
- 在 `services/cacheService.ts` 中新增/增强 intraday 缓存逻辑：
  - 按天（本地时区）存储每分钟的估值点（key 为 `fund_intraday_{symbol}`），模块加载时仅预读当天数据。
  - 写入与追加时对时间戳做 "floor to minute"（分钟粒度归一），并在写入前先按分钟去重（同一分钟保留最新，行为与历史保持一致）。
  - 为避免“非交易时间段导致指数长水平线”问题，新增“连续相同值压缩”策略：在写入缓存时合并连续 value 相等的点，只保留该连续段的最早时间点位（以减少长段水平线产生）。
  - 读缓存（getIntradayPoints）会返回已压缩的数据；图表渲染层也会对输入数据做防御性压缩，确保即便上层传入未压缩数组也不会在视图上出现长水平段。

图表与 UI 行为（FundDetailsModal / IndexDetailsModal）
- 详情弹窗内两个并列 tab：默认显示“日内趋势图”，另一个为“历史趋势图”。二者 UI 保持高度一致以避免切换抖动：
  - 共享图高 `chartHeight = 180`（px），历史图与日内图内部最上方和最下方的 padding 已移除以减少空白。
  - 日内趋势图内保留历史趋势图顶部的均线图示占位区（空白），以确保两个 tab 高度一致；均线图示仅在历史趋势图 tab 中实际展示作用。
- 历史趋势图行为保持原状（不要改变既有交互与数据处理），本次仅新增日内 tab；历史图继续显示 SMA（5/10/20）及其开关，且在图左上方显示对应鼠标点的各均线数值。均线图示区域与下方点位信息区域宽度固定，避免因数值长度变化导致布局跳动。
- 日内趋势图中：
  - Y 轴语义（变更/关键说明）：Y 轴表示“相较上一日净值（previous day's NAV）的涨跌幅 %（equityReturn）”，即每个点的 equityReturn 值（可能为正/负），以百分比表示。Y 轴数值必须带百分号单位，图形顶部在 y 轴区域显示“%”单位提示。
  - Y 轴刻度规则：刻度按照 `data.min` 到 `data.max` 均分（默认 4 刻度），保持均匀分布；若数据区间包含 0，图表上必须存在精确的 `0.00%` 刻度（刻度文本严格为 `0.00%`，不会被四舍五入成 `+0.01%` 等）。为保证可读性，如果 `0.00%` 未落在均分刻度位置，则额外绘制一条灰色虚线并标注 `0.00%`，但不改变其余刻度的均分逻辑。
  - 刻度颜色：`0.00%` 采用灰色虚线网格线与灰色标签（示例色：线 #9ca3af，文本 #6b7280）；正刻度标签文本使用图表 stroke（默认红色）显示，负刻度使用绿色（#16a34a）。其余网格线为浅灰色虚线（#e2e8f0）。
  - Y 轴数值格式：所有刻度文本使用两位小数，并附带符号（正数用 `+` 前缀，例 `+0.67%`；负数显示 `-0.67%`；0 显示为 `0.00%`）。
  - X 轴：时间（本地时区），显示首/中/末三个时间刻度（小时:分钟），保持与历史趋势图对齐。
  - Hover / Tooltip：鼠标 hover 时显示一条竖直虚线。Tooltip 使用多行白色圆角矩形：第一行显示时间（小号灰色），第二行显示“百分比变化 + 原始净值（4 位小数）”，第二行根据涨跌着色（涨为红，跌为绿，0 为灰）。此 tooltip 不覆盖下方固定的信息栏；图下方固定区域仍显示时间 / 净值 / 与上一日涨跌（用于复制/阅读）。
  - 最新点高亮：图内最后一个点以更大圆点高亮显示（比其他点更大）以便识别最新值。

交易点与 hovertip（历史趋势图统一行为）
- 历史趋势图中：显示每日交易点（合并后每个有交易的日期一个 marker）。实现细节：
  - 聚合逻辑（已在 `utils/tradeAggregation.ts` 实现并单元测试）：对同一日多笔交易先合并计算：shares = 卖出份额总和 − 买入份额总和；amount = 卖出总额 − 买入总额。若 shares 为正则标记为 sell（蓝色点），若为负则为 buy（红色点）；显示份额与总额的绝对值。
  - 若某日既有买入又有卖出，聚合后仍仅保留一个 marker（颜色与类型依据聚合结果决定）。
  - 鼠标 hover 到交易 marker 时在图附近显示 hovertip（包含 类型、份额、金额），hovertip 不覆盖图上保留的点位净值信息区域，二者在视觉上互不遮挡。

性能与一致性注意事项
- 指数（市场与全球）详情同样支持日内趋势图，但可以假定指数没有交易点（因此不会渲染交易 marker），以保持代码路径一致性。
- 为保持稳定的页面加载体验，intraday 缓存读写遵循与估值一致的优先级与 lastUpdated 优先策略：在定时更新估值时同时调用 appendIntradayPoint（或 setIntradayPoints），由 `cacheService` 负责合并/压缩并同步写入 localStorage（key: `fund_intraday_{symbol}`）。

测试要求
- 新增纯单元测试：`tests/utils/tradeAggregation.test.ts`（验证多笔交易合并、type/amount/shares 计算、chart point 映射）。
- 新增缓存行为测试：`tests/services/cacheService.test.ts` 中补充 intraday 的 set/get/append 行为（minute floor、压缩、localStorage 写入）。
- 组件集成测试：`tests/components/FundDetailsModal.multitrade.test.tsx` 验证 UI 层在有同日多笔交易且历史中包含当天点时，最终渲染一个交易 marker。测试使用 dynamic import + act 包装用户事件以避免 hooks/更新时序问题。

向后兼容与注意事项
- `fund_history_*` 仍然不纳入备份导出/导入，history 缓存不受本次 intraday 改动影响。
- 压缩策略保留连续相同 value 的最早时间点；如果将来需要在视觉上保留平坦线的起止端点，可将压缩策略调整为“保留 run 的首尾两点”。
- 日期比较均采用本地 YYYY-MM-DD 键（localDateKey）做聚合匹配，避免时区导致的误配。

"注意事项"（重要）
- 日内图与历史图共享一套渲染代码（HistoryChart）以保证外观与交互一致；历史图上不应被日内改动影响现有行为（历史图保留均线、交易 hover 等）。
- 因为日内数据来自现有实时估值更新，所以要确保 `App.tsx` / 定时刷新的更新路径继续调用 `cacheService.setValuation`，在该路径末端同时调用 `cacheService.appendIntradayPoint` 以维持 intraday 缓存同步。
- 本次实现增加了缓存写入量（写入 `fund_intraday_{symbol}`），要注意 localStorage 空间与用户设备存储策略；我们已在写入时做基本去重/压缩以控制增长。

---

# FundTracker — 产品需求文档 (PRD)

版本：1.14
最后更新：2026-03-08

---

简述
- FundTracker 是一款前端单页（SPA）应用，面向普通投资者，用于添加/管理自选基金/指数，展示实时估值、涨跌、历史净值趋势及交易记录管理（本地持久化），目标是快速构建可交付的前端版本（vibe coding 可直接实现）。

目标与范围
- 目标：提供稳定、直观、可测试的核心功能：自选列表管理、基金/指数估值显示、历史曲线、交易记录（添加/编辑/删除/导入/导出）以及基本风险提示。
- 范围（本 PRD 覆盖）：
  - 自选基金/指数的添加/删除/排序/批量删除管理
  - 实时估值展示与历史净值曲线（含 SMA 指标）
  - 交易记录模块（本地存储、分页、导入/导出、价格回溯策略）
  - 风险分析与 tooltip（基于均线）
  - 本地化时间规则（交易记录价格回溯使用用户本地日终）
  - **内存数据缓存层（性能优化）**：将数据获取与界面展示分离，实现所有界面操作秒开
  - **数据备份与恢复（导出/导入）**：全量 JSON 备份、手动导出、定时自动导出、导入覆盖、兼容性保障
  - **卡片增强（Cards Enhancement）**：状态圆点（正常/错误/未知）、尽最大努力内容显示、Card 添加即时展示
  - **基金份额计算器**：在基金详情页内嵌计算器，支持金额到份额的即时换算
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
  - `computeAvgCostPrice(symbol, trades): number | null`：计算单个基金的平均成本价
    - 公式：`持仓成本价 = (初始份额×初始价格 + Σ买入金额 - Σ卖出金额) ÷ 当前持仓份额`
    - 其中：买入金额 = 价格 × 份额 + 手续费，卖出金额 = 价格 × 份额 - 手续费
    - 从 `fund_position_{symbol}` 读取 initialPosition 和 initialPrice
    - 当前持仓份额 ≤ 0 时返回 null

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
4. **`OverallProfitModal` 打开**：合并为单次 `computeOverallProfit` 调用；图表 timeline 按 `chartFromDate` 客户端裁剪（修复 x 轴日期）；
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
    "autoExportTime": "HH:mm (string — 每日自动导出时间，默认 '16:00')",
    "autoBackupEnabled": "boolean (可选 — 是否启用自动备份，默认 false)"
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

- 触发方式：系统在每日本地时间达到配置的 `autoExportTime`（默认 `16:00`）时自动触发；由 `App.tsx` 中的定时器驱动，**但只有在 `autoBackupEnabled` 为 true 时才执行**。
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
  3. 写入新 portfolio（`localStorage['fund_portfolio']`）、新 trades（`localStorage['fund_trades']`）、新 positions（`localStorage['fund_position_*']`）、新 indices 配置（`localStorage['fund_indices']`、`localStorage['fund_global_indices']`）、新 `autoExportTime`（`localStorage['fund_backup_config']`）以及 `autoBackupEnabled` 状态。
  4. **evict 旧 symbol 的估值缓存**（调用 `cacheService.evictValuations`），并将导入数据中的 optional 估值作为 fallback 写入缓存（仅当缓存中该 symbol 尚无数据时，调用 `cacheService.setValuationIfAbsent`），确保页面能即时展示已有数据。
  5. **不清除** `fund_history_*` 缓存 key（历史净值保留，用于加速下次展示）。
  6. 返回新的 `portfolio`、`indicesConfig`、`globalIndicesConfig`，供 `App.tsx` 更新 state 并触发 UI 重新渲染。

### 备份配置（BackupSettingsModal）

- 入口：顶部菜单栏点击 **"备份设置"** 打开弹窗。
- 功能：
  - 自动备份开关：显示"启用自动备份"的开关控件，初始状态由 `autoBackupEnabled` 配置决定（默认为 `false`）。
  - 时间选择器（`<input type="time">`），仅当自动备份开关开启时可编辑，初始值为当前已保存的 `autoExportTime`（默认 `16:00`）；当开关关闭时，时间输入框被禁用（灰色显示，不可编辑）。
  - 下方实时显示自动备份状态："距下一次自动备份还有 X 小时 Y 分钟"（当开关开启时）或"已关闭"（当开关关闭时）。
  - **修改开关或时间后，状态文字随即更新**，反映当前设置下的状态。
  - 保存（`保存` 按钮）：调用 `writeBackupConfig({ autoExportTime: newTime, autoBackupEnabled: newEnabled })`，持久化到 `localStorage['fund_backup_config']`，并通知 `App.tsx` 更新定时器。
  - 取消/关闭：不保存，关闭弹窗。
- 配置持久化 key：`fund_backup_config`；JSON 格式：`{ "autoExportTime": "HH:mm", "autoBackupEnabled": boolean }`。
- `readBackupConfig()` 在读取失败或格式不合法时返回默认值 `{ autoExportTime: '16:00', autoBackupEnabled: false }`。

### 兼容性（旧格式导入）

导入功能**必须兼容原有（旧版）导出的数据文件**，不得出现无法导入或关键数据缺失的情况：

| 旧格式情形 | 处理策略 |
|---|---|
| `indices` / `globalIndices` 为纯字符串数组（非对象数组）| 将每个字符串视为 `symbol`，其余字段置空，正常导入 |
| `indices` 数组中混合字符串和对象 | 逐项判断：字符串直接取为 `symbol`，对象正常解构 |
| `portfolio` 中无 optional 字段（name、currentPrice 等）| 仅用 `id`、`symbol`、`market` 核心字段，optional 字段置空 |
| 缺少 `config` 字段 | 取 `localStorage['fund_backup_config']` 中已存储的值；若也无则用默认值 `{ autoExportTime: '16:00', autoBackupEnabled: false }` |
| `positions` 中缺少 `initialPrice` | 归一化为 `null` |
| `trades` 中缺少 `price` | 归一化为 `0` |
| 缺少 `trades` 或 `positions` 字段 | 视为空对象 `{}` |
| 缺少 `globalIndices` 字段 | 视为空数组 `[]` |
| 缺少 `autoBackupEnabled` 字段（从旧版导入）| 默认设置为 `false`（自动备份关闭） |

### 工具函数（`utils/backupService.ts`）

| 函数 | 说明 |
|---|---|
| `buildBackupData(portfolio, indicesState, globalIndicesState)` | 构建完整备份数据对象（从 localStorage 读取 trades/positions，从 cacheService 读取估值填充 optional 字段），包含 `autoBackupEnabled` 状态 |
| `downloadBackupFile(data, mode: 'manual' \| 'auto')` | 生成 Blob，触发浏览器下载；`manual` 模式文件名含本地时间戳，`auto` 模式含 `_auto_` 和日期 |
| `applyBackupData(raw)` | 解析、归一化、写入 localStorage，更新缓存，返回新 state，处理 `autoBackupEnabled` 状态 |
| `readBackupConfig()` | 读取并验证 `fund_backup_config`，失败时返回默认值，处理 `autoBackupEnabled` 状态的向后兼容 |
| `writeBackupConfig(cfg)` | 将配置（包括 `autoBackupEnabled` 状态）序列化后写入 `fund_backup_config` |

### 数据最终一致性

- 所有 optional 字段（估值、价格等）在页面使用过程中会被实时/历史净值网络数据覆盖更新，写入 `cacheService`；**下次导出时导出的是最新、最准确的数据**。
- 导入后的 optional fallback 数据为临时展示用途，后台刷新完成后会自动替换，无需用户干预。

---

- 全体风格：Tailwind utility-first。保持现有组件样式约定（rounded-2xl、shadow-sm、text-xs 等）。

---

## 卡片增强（Cards Enhancement）

**Cards 定义**：在主界面上，每个基金、大盘指数或全球指数均以一个卡片（Card）的形式展示。每个卡片显示该基金或指数的名称、当前价格、涨跌幅等基本信息。用户可通过点击卡片进入详细信息页面（`FundDetailsModal` / `IndexDetailsModal`）。

### Card 状态

Card 的状态分为三种：正常、错误、未知。以带颜色的小圆点（`w-2 h-2 rounded-full`）展示在 Card 左上角，颜色定义如下：

| 状态 | 颜色 | hover 提示 | Tailwind 类 |
|---|---|---|---|
| 正常 | 绿色 | "正常" | `bg-green-500` |
| 错误 | 红色 | "错误" | `bg-red-500` |
| 未知 | 灰色 | "未知" | `bg-gray-400` |

圆点通过 `title` 属性与 `aria-label` 属性提供 hover 提示与无障碍支持（格式：`状态: 正常 / 错误 / 未知`）。

**状态语义**：
- **正常**：最近一次数据获取成功（API 返回有效数据）。
- **错误**：最近一次数据获取失败（网络异常、API 返回 null 或抛出异常）。
- **未知**：页面初始化时；或新添加 Card 尚未完成首次数据获取时；或数据获取进行中尚未得到结果时。

**状态更新逻辑**：
- 页面初始化时，所有 Card 状态默认为未知（`unknown`）。
- `updateSingleFund(symbol)` 成功获取数据（返回非 null 的 `ValuationData`）→ 对应基金状态置为正常（`ok`）；返回 null 或 catch 异常 → 置为错误（`error`）。
- `refreshMarketIndicesAsync()` 成功获取指数数据：将返回结果中包含的 symbol 置为正常，配置中存在但结果中缺失的 symbol 置为错误；catch 全量异常时所有配置的 symbol 均置为错误。
- 状态由网络数据刷新逻辑触发更新，不由 localStorage / 缓存读取触发。定时刷新（实时估值 3 分钟、市场指数 2 分钟）和手动刷新均会更新状态。
- 状态为运行时内存状态，页面刷新后重置为 `unknown`（无需持久化到 localStorage）。

**类型定义**（`types.ts`）：
```typescript
// 'ok' = 成功, 'error' = 失败, 'unknown' = 未知/初始/进行中
export type CardStatus = 'ok' | 'error' | 'unknown';
```

**状态存储**（`App.tsx`）：
- `fundStatuses: Record<string, CardStatus>` — 以 symbol 为 key，存储每只基金的状态。
- `indexStatuses: Record<string, CardStatus>` — 以归一化后的 symbol 为 key，存储每个指数的状态（与基金分开存储，避免 symbol 命名冲突）。
- 两者初始值均为 `{}`（未设置则通过 `?? 'unknown'` 取默认值）。

### Card 内容显示

遵循**尽最大努力原则**，Card 无论有无数据，都必须在界面上展示。

- **始终渲染**：每个 Card 无论数据是否存在，都应在界面上展示。
- **数据优先级**：localStorage → cacheService 内存缓存 → 通过数据文件导入的信息。
- **无数据时占位显示**：价格、涨跌幅等数字信息位置显示 `"-"`（连字符），而非骨架屏动画或空白。
- **名称兜底**：若既无缓存名称也无 ticker.name，则显示该基金/指数的代码（symbol）。代码必然存在，不得出现名称位置完全为空的情况。

### Card 添加

- 当用户通过 `AddTickerModal` 添加新基金或指数时，新 Card 必须**立即**渲染在界面上，不论数据获取是否已完成。
- 新添加 Card 的初始状态为**未知**（`unknown`），直到：
  - 数据获取成功后更新为正常（`ok`）；或
  - 数据获取失败后更新为错误（`error`）。

### 实现文件

| 文件 | 改动 |
|---|---|
| `types.ts` | 新增 `CardStatus` 联合类型 |
| `App.tsx` | 新增 `fundStatuses` / `indexStatuses` state；`updateSingleFund` 设置 ok/error；`refreshMarketIndicesAsync` 设置 ok/error；`renderIndexCard` 接受并渲染 status；向 `TickerCard` 传入 `status` prop |
| `components/TickerCard.tsx` | 新增 `status?: CardStatus` prop；渲染左上角状态圆点；无数据时显示 `'-'` 而非骨架屏；名称兜底显示 symbol（`tests/components/TickerCard.test.tsx`）。|

### 验收标准（Cards Enhancement）

- 每张基金 Card 与指数 Card 左上角均有状态圆点，hover 显示"正常"/"错误"/"未知"对应提示。
- 页面初始化时所有 Card 状态圆点为灰色（未知）；首次成功获取数据后切换为绿色（正常）；网络失败后切换为红色（错误）。
- 每个 Card 无论有无数据均渲染在界面上；无数据时价格和涨跌幅显示 `"-"`（非骨架屏）。
- 新添加 Card 立即出现在界面上，初始状态为未知，数据返回后状态更新。
- 无名称时显示代码（symbol），不出现名称位置空白或"正在获取名称…"文字。
- 状态不持久化，页面刷新后重置为未知（代码审查确认无 localStorage 写入）。
- 单元测试覆盖：`TickerCard` 三种 status 圆点的颜色与 aria-label；无数据时显示 `'-'`；名称兜底显示 symbol（`tests/components/TickerCard.test.tsx`）。

---

- TickerCard（卡片）
  - 通用规则参见上方「卡片增强（Cards Enhancement）」章节：状态圆点、无数据占位符 `"-"`、名称兜底 symbol、Card 始终渲染。
  - 显示要素：基金/指数名称（或代码兜底）、symbol、实时估值（4 位小数）、涨跌幅、上次更新时间、风险分析 badge、左上角状态圆点
  - 主界面统一管理模式：
    - 点击主界面“管理”按钮后进入统一管理模式，适用于自选基金、大盘指数、全球指数三类 Card
    - 管理模式标题文案为“批量删除”
    - 三类 Card 右上角统一显示删除多选按钮，默认未选中，选中后显示红色叉叉
    - 主界面上的自选基金 Card 不再提供单个删除按钮；删除仅允许在管理模式中完成
    - 管理模式操作区包含“确认”“取消”两个按钮：点击“确认”后删除所有已选中的基金/指数并退出管理模式；点击“取消”后直接退出管理模式且不删除任何项目
    - 当已选项目数大于 0 时，在“批量删除”与“确认”按钮之间显示“n个项目待删除”；当已选项目数为 0 时不显示该提示文字
    - 若未配置任何基金或指数，则“管理”按钮置灰并禁用
  - 风险 badge：基于 `computeRatingFromHistory` 输出的统一风险分析结果（`rating`、`color`、`summary`、`opportunitySignals`、`riskSignals`、`notes`），hover/focus 显示 tooltip（aria 支持）
  - 点击卡片打开 `FundDetailsModal`（非 selection 模式）；在 selection 模式下点击触发选择

- FundDetailsModal
  - 加载并展示最近 90 个历史点（若可用），svg 曲线 + area + 可切换的 SMA（5/10/20）
  - 默认可见：5/10/20（如上确认）
  - 均线配色固定：MA5 使用黄色，MA10 使用蓝色，MA20 使用粉色；卡片、详情页与 hover 数值展示保持一致
  - **基金份额计算器**（`fas fa-calculator` 按钮，位于"配置仓位"与"交易管理"按钮之间）：
    - 点击图标打开计算器弹窗（与配置仓位弹窗风格一致：`fixed inset-0 z-[120]`，`max-w-sm`）
    - 输入框标签"买入/卖出金额（元）"；输出区标签"可买份额（份）"
    - 估值来源：优先使用 `currentPrice`（实时估值，需 `> 0`），fallback 到 `previousPrice`（最近确认净值，需 `> 0`）
    - 份额计算：`(金额 / 估值).toFixed(2)`，精确到小数点后 2 位
    - 支持千分位输入（解析时去除逗号，即 `value.replace(/,/g, '')`）
    - 金额为空、非数字或 NaN 时：输出框显示 `"-"`（红色字体）
    - 金额为负数时：输出框显示 `"-"`（灰色字体）
    - 无有效估值（`currentPrice <= 0` 且 `previousPrice <= 0`）时：输出框显示"无法计算"（红色字体）
    - 弹窗底部显示"参考估值"：若 `currentPrice > 0` 展示实时估值；否则若 `previousPrice > 0` 展示"确认净值"；均无则展示"暂无数据"
    - 关闭弹窗时清空输入（`calcAmount` 重置为 `''`）

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

### 基金风险分析模型（替代旧版风险评级算法）

目的：对每只基金输出可解释的“风险分析”结果，而不是旧版单一四档评级规则。使用端只依赖统一接口，具体模型集中在独立风险模块中，后续如需替换模型，只修改风险模块本身。

统一接口
- 主入口：`computeRatingFromHistory(history, data?)`
- 模型文件：独立风险分析模块负责“历史净值 + 当天估值 -> 风险分析结果”的全部规则与降级逻辑
- UI（`TickerCard`、`FundDetailsModal`、`RatingTooltip`）不得直接实现均线判定，只消费统一结果

输入约束
- `history`: 历史净值序列（按时间升序）
- `data`: 当前估值对象（可选）
- 计算时必须优先把**当天估值**并入净值序列：
  - 若当天估值与最后历史点为同一交易日，则用当天估值替换最后一个点
  - 若当天估值晚于最后历史点，则将当天估值追加到序列末尾
  - 若无有效当天估值，则仅使用历史净值
- **估值合并约束**：当 `realtimeDate === netWorthDate` 或历史净值最后一条日期 >= `realtimeDate` 时，说明当天净值已确认，**不应替换或追加估值点**，保留历史净值序列原样
- 所有 MA 计算基于并入当天估值后的序列执行，保证卡片与详情页结论一致

输出结构
- `RiskResult`：
  - `rating`: `'机会' | '偏多' | '观望' | '风险'`
  - `color`: badge 颜色
  - `action`: 行动建议
  - `summary`: 摘要结论
  - `opportunitySignals: string[]`
  - `riskSignals: string[]`
  - `notes: string[]`
  - `reasons: string[]`（兼容旧使用端，可由上述数组拼接得出）

判定范围（以 `features/feature-risk.md` 为准）
- MA5：
  - 机会信号：连续 2 日站上 MA5、回踩 MA5 不破、MA5 上穿 MA10（金叉）
  - 风险信号：跌破 MA5、MA5 走平/拐头向下、相对 MA5 乖离过大
- MA10：
  - 机会信号：回踩 MA10 获支撑、拒绝死叉、短期生命线有效
  - 风险信号：MA5 下穿 MA10（死叉）、连续 2 日位于 MA10 下方、单日大跌击穿 MA10
- MA20：
  - 机会信号：价格位于 MA20 上方且 MA20 向上、首次回踩 MA20 企稳、银山谷雏形
  - 风险信号：跌破 MA20、MA20 走平或向下、空头排列 / 死亡谷共振
- 综合信号：
  - 共振买点：MA5 上穿 MA10 + 价格站上 MA20 + MA20 向上
  - 共振卖点：MA5 下穿 MA10 + 价格跌破 MA20 + MA20 走弱

展示规则
- 卡片与详情页顶部保留单一风险分析 badge，颜色与 `rating` 对应
- tooltip 采用分组展示：`机会信号`、`风险信号`、`说明`
- tooltip 至少显示摘要结论和 1 个有效信号；若信号不足，显示数据不足/继续观察说明

边界与降级
- 历史点不足 5/10/20 天时，不得抛异常；需在 `notes` 中标注哪些均线暂不可用
- 当前仓库暂无成交量、RSI 与震荡市识别数据源；本次仅实现价格与 MA5/MA10/MA20 的自动分析，并在说明中明确该限制
- 当价格与均线关系尚未形成明确共振时，返回 `观望`

验收标准（Risk Analysis）
- `computeRatingFromHistory` 与底层风险模块对同一组 `history + data` 输出完全一致，卡片与详情页 tooltip 文本一致
- 当天估值参与计算后，卡片与详情页的风险分析必须同步反映当日最新估值变化
- 单元测试覆盖：金叉、多头支撑、死叉、跌破 MA20、数据不足、同日估值替换历史点、次日估值追加历史点
- 组件测试覆盖：tooltip 分组展示（机会信号/风险信号/说明）、MA5 黄色 / MA10 蓝色 / MA20 粉色的详情图渲染与切换

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
  - 表格四列：日期、当日净值、当日盈利、累计盈利。
  - 一屏最多显示10条，带滚动条。
  - 表格下方显示该区间累计盈亏。
  - 正数红色，负数绿色，0值用黑色"-"表示。
  - 用户选择不同日期范围时，盈亏数字动态更新。
- 盈亏计算逻辑（实现于 `utils/profitCalculator.ts` — `computeProfitTimeline`）：
  - **核心原则**：当天的交易（买入/卖出）不影响当天的份额和累计盈利，在次日才生效。
  - **当日份额** = 初始份额 + 截止到前一日的累计买入份额 - 截止到前一日的累计卖出份额
  - **当日累计盈利** = 当日份额 × 当日净值 − 初始成本 − 截止到前一日的累计买入金额 + 截止到前一日的累计卖出金额
    - 初始成本 = 初始份额 × 初始价格
    - 累计买入金额 = Σ(买入价格 × 买入份额 + 手续费)
    - 累计卖出金额 = Σ(卖出价格 × 卖出份额 − 手续费)
  - **当日盈利** = 当日累计盈利 − 前一日累计盈利（直接相减，不使用调整值）
- 基线调整（显示层，`ProfitModal` 的 `displayedTimeline`）：
  - 当显示起始日期（fromDate）等于持仓起始日期（initialStartDate）时，第0日 dailyProfit 强制置0，后续各日 cumulativeProfit 由 dailyProfit 依次累加重建。
- 日期选择规则：
  - 开始日期必须早于结束日期（默认结束为当天）。
  - 开始日期不得早于持仓开始日期（默认即持仓开始日期）。
  - 若区间不合法，显示错误提示。

### 整体盈利计算
- 主界面管理按钮旁增加"盈利"按钮，点击后弹出整体盈利窗口。
- 整体累计盈利趋势图：
  - 横轴为日期，纵轴为累计整体盈利金额。
  - hover 显示每日日期、当日整体盈利金额和累计整体盈利金额。
  - x轴起始日期 = 所有参与计算的基金（即具有持仓开始日期 `startDate` 的基金）中 `startDate` 的最小值。x轴终止为当天日期。
  - 注意：x轴起始不得使用原始历史净值时间线的第一个日期（该日期可能早于任何基金的持仓开始日期，导致图表显示多余的空白起始段）。
  - 若无任何基金配置持仓开始日期，则不显示图和表格，改为显示空状态提示文字"无持仓基金，请先配置"。
- 整体盈利表格：
  - 图表下方，用户可选择两个日期（日期1/日期2），仅影响表格数据。
  - 表格四列：基金名称（代码）、日期1累计盈利、日期2累计盈利、盈利差额。
  - 一屏最多显示10条，带滚动条。
  - 表头和统计行固定，滚动时始终可见。
  - 表格下方显示统计信息：总计、区间累计值总和、区间末累计值总和、总额总和。
  - 正数红色，负数绿色，0值用黑色"-"表示。
  - 用户选择不同日期范围时，表格数据动态更新。
- 统计与过滤规则：
  - 只有具有持仓开始日期且早于日期2的基金才纳入整体盈亏计算和表格展示。
  - 若基金持仓开始日期晚于日期x，则该基金在x日的累计盈利为0。
  - 没有持仓开始日期的基金不参与整体累计盈利计算，也不在表格显示。
- 日期选择规则：
  - 日期1必须早于日期2（默认为时间轴最后一天）。
  - 日期1的默认值为日期2默认值的前一天。
  - 日期2不得晚于x轴终止日期。
  - 若区间不合法，清空表格并显示错误信息。
  - **仅整体盈亏窗口**的日期选择区域提供快捷选项：`本月`、`上月`、`本年`、`去年`。
  - 点击快捷选项后，自动填充日期1/日期2，并立即联动更新表格数据与区间累计值。
  - 快捷选项的日期范围定义：
    - `本月`：从上个月的最后一天到当前日期。
    - `上月`：从前个月的最后一天到上个月的最后一天。
    - `本年`：从去年的最后一天到当前日期。
    - `去年`：从前年的最后一天到去年的最后一天。
  - 若快捷选项生成的日期2晚于x轴终止日期，则自动将日期2裁剪为x轴终止日期。
  - 若裁剪后的区间仍不合法，清空表格并显示现有错误信息。
- 图表点击联动（整体盈亏趋势图 -> 表格日期过滤）：
  - 在整体盈亏页面上，点击趋势图某个数据点时，重置下方日期选择并联动表格计算。
  - 日期2重置为选中点对应日期；日期1重置为该点在 x 轴上的前一个点日期。
  - 若选中点是 x 轴第一个点，则日期1重置为该点日期的前一自然日。
  - 表格仅展示日期1到日期2（含边界）的基金盈亏数据，并重新计算盈利差额与累计整体盈利差额。

- 计算机制（实现于 `services/fundService.ts` — `computeOverallProfit`）：
  - 整体累计盈利趋势图的数据集为所有基金（排除无起始日期的基金）在时间窗口内每日累计盈利的加总。
  - 表格数据为趋势图数据集的子集，通过日期1和日期2过滤。
  - **单个基金每日盈利直接复用 `computeProfitTimeline` 返回的 `dailyProfit`，与单基金盈利窗口的数值完全一致。**
  - `perFundTimelines` 构建规则：对 startDate 之后的每个日期，使用 `dailyProfit` 累加；startDate 当日及之前贡献为0；在 timeline 中不存在的 gap 日期 daily=0、cumulative 保持不变（前向填充）。
  - 若某基金在x日无净值或估值，则累计盈利按前推最近可用净值/估值计算。



## FundTracker 与 Eggfund 系统同步功能 — 新增功能说明 (v1.21)

### 概述

本文档描述了 FundTracker 应用程序中新增的功能：从 Eggfund 系统同步历史交易信息。该功能允许用户将来自 Eggfund 系统的交易数据同步到 FundTracker 中，并在必要时进行手动审核。

### 功能需求

1. 用户可在同步管理模块中配置 Eggfund 系统的登录凭据（用户名和密码）
2. 用户可发起同步操作，通过 API 从 Eggfund 系统获取历史交易数据
3. 系统对比本地数据与外部数据，按日期分组检测差异
4. 提供用户确认界面，标注新记录和数据有差异的记录
5. 支持按基金、时间等条件筛选待确认记录
6. 同步配置需要支持导入导出功能
7. 用户确认界面提供日期级别的交易汇总视图
8. 同步确认窗口支持过滤条件保存和自动应用功能
9. 同步过程中的信息显示优化，包括左对齐、防换行等功能
10. 交易详情信息展示格式优化，提高可读性
11. 同步后保持窗口打开状态并实时更新差异列表

### 技术规格

#### Eggfund API 规范

##### 获取基金列表
- API URL: `https://eggfund.website/api/funds`
- HTTP 方法: GET
- 请求头:
  - `accept: application/json`
  - `Authorization: Basic {base64(username:password)}`
- 返回格式: 数组，元素结构:
  ```typescript
  {
    type: string,      // "LOCAL_FUND"
    id: string,        // 基金代码
    name: string,      // 基金名称
    etf: boolean,      // 是否ETF
    priority: number,
    url: string | null,
    category: string | null,
    alias: string | null,
    currency: string,  // "RMB"
    currencySign: string  // "¥"
  }
  ```

##### 获取基金历史交易
- API URL: `https://eggfund.website/api/invests/{id}/{code}?batch=-1`
- HTTP 方法: GET
- 参数:
  - `{id}`: 用户名 (同步配置中的用户名)
  - `{code}`: 基金代码
  - `batch=-1`: 获取所有历史交易
- 请求头:
  - `accept: application/json`
  - `Authorization: Basic {base64(username:password)}`
- 返回格式: 数组，元素结构:
  ```typescript
  {
    day: string,         // 交易日期，格式为 yyyy-MM-dd
    type: string,        // "trade"
    id: string,          // 交易唯一ID
    code: string,        // 基金代码
    share: number,       // 交易份额，买入为正数，卖出为负数
    unitPrice: number,   // 单价
    totalSpend: number,  // 总花费
    fee: number,         // 交易手续费
    tax: number,         // 税费
    fxRate: number,      // 汇率
    userIndex: number,
    enabled: boolean,
    batch: number,
    comments: string,    // 备注
    amount: number,      // 金额
    misMatchAlert: boolean  // 不匹配警报
  }
  ```

### 架构设计

#### 1. 模块结构

```
src/
├── components/
│   ├── SyncManagementModal.tsx          # 同步管理配置界面
│   └── SyncConfirmationModal.tsx        # 同步确认界面
├── services/
│   ├── eggfundService.ts                # Eggfund API 服务
│   └── syncService.ts                   # 同步业务逻辑
├── types/
│   └── syncTypes.ts                     # 同步相关类型定义
├── hooks/
│   └── useSyncConfig.ts                 # 同步配置 Hook
└── utils/
    └── syncUtils.ts                     # 同步工具函数
```

#### 2. 核心数据类型

```typescript
// 同步配置
export interface SyncConfig {
  eggfundUsername: string;
  eggfundPassword: string;
}

// 来自 eggfund 的交易数据
export interface EggfundTradeRecord {
  day: string;           // 交易日期，格式为 yyyy-MM-dd
  type: string;          // "trade"
  id: string;            // 交易唯一ID
  code: string;          // 基金代码
  share: number;         // 交易份额，买入为正数，卖出为负数
  unitPrice: number;     // 单价
  totalSpend: number;    // 总花费
  fee: number;           // 交易手续费
  tax: number;           // 税费
  fxRate: number;        // 汇率
  userIndex: number;
  enabled: boolean;
  batch: number;
  comments: string;      // 备注
  amount: number;        // 金额
  misMatchAlert: boolean; // 不匹配警报
}

// 来自 eggfund 的基金数据
export interface EggfundFund {
  type: string;          // "LOCAL_FUND"
  id: string;            // 基金代码
  name: string;          // 基金名称
  etf: boolean;          // 是否ETF
  priority: number;
  url: string | null;
  category: string | null;
  alias: string | null;
  currency: string;      // "RMB"
  currencySign: string;  // "¥"
}

// 同步差异类型
export type SyncDifferenceType = 'new' | 'modified' | 'deleted';

// 交易差异类型
export interface TradeDifference {
  date: string;                         // YYYY-MM-DD
  symbol: string;                       // 基金代码
  type: SyncDifferenceType;             // 差异类型：新增、修改、删除
  localData?: DateTradeGroup;           // 本地数据
  externalData?: DateTradeGroup;        // 外部数据
  differenceDetails?: DifferenceDetail[]; // 差异详情
}

// 按日期分组的交易记录
export interface DateTradeGroup {
  date: string;           // YYYY-MM-DD
  symbol: string;         // 基金代码
  netDirection: 'buy' | 'sell' | 'hold'; // 净交易方向
  netShares: number;      // 净交易份额（买入-卖出）
  totalFees: number;      // 总手续费
  trades: TradeRecord[];  // 详细交易记录
}

// 差异详情
export interface DifferenceDetail {
  type: 'direction' | 'netShares' | 'fees'; // 差异类型
  localValue: any;
  externalValue: any;
}

// 过滤条件配置
export interface SyncFilterConfig {
  selectedFunds: string[];      // 选中的基金代码数组
  filterDate: string;           // 过滤的日期
  selectedTypes: SyncDifferenceType[]; // 选中的差异类型数组
}
```

#### 3. 同步服务层

##### eggfundService.ts
- `getEggfundFunds(username: string, password: string)`: Promise<EggfundFund[]>
- `getHistoricalTrades(username: string, password: string, fundCode: string)`: Promise<EggfundTradeRecord[]>
- `authenticate(username: string, password: string)`: Promise<boolean>

##### syncService.ts
- `compareTrades(localTrades: TradeRecord[], externalTrades: EggfundTradeRecord[])`: TradeDifference[]
- `transformEggfundData(externalData: EggfundTradeRecord[], fundCode: string)`: TradeRecord[]
- `syncSelectedTrades(differences: TradeDifference[], selectedItems: TradeDifference[])`: Promise<void>
- `calculateDateTradeGroup(trades: TradeRecord[]): DateTradeGroup
- `applySyncUpdates(selectedDifferences: TradeDifference[]): void` - 应用同步更新到本地数据

#### 4. 组件设计

##### SyncManagementModal.tsx
- 配置用户名和密码输入表单
- 密码字段使用掩码显示
- 测试连接功能
- 保存配置到本地存储

##### SyncConfirmationModal.tsx
- 展示交易差异列表，按日期和基金分组
- 提供基金筛选器（支持多选和全选/重置）
- 提供时间范围筛选器
- 提供差异类型筛选器（支持多选和重置）
- 显示每组记录的类型（新增、修改、删除）
- 高亮显示差异维度（仅对修改类型）
- 提供全选/反选功能
- 同步确认和关闭窗口按钮
- **新增功能**：
  - **过滤条件保存**：提供"保存过滤条件"按钮，可将当前的基金、日期、类型筛选条件保存到localStorage
  - **过滤条件恢复**：每次打开窗口时自动应用保存的过滤条件
  - **同步信息显示**：在窗口底部显示同步结果信息，避免使用原生确认弹窗
  - **同步后保持打开**：同步后窗口保持打开状态，使用缓存的eggfund数据重新计算差异
  - **交易详情格式优化**：
    - 单笔交易：`买入：6026.69份，手续费：0.00`
    - 汇总信息：`方向:买，净份额:6026.69，总费用:0.00`
    - 数字保留两位小数，去除货币符号
  - **同步过程信息优化**：加载过程中的信息显示采用左对齐、防换行设计
  - **字体大小和布局**：基金名称和交易详情使用较小字体，避免换行

#### 5. 安全考虑

- 密码字段使用掩码输入（type="password"）
- 不在日志或调试信息中泄露认证信息
- 在导出备份时可选择排除敏感信息
- 遵循现有的本地存储安全最佳实践
- 使用 Base64 编码传输认证信息
- 过滤条件配置不包含敏感信息

#### 6. 用户体验流程

1. 用户打开同步管理界面，输入 Eggfund 系统的用户名和密码
2. 用户点击"测试连接"验证凭据有效性
3. 用户保存配置并关闭同步管理界面
4. 用户在主界面触发同步操作
5. 系统首先获取 eggfund 中的基金列表
6. 找到与系统中基金的交集，确定需要同步的基金
7. 对每个需要同步的基金，获取其历史交易数据
8. 系统比较本地数据与外部数据，按日期和基金计算差异
9. 系统打开同步确认界面，展示差异列表
10. 用户使用筛选器缩小选择范围
11. 用户勾选要同步的日期记录
12. 用户可选择点击"保存过滤条件"按钮，保存当前筛选状态
13. 用户点击确认，系统根据选择更新本地数据
14. 界面保持打开状态，显示同步结果，并使用之前缓存的eggfund数据重新计算差异
15. 用户可以继续选择其他差异项进行同步，或关闭窗口

### 集成点

- 需要更新 `types.ts` 添加新的同步配置类型
- 需要扩展备份/导出功能以支持同步配置
- 需要集成现有的交易管理功能
- 需要适配现有的国际化文本资源
- 需要在主界面右上角菜单中添加同步配置入口（位于备份设置下方）
- 需要在主界面右上角菜单中添加数据同步入口（位于同步配置下方）
- 需要支持过滤条件的保存和自动应用功能
- 需要集成过滤条件的导入导出功能（在备份数据中包含过滤条件配置）

### 界面入口

- 主界面右上角下拉菜单包含"同步配置"选项，点击后打开同步管理配置界面
- 主界面右上角下拉菜单包含"数据同步"选项，点击后直接启动自动同步流程：
  - 自动获取 eggfund 基金列表
  - 与本地基金组合取交集
  - 对交集内基金逐个获取历史交易
  - 比较本地与外部数据并显示差异确认界面
  - 自动加载和应用之前保存的过滤条件

### AI 投资助手 (AI Investment Assistant) — 新增功能说明 (v1.24)

#### 概述
AI投资助手是一个集成的人工智能功能，允许用户在基金详情页面获取基金特定的分析和投资建议。通过将用户的基金数据与配置的AI模型结合，助手能够提供专业的投资洞察。

#### 界面入口
1. **主界面**：右上角下拉菜单中有"AI配置"菜单项，点击打开AI配置窗口
2. **基金详情页**：工具栏中的AI机器人图标按钮，点击打开AI助手窗口

#### 功能特性
1. **AI助手窗口**：点击按钮后，一个滑入的侧边面板显示AI聊天界面
2. **上下文感知**：AI助手自动获取当前基金的实时数据（价格、涨跌幅、净值等）并将其包含在对话上下文中
3. **多配置管理**：支持配置多个AI模型，但只能激活一个
4. **会话保持**：用户可以在同一会话中进行连续对话，AI记住上下文

#### AI配置窗口
用户可以配置多个AI模型配置组，每个配置组包括：
- **模型名称**：用户自定义的模型名称
- **模型地址**：模型的API端点URL
- **API-Key**：模型的API密钥（显示时mask）
- **是否激活**：开关控制，只能有一个配置组处于激活状态

**配置管理**：
- 用户可以增加或删除配置组
- 系统预置常用模型配置模板（不包含API-Key）
- 首次使用时自动加载预置模板到localStorage

**备份恢复**：
- AI配置不参与备份和恢复功能
- 导出备份时不包含AI配置数据
- 导入备份时不修改已有的AI配置

#### AI助手窗口行为
- **首次打开**：自动使用预配置的提示词模板，向AI模型发送请求获取基金分析
- **窗口隐藏**：关闭窗口后窗口被隐藏（非销毁），保留对话记录
- **再次打开**：直接显示之前隐藏的窗口，不重新发送请求
- **页面刷新**：窗口信息清空，再次打开时重新发送请求
- **使用时效**：当天内多次打开同一基金的AI窗口属于同一时效，不重复请求；次日0点后时效过期，重新请求
- **输入队列**：当AI正在处理请求时，新的输入（文本或常用问题）会被加入等待队列；当前请求完成后，自动从队列中取出下一个请求处理；队列采用先进先出（FIFO）顺序；避免同时发送多个请求导致的混乱
- **常用问题上下文存储**：用户选择常用问题时，对话框显示问题名称（如"走势预测"），但上下文中存储的是完整的提示词内容（变量替换后），确保后续AI对话能够理解之前常用问题的完整含义

#### 提示词模板变量
提示词模板支持以下预定义变量：

| 变量 | 说明 |
|------|------|
| `{code}` | 基金代码 |
| `{name}` | 基金名称 |
| `{history}` | 用户历史交易信息（JSON格式） |
| `{fullCapacity}` | 基金满仓份额 |
| `{initialCapacity}` | 用户投资该基金的初始份额 |
| `{initialDate}` | 用户投资该基金的起始日期 |
| `{initialPrice}` | 用户投资该基金的初始价格 |
| `{currentPrice}` | 当前基金价格（估值/净值） |
| `{currentDate}` | 当前日期（估值日期） |
| `{previousPrice}` | 前值（上一交易日净值） |
| `{previousDate}` | 前值日期 |
| `{rate}` | 当前价格与前值的涨跌幅 |
| `{marketValue}` | 当前基金的市场价值 |
| `{position}` | 当前基金的仓位（份） |
| `{positionRate}` | 当前基金的仓位占比 |
| `{profit}` | 当前基金的整体盈利 |
| `{avgCostPrice}` | 当前基金的平均成本价 |

#### 上下文压缩功能
为了提高AI助手的性能和降低成本，系统实现了智能上下文压缩功能：
1. **阈值管理**：当对话历史超过一定大小（默认10K字符）时触发压缩
2. **AI摘要**：使用配置的AI模型对历史对话进行智能摘要，提取关键信息
3. **分层存储**：
   - `historyContent`：存放已压缩的历史对话
   - `summaryContent`：存放AI生成的摘要内容
   - `newContent`：存放最新对话内容，未被压缩
4. **状态显示**：在AI助手窗口底部显示当前上下文长度和压缩状态
5. **智能合并**：发送给AI模型的上下文为摘要内容与新内容的组合

#### 技术实现
- **组件**：`components/AISidePanel.tsx` - AI助手侧边面板组件
- **服务**：`services/aiService.ts` - AI API通信处理、提示词模板管理
- **配置服务**：`services/aiConfigService.ts` - API配置管理
- **上下文压缩服务**：`services/ContextCompressionService.ts` - 上下文压缩与摘要管理
- **状态管理器**：`services/aiAssistantStateManager.ts` - 会话状态管理
- **模板配置**：`public/assets/config/ai-prompt-templates.json` - 提示词模板
- **集成点**：`components/FundDetailsModal.tsx` - 基金详情页面集成

#### 错误处理
- **未配置AI**：显示提示信息引导用户去配置，发送按钮不可用
- **网络错误**：显示用户友好的消息并提供重试按钮
- **API错误**：显示错误详情而不暴露敏感信息
- **超时错误**：指示超时并提供重试选项

#### 测试要求
- **单元测试**：为AI服务API调用编写单元测试
- **组件测试**：为AISidePanel UI交互编写组件测试
- **集成测试**：测试按钮点击和面板打开功能
- **错误处理测试**：为API故障编写错误处理测试

### AI 投资组合分析 (AI Portfolio Analysis) — 新增功能说明 (v1.25)

#### 概述
AI投资组合分析功能允许用户在持仓窗口中一键获取整个投资组合的AI分析报告，包括风险评估和优化建议。与AI投资助手的单基金交互式对话不同，此功能专注于整体投资组合的只读分析展示。

#### 功能特性
1. **AI分析按钮**：在持仓窗口的摘要行中，放大镜按钮右侧添加"AI分析"按钮
2. **浮窗展示**：点击按钮后打开浮窗，自动执行AI分析
3. **一键分析**：无需用户输入，自动将整个投资组合数据发送给AI进行分析
4. **Markdown渲染**：分析结果以Markdown格式渲染展示
5. **复制功能**：支持将原始Markdown内容复制到剪贴板
6. **可拖动浮窗**：浮窗支持拖动，方便用户调整位置

#### 与AI投资助手的区别
| 特性 | AI投资助手 | AI投资组合分析 |
|------|-----------|---------------|
| 数据范围 | 单个基金 | 整个投资组合 |
| 交互方式 | 交互式对话 | 只读展示 |
| 用户输入 | 支持追问 | 无输入框 |
| 位置 | 侧边面板 | 浮窗 |

#### 界面交互
- **入口位置**：持仓窗口摘要行，放大镜按钮右侧
- **浮窗布局**：
  - 标题栏：显示"AI 投资组合分析"，包含复制按钮和关闭按钮
  - 内容区域：Markdown渲染的分析结果，支持滚动
  - 底部状态栏：显示已连接的模型名称
- **状态显示**：
  - 未配置AI：提示信息 + "去配置"按钮
  - 加载中：加载动画 + "AI正在分析您的投资组合..."
  - 成功：Markdown渲染的分析结果
  - 失败：错误信息 + "重试"按钮
  - 空数据："无投资组合数据"提示

#### 投资组合数据格式
发送给AI的投资组合数据格式：
```
1. 易方达蓝筹精选混合 (005827)
   - 持仓份额: 1000.00份
   - 市场价值: 12345.67元
   - 占比: 25.00%
   - 成本价: 1.2345元

2. 招商中证白酒指数 (161725)
   - 持仓份额: 500.00份
   - 市场价值: 8765.43元
   - 占比: 17.50%
   - 成本价: 0.9876元
```

#### 模板配置
- **配置文件路径**：`public/assets/config/ai-portfolio-analysis-templates.json`
- **模板结构**：
  ```json
  {
    "templates": [
      {
        "id": "portfolio-analysis",
        "name": "投资组合综合分析",
        "description": "对投资组合进行全面分析，包括风险评估和优化建议",
        "enabled": true,
        "template": "请你扮演一个专业的投资顾问，帮我分析我的投资组合..."
      }
    ]
  }
  ```
- **模板规则**：
  - 多模板共存，但只有一个 `enabled: true`
  - 无需UI切换，通过配置文件控制启用哪个模板
  - `{portfolio}` 变量将被替换为格式化的投资组合数据

#### 技术实现
- **组件**：`components/AIPortfolioAnalysisModal.tsx` - 投资组合分析浮窗组件
- **服务**：`services/aiPortfolioService.ts` - 投资组合AI分析服务
- **模板配置**：`public/assets/config/ai-portfolio-analysis-templates.json`
- **复用模块**：
  - `services/aiConfigService.ts` - AI配置管理
  - `services/aiService.ts` - `queryAI` 函数
  - `react-markdown` + `remark-gfm` - Markdown渲染（使用Tailwind Typography的`prose`样式）

#### 安全考虑
- 复用AI投资助手的配置和API密钥
- 不保存分析结果，每次打开都重新请求
- 投资组合数据仅在请求时发送给配置的AI端点

#### 测试要求
- **组件测试**：`tests/components/AIPortfolioAnalysisModal.test.tsx`
  - 未配置AI时显示提示
  - 正常加载流程
  - AI请求成功/失败处理
  - 关闭浮窗功能
  - 空投资组合处理
- **服务测试**：`tests/services/aiPortfolioService.test.ts`
  - 模板加载
  - 投资组合数据格式化
  - AI请求调用
- **集成测试**：`tests/components/PositionsModal.AI.test.tsx`
  - AI分析按钮渲染
  - 点击打开浮窗
