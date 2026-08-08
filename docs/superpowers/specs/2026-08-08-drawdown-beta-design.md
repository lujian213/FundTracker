# 回撤追踪（Beta）设计文档

## 版本信息
- 创建日期：2026-08-08
- 作者：Claude
- 版本：1.0

## 1. 概述

### 1.1 背景
现有的"回撤追踪"功能基于虚拟净值曲线计算回撤，虽然技术上正确，但对投资者来说不够直观。投资者更希望了解"我赚的钱回撤了多少"，而不是"净值回撤了多少"。

### 1.2 目标
在风险监控中心添加新的"回撤追踪（Beta）"tab，基于累计盈亏计算回撤，让投资者直观了解盈利回撤情况。

### 1.3 核心价值
- **直观性**：直接反映"我赚的钱回撤了多少"
- **真实体感**：基于实际盈亏数据，贴近投资体验
- **智能降级**：峰值≤0时自动回退到净值法，确保数据有效性

## 2. 核心设计

### 2.1 回撤计算方法

**混合方案**：
- **累计盈亏优先**：当累计盈亏峰值>0时，基于累计盈亏计算回撤
- **净值法兜底**：当累计盈亏峰值≤0时，回退到现有的净值法

**计算公式**：
```
峰值>0时：回撤 = (累计盈亏峰值 - 当前累计盈亏) / 累计盈亏峰值 × 100%
峰值≤0时：使用现有的净值法回撤计算
```

**适用范围**：
- 整体回撤：采用混合方案
- 各基金回撤：采用混合方案

### 2.2 判断逻辑

```
if (累计盈亏峰值 > 0) {
  使用累计盈亏法计算回撤;
} else {
  回退到净值法（复用现有代码）;
}
```

## 3. 架构设计

### 3.1 文件结构

**新增文件**：
```
utils/drawdownCalculator.ts              - 回撤计算工具（混合方案）
```

**修改文件**：
```
services/riskCalculationService.ts       - 添加 computeRiskSnapshotBeta() 函数
components/RiskMonitor.tsx                - 添加新的tab入口
types/index.ts                            - 添加新的类型定义
features/main-page/feature-risk-monitor.md - 添加回撤追踪（Beta）需求
features/test/feature-test-data-prepare.md - 添加测试用例
smoke-tests/testBedWithData.spec.ts       - 添加测试代码
```

### 3.2 核心组件

**drawdownCalculator.ts**：
- `calculateDrawdownWithFallback()` - 混合方案的主函数
- `calculateDrawdownFromProfit()` - 累计盈亏回撤计算
- `calculateDrawdownFromNav()` - 净值法回撤计算（调用现有函数）

**riskCalculationService.ts**：
- `computeRiskSnapshotBeta()` - Beta版本的风险快照计算

## 4. 数据流设计

### 4.1 整体回撤计算流程

```
用户点击"回撤追踪（新）"tab
    ↓
调用 computeRiskSnapshotBeta()
    ↓
并行获取数据：
    ├─ computeOverallProfit() → 累计盈亏时间线
    └─ computePositionTrendData() → 持仓趋势数据 → calculateNavCurve() → 净值曲线
    ↓
调用 calculateDrawdownWithFallback(累计盈亏时间线, 净值曲线)
    ↓
判断峰值：
    ├─ 峰值>0 → 基于累计盈亏计算回撤
    └─ 峰值≤0 → 回退到净值法（复用现有函数）
    ↓
返回 DrawdownResult（包含method字段）
    ↓
UI层根据method显示不同的hovertip内容
```

### 4.2 各基金回撤计算流程

```
遍历每个基金
    ↓
获取该基金的累计盈亏时间线（从 perFundTimelines）
获取该基金的净值历史
    ↓
调用 calculateDrawdownWithFallback(基金累计盈亏, 基金净值历史)
    ↓
判断峰值：
    ├─ 峰值>0 → 基于累计盈亏计算回撤
    └─ 峰值≤0 → 回退到净值法（复用现有函数）
    ↓
返回基金回撤结果
```

## 5. 类型定义

### 5.1 新增类型

```typescript
/**
 * 回撤计算方法
 */
export type DrawdownMethod = 'profit' | 'nav';

/**
 * 回撤计算结果（统一结构）
 */
export interface DrawdownResult {
  method: DrawdownMethod;          // 实际使用的方法

  // 当前回撤信息
  currentDrawdown: number;
  currentDrawdownDays: number;
  currentPeakDate: string | null;
  currentPeakValue: number;        // 峰值（根据method是累计盈亏或净值）
  currentTroughDate: string | null;
  currentTroughValue: number;
  currentValue: number;            // 当前值（根据method是累计盈亏或净值）

  // 最大回撤信息
  maxDrawdown: number;
  maxDrawdownDays: number;
  maxPeakDate: string | null;
  maxTroughDate: string | null;
  maxPeakValue: number;
  maxTroughValue: number;
}
```

### 5.2 扩展类型

```typescript
export interface RiskSnapshot {
  // ... 现有字段

  // Beta版本新增字段
  drawdownMethod?: DrawdownMethod;  // 整体回撤使用的计算方法
}

export interface FundDrawdown {
  // ... 现有字段

  // Beta版本新增字段
  drawdownMethod?: DrawdownMethod;  // 该基金回撤使用的计算方法
}
```

## 6. UI设计

### 6.1 Tab入口

在 `RiskMonitor.tsx` 中添加新的tab：

```typescript
const tabs = [
  { key: 'overview', label: '风险总览' },
  { key: 'alerts', label: '预警列表' },
  { key: 'concentration', label: '集中度分析' },
  { key: 'drawdown', label: '回撤追踪' },
  { key: 'drawdown-beta', label: '回撤追踪（新）' }, // 新增
];
```

### 6.2 Hovertip显示逻辑

```typescript
// 整体回撤的hovertip
if (drawdownMethod === 'profit') {
  tooltipContent = `
    当前累计盈亏: ${currentValue} 元
    峰值累计盈亏: ${currentPeakValue} 元
    回撤: ${currentDrawdown}%
  `;
} else {
  tooltipContent = `
    当前净值: ${currentValue}
    峰值净值: ${currentPeakValue}
    回撤: ${currentDrawdown}%
  `;
}
```

## 7. 错误处理

### 7.1 边界情况

1. **累计盈亏数据为空**：回退到净值法
2. **净值曲线为空**：返回空结果
3. **基金没有交易记录或持仓信息**：跳过该基金
4. **计算失败**：降级到净值法，记录 console.warn

### 7.2 降级策略

```typescript
try {
  // 尝试基于累计盈亏计算
  return calculateDrawdownFromProfit(...);
} catch (e) {
  console.warn('累计盈亏回撤计算失败，降级到净值法:', e);
  // 降级到净值法
  return calculateDrawdownFromNav(navCurve);
}
```

## 8. 测试策略

### 8.1 单元测试

**tests/utils/drawdownCalculator.test.ts**：

| 测试场景 | 输入 | 预期输出 |
|---------|------|---------|
| 累计盈亏峰值>0 | 峰值+1000，当前+500 | method='profit', 回撤=50% |
| 累计盈亏峰值=0 | 峰值=0，当前-500 | method='nav', 使用净值法 |
| 累计盈亏峰值<0 | 峰值-100，当前-600 | method='nav', 使用净值法 |
| 累计盈亏数据为空 | [] | 回退到净值法 |
| 净值曲线为空 | [] | 返回空结果 |

**tests/services/riskCalculationServiceBeta.test.ts**：

| 测试场景 | 验证点 |
|---------|--------|
| 整体回撤计算 | 正确调用混合方案，返回DrawdownResult |
| 各基金回撤计算 | 遍历所有基金，每个都使用混合方案 |
| 数据为空 | 返回空快照，不抛异常 |
| 单个基金失败 | 跳过失败基金，不影响其他基金 |

### 8.2 Smoke测试

**修改 features/test/feature-test-data-prepare.md**：

测试用例"14. 风险监控中心测试"：

1. 修改第436行：
```
原：验证左侧导航栏有4个Tab：风险总览、预警列表、集中度分析、回撤追踪。
改：验证左侧导航栏有5个Tab：风险总览、预警列表、集中度分析、回撤追踪、回撤追踪（新）。
```

2. 在第454行后添加：
```
  * 回撤追踪（新）Tab：
    - 点击"回撤追踪（新）"Tab，验证回撤状态显示。
    - 验证显示当前回撤幅度、回撤持续天数。
    - 验证恢复进度条显示峰值、低点、当前位置。
    - 验证历史最长恢复天数和预估剩余恢复天数显示。
    - 验证整体回撤和各基金回撤的hovertip显示：如果显示"当前累计盈亏"，则为基于累计盈亏计算；如果显示"当前净值"，则为基于净值计算。
```

## 9. 不在范围内

- 不修改现有的预警逻辑
- 不影响现有的"回撤追踪"tab
- 不添加新的预警类型

## 10. 成功标准

- 界面正确显示"回撤追踪（新）"tab
- 回撤计算采用混合方案（累计盈亏优先，净值法兜底）
- Hovertip根据实际计算方法显示对应内容
- 所有单元测试通过
- Smoke测试通过
- 不影响现有功能