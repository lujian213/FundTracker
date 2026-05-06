// utils/tradeRecordValidator.ts
// 交易记录校验

import { OcrTradeData, TradeOperation } from './tradeOcrParser';
import { FundMatchResult, matchFundByName, matchFundByCode } from './fundNameMatcher';
import { getHistory, getPosition } from '../services/marketFundService';
import { toLocalDateKey } from './priceResolver';

/**
 * 校验结果
 */
export interface ValidationResult {
  isValid: boolean;           // 是否有效
  errors: string[];           // 错误信息列表
  warnings: string[];         // 警告信息列表（不影响有效性）
}

/**
 * 校验后的交易记录（包含校验结果）
 */
export interface ValidatedTradeRecord {
  fileName?: string;                  // 文件名（用于错误显示）
  ocrData: OcrTradeData;              // OCR识别数据
  matchResult: FundMatchResult;       // 基金匹配结果
  validation: ValidationResult;       // 校验结果
  systemPrice?: number;               // 系统中的历史价格（用于显示）
  calculatedShares?: number;          // 计算出的份额（买入时）
  calculatedTotal?: number;           // 计算出的总额（卖出时）
  // UI显示相关字段（由校验器计算，UI直接使用）
  priceMismatch?: boolean;            // 价格不一致
  sharesMismatch?: boolean;           // 份额不一致（买入）
  amountMismatch?: boolean;           // 总额不一致（卖出）
}

/**
 * 将操作类型映射为买入/卖出（定投映射为买入）
 */
export function mapOperationToBuySell(operation: TradeOperation): 'buy' | 'sell' {
  if (operation === 'sell') return 'sell';
  return 'buy';  // buy 和 dingtou 都映射为 buy
}

/**
 * 校验识别的交易记录
 *
 * 校验逻辑：
 * 1. 已撤销(closed)状态直接返回无效，不参与校验
 * 2. 基金匹配检查（代码优先，名称其次）
 * 3. 仓位配置检查
 * 4. 价格校验（无历史价格则无效）
 * 5. 份额校验（买入时，有份额才校验）
 * 6. 总额校验（卖出时）
 *
 * @param ocrData OCR识别的交易数据
 * @param matchResult 基金名称匹配结果（可选，如未提供则自动匹配）
 * @returns ValidatedTradeRecord 校验后的交易记录
 */
export function validateTradeRecord(
  ocrData: OcrTradeData,
  matchResult?: FundMatchResult
): ValidatedTradeRecord {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. 已撤销状态直接返回无效
  if (ocrData.status === 'closed') {
    return {
      ocrData,
      matchResult: { matched: false, similarity: 0 },
      validation: {
        isValid: false,
        errors: ['交易已撤销'],
        warnings: [],
      },
    };
  }

  // 2. 基金匹配检查（代码优先，名称其次）
  let finalMatchResult: FundMatchResult;

  if (ocrData.fundCode) {
    // 有基金代码，优先按代码匹配
    const codeMatch = matchFundByCode(ocrData.fundCode);
    if (codeMatch.matched) {
      finalMatchResult = codeMatch;
    } else {
      // 代码匹配失败，尝试名称匹配
      finalMatchResult = matchFundByName(ocrData.fundName);
      if (!finalMatchResult.matched) {
        errors.push(`${ocrData.fundCode}识别出来的基金代码在系统中不存在，且${ocrData.fundName}无法根据基金名称匹配出系统中已有的基金`);
        return {
          ocrData,
          matchResult: { matched: false, similarity: 0 },
          validation: { isValid: false, errors, warnings },
        };
      }
    }
  } else {
    // 无基金代码，按名称匹配
    if (!matchResult) {
      matchResult = matchFundByName(ocrData.fundName);
    }
    finalMatchResult = matchResult;

    if (!finalMatchResult.matched) {
      errors.push(`${ocrData.fundName}无法根据基金名称匹配出系统中已有的基金`);
      return {
        ocrData,
        matchResult,
        validation: { isValid: false, errors, warnings },
      };
    }
  }

  const symbol = finalMatchResult.symbol!;
  const matchedName = finalMatchResult.matchedName!;

  // 3. 仓位配置检查
  if (!finalMatchResult.hasPosition) {
    errors.push(`${matchedName}匹配到系统中的基金，但该基金没有配置仓位信息`);
    return {
      ocrData,
      matchResult: finalMatchResult,
      validation: { isValid: false, errors, warnings },
    };
  }

  const history = getHistory(symbol);
  const tradeDate = ocrData.tradeDate;

  // 4. 查找交易日期对应的历史价格
  const historyPoint = history.find(h => toLocalDateKey(h.date) === tradeDate);

  if (!historyPoint) {
    errors.push(`${matchedName}在${tradeDate}无历史价格数据，无法校验`);
    return {
      ocrData,
      matchResult: finalMatchResult,
      validation: { isValid: false, errors, warnings },
    };
  }

  const systemPrice = historyPoint.value;

  // 5. 价格校验（如果有OCR识别价格）
  if (ocrData.nav !== undefined && ocrData.nav !== 0) {
    const ocrPrice = Number(ocrData.nav.toFixed(2));
    const sysPrice = Number(systemPrice.toFixed(2));

    if (ocrPrice !== sysPrice) {
      errors.push(
        `${matchedName}在${tradeDate}的交易价格识别为${ocrPrice}，与系统中该基金在该日期的价格${sysPrice}不一致`
      );
      return {
        ocrData,
        matchResult: finalMatchResult,
        validation: { isValid: false, errors, warnings },
        systemPrice,
        priceMismatch: true,
      };
    }
  }

  // 将操作类型映射为买入/卖出
  const effectiveOperation = mapOperationToBuySell(ocrData.operation);

  // 6. 份额校验（买入时，如果有份额信息）
  if (effectiveOperation === 'buy' && ocrData.shares !== undefined && ocrData.shares !== 0) {
    // 计算份额：shares = (total - fee) / price（使用系统价格）
    const calculatedShares = (ocrData.amount - ocrData.fee) / systemPrice;
    const calculatedSharesRounded = Number(calculatedShares.toFixed(2));
    const ocrSharesRounded = Number(ocrData.shares.toFixed(2));

    if (calculatedSharesRounded !== ocrSharesRounded) {
      // 使用OCR识别的价格（如果有）进行错误提示，否则使用系统价格
      const priceForMessage = ocrData.nav !== undefined ? ocrData.nav : systemPrice;
      errors.push(
        `${matchedName}在${tradeDate}的交易份额识别为${ocrSharesRounded}，与根据交易价格${priceForMessage}和交易总额${ocrData.amount}计算出来的份额${calculatedSharesRounded}不一致`
      );
      return {
        ocrData,
        matchResult: finalMatchResult,
        validation: { isValid: false, errors, warnings },
        systemPrice,
        calculatedShares,
        sharesMismatch: true,
      };
    }
  }

  // 7. 总额校验（卖出时，如果有份额信息）
  if (effectiveOperation === 'sell' && ocrData.shares !== undefined && ocrData.shares !== 0) {
    // 计算总额：total = shares * price - fee（使用系统价格）
    const calculatedTotal = ocrData.shares * systemPrice - ocrData.fee;
    const calculatedTotalRounded = Number(calculatedTotal.toFixed(2));
    const ocrTotalRounded = Number(ocrData.amount.toFixed(2));

    if (calculatedTotalRounded !== ocrTotalRounded) {
      const priceForMessage = ocrData.nav !== undefined ? ocrData.nav : systemPrice;
      errors.push(
        `${matchedName}在${tradeDate}的交易总额识别为${ocrTotalRounded}，与根据交易价格${priceForMessage}、手续费${ocrData.fee}和基金份额${ocrData.shares}计算出来的交易总额${calculatedTotalRounded}不一致`
      );
      return {
        ocrData,
        matchResult: finalMatchResult,
        validation: { isValid: false, errors, warnings },
        systemPrice,
        calculatedTotal,
        amountMismatch: true,
      };
    }
  }

  // 8. 计算份额/总额（用于UI显示和缺失字段补充）
  let calculatedShares: number | undefined;
  let calculatedTotal: number | undefined;

  // 买入时计算份额：share = (amount - fee) / price
  if (effectiveOperation === 'buy') {
    calculatedShares = (ocrData.amount - ocrData.fee) / systemPrice;
  }

  // 卖出时计算份额：share = (amount + fee) / price（用于UI显示）
  if (effectiveOperation === 'sell') {
    calculatedShares = (ocrData.amount + ocrData.fee) / systemPrice;
    // 如果有份额信息，也计算总额（用于校验对比）
    if (ocrData.shares !== undefined && ocrData.shares !== 0) {
      calculatedTotal = ocrData.shares * systemPrice - ocrData.fee;
    }
  }

  return {
    ocrData,
    matchResult: finalMatchResult,
    validation: { isValid: true, errors, warnings },
    systemPrice,
    calculatedShares,
    calculatedTotal,
  };
}

/**
 * 批量校验交易记录
 *
 * @param ocrDataList OCR识别的交易数据列表
 * @returns ValidatedTradeRecord[] 校验后的交易记录列表
 */
export function validateTradeRecords(ocrDataList: OcrTradeData[]): ValidatedTradeRecord[] {
  return ocrDataList.map(ocrData => validateTradeRecord(ocrData));
}

/**
 * 获取校验结果的hover提示文本
 *
 * @param validation 校验结果
 * @returns hover提示文本
 */
export function getValidationTooltip(validation: ValidationResult): string {
  if (validation.isValid) {
    return '校验通过';
  }
  return validation.errors.join('\n');
}