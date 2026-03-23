# FundTracker 与 Eggfund 系统同步功能架构设计

## 概述

本文档描述了 FundTracker 应用程序中新增的功能：从 Eggfund 系统同步历史交易信息。该功能允许用户将来自 Eggfund 系统的交易数据同步到 FundTracker 中，并在必要时进行手动审核。

## 功能需求

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

## 技术规格

### Eggfund API 规范

#### 获取基金列表
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

#### 获取基金历史交易
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

## 架构设计

### 1. 模块结构

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

### 2. 核心数据类型

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

### 3. 同步服务层

#### eggfundService.ts
- `getEggfundFunds(username: string, password: string)`: Promise<EggfundFund[]>
- `getHistoricalTrades(username: string, password: string, fundCode: string)`: Promise<EggfundTradeRecord[]>
- `authenticate(username: string, password: string)`: Promise<boolean>

#### syncService.ts
- `compareTrades(localTrades: TradeRecord[], externalTrades: EggfundTradeRecord[])`: TradeDifference[]
- `transformEggfundData(externalData: EggfundTradeRecord[], fundCode: string)`: TradeRecord[]
- `syncSelectedTrades(differences: TradeDifference[], selectedItems: TradeDifference[])`: Promise<void>
- `calculateDateTradeGroup(trades: TradeRecord[]): DateTradeGroup`
- `applySyncUpdates(selectedDifferences: TradeDifference[]): void` - 应用同步更新到本地数据

### 4. 组件设计

#### SyncManagementModal.tsx
- 配置用户名和密码输入表单
- 密码字段使用掩码显示
- 测试连接功能
- 保存配置到本地存储

#### SyncConfirmationModal.tsx
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

### 5. 安全考虑

- 密码字段使用掩码输入（type="password"）
- 不在日志或调试信息中泄露认证信息
- 在导出备份时可选择排除敏感信息
- 遵循现有的本地存储安全最佳实践
- 使用 Base64 编码传输认证信息
- 过滤条件配置不包含敏感信息

### 6. 用户体验流程

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

## 集成点

- 需要更新 `types.ts` 添加新的同步配置类型
- 需要扩展备份/导出功能以支持同步配置
- 需要集成现有的交易管理功能
- 需要适配现有的国际化文本资源
- 需要在主界面右上角菜单中添加同步配置入口（位于备份设置下方）
- 需要在主界面右上角菜单中添加数据同步入口（位于同步配置下方）
- 需要支持过滤条件的保存和自动应用功能
- 需要集成过滤条件的导入导出功能（在备份数据中包含过滤条件配置）

## 界面入口

- 主界面右上角下拉菜单包含"同步配置"选项，点击后打开同步管理配置界面
- 主界面右上角下拉菜单包含"数据同步"选项，点击后直接启动自动同步流程：
  - 自动获取 eggfund 基金列表
  - 与本地基金组合取交集
  - 对交集内基金逐个获取历史交易
  - 比较本地与外部数据并显示差异确认界面
  - 自动加载和应用之前保存的过滤条件

## 错误处理

- API 连接失败时提供明确的错误信息
- 认证失败时提示用户检查凭据
- 数据转换错误时提供具体字段信息
- 同步过程中断时提供恢复机制
- 过滤条件保存/加载错误时提供提示信息