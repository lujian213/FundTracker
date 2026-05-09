# FundTracker 与 Eggfund 系统同步功能需求文档

## 概述

本文档描述了 FundTracker 应用程序中新增的功能：从 Eggfund 系统同步历史交易信息。该功能允许用户将来自 Eggfund 系统的交易数据同步到 FundTracker 中，或在必要时将本地数据同步到 Eggfund 系统，并支持手动审核同步内容。

**界面集成**: 本功能的配置管理界面作为系统配置界面的一部分集成，详见 [系统配置管理功能](feature-config-management.md#同步管理)。

## 功能需求

### 1. 同步配置管理
- 用户可在同步管理模块中配置 Eggfund 系统的登录凭据（用户名和密码）
- 支持测试连接功能，验证凭据有效性
- 密码字段需使用掩码显示，确保安全性
- 支持同步配置的导入导出功能

### 2. 数据同步流程

#### 2.1 同步方向
- 支持双向同步：正向同步（从 Eggfund 到 FundTracker）和反向同步（从 FundTracker 到 Eggfund）
- 用户可通过同步开关切换同步方向，默认为正向同步
- 同步方向状态不持久化，每次打开同步确认界面时默认为正向

#### 2.2 数据获取与对比
- 用户可发起同步操作，通过 API 从 Eggfund 系统获取历史交易数据
- 系统首先获取 Eggfund 中的基金列表
- 系统找到与本地基金组合的交集，确定需要同步的基金
- 对每个需要同步的基金，获取其历史交易数据
- 系统对比本地数据与外部数据，按日期和基金分组检测差异

#### 2.3 同步策略

**正向同步（Eggfund → FundTracker）**：
- **新增类型**：将外部数据中的新交易记录添加到本地
- **修改类型**：采用全量替换策略，以日期为单位进行同步
  - 移除该日期的所有本地交易记录
  - 添加该日期的所有外部交易记录
  - 采用"外部数据优先"原则，不保留本地数据的任何信息
- **删除类型**：从本地删除该日期的交易记录

**反向同步（FundTracker → Eggfund）**：
- **新增类型**（正向时的删除）：调用 Eggfund 添加投资记录 API，将本地数据添加到 Eggfund
- **修改类型**：调用 Eggfund 修改投资记录 API，用本地数据更新 Eggfund 数据
- **删除类型**（正向时的新增）：调用 Eggfund 删除投资记录 API，从 Eggfund 删除对应记录

**数据汇总规则**：
- 对于新增和修改类型的记录，需对本地交易按基金按日进行汇总
- 一个基金在同一日只能产生一条最终的记录进行同步
- 份额 = 所有该基金在该日的买入份额总计 - 所有该基金在该日的卖出份额总计
- 手续费 = 所有该基金在该日的交易费用总计

**特殊处理**：
- 对于来自 Eggfund 的交易记录，需记录其交易记录的 id
- 在调用修改 API 时，需要使用原记录的 id
- 如果 Eggfund 系统中存在同一基金在一天里有多条记录的情况，采用"先删除原多条记录，再增加一条新记录"的方式实现修改

### 3. 差异确认界面

#### 3.1 基本展示
- 提供用户确认界面，标注新记录和数据有差异的记录
- 按日期和基金分组展示交易差异
- 标注差异类型：新增、修改、删除
- 对于修改类型的记录，高亮显示具体差异维度
- 提供按基金、时间、差异类型等条件筛选功能
- 支持多选和全选/反选功能
- 支持过滤条件的保存和自动应用功能

#### 3.2 同步方向控制
- 在保存过滤条件按钮下方提供同步方向开关
- 开关默认为正向（从 Eggfund 到 FundTracker）
- 点击可切换为反向（从 FundTracker 到 Eggfund）
- 同步方向状态不保存到过滤条件中

#### 3.3 差异类型映射
- 差异类型根据同步方向开关动态变化：
  - 正向时的"新增" → 反向时的"删除"
  - 正向时的"删除" → 反向时的"新增"
  - "修改"类型在正反向保持一致

#### 3.4 交易信息展示
- 用户确认界面提供日期级别的交易汇总视图
- 交易详情信息展示格式需优化，提高可读性：
  - 单笔交易格式：`买入：6026.69份，手续费：0.00`
  - 汇总信息格式：`方向:买，净份额:6026.69，总费用:0.00`
  - 数字保留两位小数，去除货币符号
- 字体大小和布局优化，避免换行

### 4. 同步过程体验
- 同步过程中的信息显示优化，包括左对齐、防换行等功能
- 同步后保持窗口打开状态并实时更新差异列表
- 使用缓存的 Eggfund 数据重新计算差异，支持连续同步操作
- 同步确认按钮根据同步方向执行相应操作

### 5. 界面入口
- 主界面右上角下拉菜单包含"同步配置"选项，点击后打开同步管理配置界面
- 主界面右上角下拉菜单包含"数据同步"选项，点击后直接启动自动同步流程

### 6. 安全性要求
- 密码字段使用掩码输入
- 不在日志或调试信息中泄露认证信息
- 在导出备份时可选择排除敏感信息
- 过滤条件配置不包含敏感信息
- API 调用时使用 Basic Auth 认证，Authorization header 配置与其他 Eggfund API 保持一致

### 7. 错误处理
- API 连接失败时提供明确的错误信息
- 认证失败时提示用户检查凭据
- 数据转换错误时提供具体字段信息
- 同步过程中断时提供恢复机制
- 过滤条件保存/加载错误时提供提示信息
- 反向同步 API 调用失败时提供详细错误信息

### 8. 备份集成
- 需要集成现有的备份/导出功能以支持同步配置
- 需要集成过滤条件的导入导出功能（在备份数据中包含过滤条件配置）

## Eggfund API 规范

### 获取基金列表
- **API URL**: `https://eggfund.website/api/funds`
- **HTTP 方法**: GET
- **请求头**:
  - `accept: application/json`
  - `Authorization: Basic {base64(username:password)}`
- **返回格式**: 数组，元素结构:
  ```json
  {
    "type": "string",      // "LOCAL_FUND"
    "id": "string",        // 基金代码
    "name": "string",      // 基金名称
    "etf": "boolean",      // 是否ETF
    "priority": "number",
    "url": "string",
    "category": "string",
    "alias": "string",
    "currency": "string",  // "RMB"
    "currencySign": "string"  // "¥"
  }
  ```

### 获取基金历史交易
- **API URL**: `https://eggfund.website/api/invests/{id}/{code}?batch=-1`
- **HTTP 方法**: GET
- **参数**:
  - `{id}`: 用户名 (同步配置中的用户名)
  - `{code}`: 基金代码
  - `batch=-1`: 获取所有历史交易
- **请求头**:
  - `accept: application/json`
  - `Authorization: Basic {base64(username:password)}`
- **返回格式**: 数组，元素结构:
  ```json
  {
    "day": "string",         // 交易日期，格式为 yyyy-MM-dd
    "type": "string",        // "trade"
    "id": "string",          // 交易唯一ID
    "code": "string",        // 基金代码
    "share": "number",       // 交易份额，买入为正数，卖出为负数
    "unitPrice": "number",   // 单价
    "totalSpend": "number",  // 总花费
    "fee": "number",         // 交易手续费
    "tax": "number",         // 税费
    "fxRate": "number",      // 汇率
    "userIndex": "number",
    "enabled": "boolean",
    "batch": "number",
    "comments": "string",    // 备注
    "amount": "number",      // 金额
    "misMatchAlert": "boolean"  // 不匹配警报
  }
  ```

### 添加投资记录
- **API URL**: `https://eggfund.website/api/invest/{id}`
- **HTTP 方法**: PUT
- **参数**:
  - `{id}`: 用户名 (同步配置中的用户名)
- **请求头**:
  - `accept: application/json`
  - `Authorization: Basic {base64(username:password)}`
- **请求体**: 数组格式，可包含多条记录
  ```json
  [
    {
      "day": "2024-09-30",
      "type": "trade",
      "id": "",
      "code": "123456",
      "share": 0,
      "unitPrice": -1,
      "totalSpend": 0,
      "fee": 0,
      "tax": 0,
      "fxRate": 1.0,
      "userIndex": 0,
      "enabled": true,
      "batch": 0,
      "comments": "sync from FundTracker",
      "amount": 0,
      "misMatchAlert": true
    }
  ]
  ```
- **字段说明**:
  - `day`: 交易日期
  - `type`: 固定值 "trade"
  - `id`: 可为空，Eggfund 系统自动生成
  - `code`: 基金代码
  - `share`: 份额，保留2位小数
  - `unitPrice`: 固定值 -1，Eggfund 系统自动计算
  - `fee`: 手续费，保留2位小数
  - 其他字段使用默认值即可

### 修改投资记录
- **API URL**: `https://eggfund.website/api/invest/{id}`
- **HTTP 方法**: POST
- **参数**:
  - `{id}`: 用户名 (同步配置中的用户名)
- **请求头**:
  - `accept: application/json`
  - `Authorization: Basic {base64(username:password)}`
- **请求体**: 单条记录格式
  ```json
  {
    "day": "2024-09-30",
    "type": "trade",
    "id": "Lu-123456-xxx",
    "code": "123456",
    "share": 0,
    "unitPrice": -1,
    "totalSpend": 0,
    "fee": 0,
    "tax": 0,
    "fxRate": 1.0,
    "userIndex": 0,
    "enabled": true,
    "batch": 0,
    "comments": "sync from FundTracker",
    "amount": 0,
    "misMatchAlert": true
  }
  ```
- **字段说明**:
  - `id`: 原记录的交易ID（必须提供）
  - `share`: 修改后的份额，保留2位小数
  - `fee`: 修改后的手续费，保留2位小数
  - 其他字段含义与添加 API 相同

### 删除投资记录
- **API URL**: `https://eggfund.website/api/invest/{id}?investIds=Lu-12345&investIds=Lu-54321`
- **HTTP 方法**: DELETE
- **参数**:
  - `{id}`: 用户名 (同步配置中的用户名)
  - `investIds`: 交易ID列表，可传递多个
- **请求头**:
  - `accept: application/json`
  - `Authorization: Basic {base64(username:password)}`

## 用户体验流程

1. 用户打开同步管理界面，输入 Eggfund 系统的用户名和密码
2. 用户点击"测试连接"验证凭据有效性
3. 用户保存配置并关闭同步管理界面
4. 用户在主界面触发同步操作
5. 系统自动获取 Eggfund 基金列表并与本地基金取交集
6. 系统获取交集内基金的历史交易数据
7. 系统比较本地数据与外部数据，按日期和基金计算差异
8. 系统打开同步确认界面，展示差异列表（默认正向同步）
9. 系统自动加载和应用之前保存的过滤条件
10. 用户可选择切换同步方向开关为反向同步
11. 差异类型根据同步方向动态调整（新增/删除互换）
12. 用户使用筛选器缩小选择范围
13. 用户勾选要同步的日期记录
14. 用户可选择点击"保存过滤条件"按钮，保存当前筛选状态
15. 用户点击确认同步按钮：
    - 正向同步：更新 FundTracker 本地数据
    - 反向同步：调用 Eggfund API 更新 Eggfund 数据
16. 界面保持打开状态，显示同步结果，并使用之前缓存的数据重新计算差异
17. 用户可以继续选择其他差异项进行同步，或关闭窗口