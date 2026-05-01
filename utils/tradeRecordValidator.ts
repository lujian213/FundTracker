// utils/tradeRecordValidator.ts
// 交易记录校验

import { OcrTradeData } from './tradeOcrParser';
import { FundMatchResult } from './fundNameMatcher';
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
  systemPrice?: number;               // 系统中的历史价格
  calculatedShares?: number;          // 计算出的份额（买入时）
  calculatedTotal?: number;           // 计算出的总额（卖出时）
}

/**
 * 校验识别的交易记录
 *
 * 校验逻辑：
 * 1. 基金匹配检查
 * 2. 仓位配置检查
 * 3. 价格校验（无历史价格则无效）
 * 4. 份额校验（买入时）
 * 5. 总额校验（卖出时）
 *
 * @param ocrData OCR识别的交易数据
 * @param matchResult 基金名称匹配结果
 * @returns ValidatedTradeRecord 校验后的交易记录
 */
export function validateTradeRecord(
  ocrData: OcrTradeData,
  matchResult: FundMatchResult
): ValidatedTradeRecord {
  const errors: string[] = [];
  const warnings: string[] = [];

  let systemPrice: number | undefined;
  let calculatedShares: number | undefined;
  let calculatedTotal: number | undefined;

  if (!matchResult.matched) {
    errors.push(`${ocrData.fundName}无法根据基金名称匹配出系统中已有的基金`);
    return {
      ocrData,
      matchResult,
      validation: { isValid: false, errors, warnings },
    };
  }

  const symbol = matchResult.symbol!;
  const matchedName = matchResult.matchedName!;

  if (!matchResult.hasPosition) {
    errors.push(`${matchedName}匹配到系统中的基金，但该基金没有配置仓位信息`);
    return {
      ocrData,
      matchResult,
      validation: { isValid: false, errors, warnings },
    };
  }

  const history = getHistory(symbol);
  const tradeDate = ocrData.tradeDate;

  // 查找交易日期对应的历史价格
  const historyPoint = history.find(h => toLocalDateKey(h.date) === tradeDate);

  if (!historyPoint) {
    // 无历史价格数据，标记为无效（根据设计文档要求C选项）
    errors.push(`${matchedName}在${tradeDate}无历史价格数据，无法校验`);
    return {
      ocrData,
      matchResult,
      validation: { isValid: false, errors, warnings },
    };
  }

  systemPrice = historyPoint.value;

  const ocrPrice = Number(ocrData.nav.toFixed(4));
  const sysPrice = Number(systemPrice.toFixed(4));

  if (ocrPrice !== sysPrice) {
    errors.push(
      `${matchedName}在${tradeDate}的交易价格识别为${ocrPrice}，与系统中该基金在该日期的价格${sysPrice}不一致`
    );
    return {
      ocrData,
      matchResult,
      validation: { isValid: false, errors, warnings },
      systemPrice,
    };
  }

  if (ocrData.operation === 'buy') {
    // 计算份额：shares = (total - fee) / price
    calculatedShares = (ocrData.amount - ocrData.fee) / ocrData.nav;
    const calculatedSharesRounded = Number(calculatedShares.toFixed(2));
    const ocrSharesRounded = Number(ocrData.shares.toFixed(2));

    if (calculatedSharesRounded !== ocrSharesRounded) {
      errors.push(
        `${matchedName}在${tradeDate}的交易份额识别为${ocrSharesRounded}，与根据交易价格${ocrData.nav}和交易总额${ocrData.amount}计算出来的份额${calculatedSharesRounded}不一致`
      );
      return {
        ocrData,
        matchResult,
        validation: { isValid: false, errors, warnings },
        systemPrice,
        calculatedShares,
      };
    }
  }

  if (ocrData.operation === 'sell') {
    // 计算总额：total = shares * price - fee
    calculatedTotal = ocrData.shares * ocrData.nav - ocrData.fee;
    const calculatedTotalRounded = Number(calculatedTotal.toFixed(2));
    const ocrTotalRounded = Number(ocrData.amount.toFixed(2));

    if (calculatedTotalRounded !== ocrTotalRounded) {
      errors.push(
        `${matchedName}在${tradeDate}的交易总额识别为${ocrTotalRounded}，与根据交易价格${ocrData.nav}、手续费${ocrData.fee}和基金份额${ocrData.shares}计算出来的交易总额${calculatedTotalRounded}不一致`
      );
      return {
        ocrData,
        matchResult,
        validation: { isValid: false, errors, warnings },
        systemPrice,
        calculatedTotal,
      };
    }
  }

  return {
    ocrData,
    matchResult,
    validation: { isValid: true, errors, warnings },
    systemPrice,
    calculatedShares,
    calculatedTotal,
  };
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
  // 返回所有错误信息，每行一个
  return validation.errors.join('\n');
}