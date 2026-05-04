// hooks/useTradeSmartInput.ts

import { useState, useCallback } from 'react';
import { recognizeImageRaw } from '../services/ocrService';
import { getOcrConcurrency } from '../services/systemConfigService';
import { addTrade } from '../services/marketFundService';
import { parseTradeOcrText, OcrTradeData, TradeOperation, PARSER_VERSION } from '../utils/tradeOcrParser';
import { matchFundByName, matchFundByCode } from '../utils/fundNameMatcher';
import { validateTradeRecord, ValidatedTradeRecord, mapOperationToBuySell } from '../utils/tradeRecordValidator';
import { chunk } from '../utils/arrayUtils';
import { TradeRecord } from '../types';

/**
 * 交易智能输入错误
 */
export interface TradeSmartInputError {
  fileName: string;
  message: string;
}

/**
 * 解析调试信息
 */
export interface ParseDebugInfo {
  fileName: string;
  rawRecordCount: number;          // 解析出的原始记录数
  afterFilterCount: number;         // 过滤已撤销后的记录数
  matchedCount: number;             // 基金匹配成功数
  unmatchedFunds: string[];         // 匹配失败的基金名称列表
  parseErrors: string[];            // 解析过程中的错误
  parserVersion: string;            // 解析器版本（用于确认代码更新）
}

/**
 * 处理状态
 */
export interface TradeSmartInputState {
  isProcessing: boolean;
  progress: number;
  processed: number;
  total: number;
  successCount: number;
  failCount: number;
  currentFile: string;
  currentOcrText: string;  // DEBUG: 当前OCR识别的原始文本
  ocrRawTexts: Record<string, string>;  // DEBUG: 所有文件的OCR原始文本
  parseDebugInfos: ParseDebugInfo[];  // DEBUG: 解析调试信息
  records: ValidatedTradeRecord[];
  errors: TradeSmartInputError[];
}

/**
 * 操作方法
 */
export interface TradeSmartInputActions {
  processFiles: (files: File[]) => Promise<void>;
  confirm: (selectedRecords: ValidatedTradeRecord[]) => void;
  reset: () => void;
}

/**
 * 交易记录智能输入Hook
 *
 * 处理交易截图的OCR识别、校验和添加
 */
export function useTradeSmartInput(): {
  state: TradeSmartInputState;
  actions: TradeSmartInputActions;
} {
  const [state, setState] = useState<TradeSmartInputState>({
    isProcessing: false,
    progress: 0,
    processed: 0,
    total: 0,
    successCount: 0,
    failCount: 0,
    currentFile: '',
    currentOcrText: '',
    ocrRawTexts: {},
    parseDebugInfos: [],
    records: [],
    errors: [],
  });

  const processFiles = useCallback(async (files: File[]) => {
    // 初始化处理状态
    setState(prev => ({
      ...prev,
      isProcessing: true,
      total: files.length,
      processed: 0,
      successCount: 0,
      failCount: 0,
      records: [],
      errors: [],
      progress: 0,
      currentOcrText: '',
      ocrRawTexts: {},
      parseDebugInfos: [],
    }));

    const concurrency = getOcrConcurrency();
    const results: ValidatedTradeRecord[] = [];
    const errors: TradeSmartInputError[] = [];
    const ocrRawTextsAccum: Record<string, string> = {};
    const parseDebugInfosAccum: ParseDebugInfo[] = [];
    let processed = 0;

    // 分批并发处理
    const batches = chunk(files, concurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(async (file) => {
        // 更新当前处理文件
        setState(prev => ({ ...prev, currentFile: file.name }));

        // OCR识别（纯文本，不解析）
        const ocrResult = await recognizeImageRaw(file);

        // 累积 OCR 原始文本
        if (ocrResult.success) {
          ocrRawTextsAccum[file.name] = ocrResult.text;
        }

        if (!ocrResult.success) {
          throw new Error(ocrResult.error || 'OCR识别失败');
        }

        // 解析交易截图文本（支持多种格式，返回数组）
        const parseResult = parseTradeOcrText(ocrResult.text);

        // DEBUG: 记录解析调试信息
        const debugInfo: ParseDebugInfo = {
          fileName: file.name,
          rawRecordCount: parseResult.data?.length || 0,
          afterFilterCount: 0,
          matchedCount: 0,
          unmatchedFunds: [],
          parseErrors: [],
          parserVersion: PARSER_VERSION,
        };

        if (!parseResult.success || !parseResult.data || parseResult.data.length === 0) {
          const missingFields = parseResult.missingFields?.join('、') || '未知错误';
          debugInfo.parseErrors.push(`无法识别交易信息：缺少${missingFields}`);
          parseDebugInfosAccum.push(debugInfo);
          throw new Error(`无法识别交易信息：缺少${missingFields}`);
        }

        // 处理多笔交易记录
        const validatedRecords: ValidatedTradeRecord[] = [];

        for (const ocrData of parseResult.data) {
          // 过滤已撤销的交易（不显示）
          if (ocrData.status === 'closed') {
            continue;
          }

          debugInfo.afterFilterCount++;

          // pending状态当作正常交易处理，不做特殊过滤

          // 基金匹配：代码优先，名称其次
          let matchResult;
          if (ocrData.fundCode) {
            matchResult = matchFundByCode(ocrData.fundCode);
            if (!matchResult.matched) {
              matchResult = matchFundByName(ocrData.fundName);
            }
          } else {
            matchResult = matchFundByName(ocrData.fundName);
          }

          // DEBUG: 记录匹配结果
          if (matchResult.matched) {
            debugInfo.matchedCount++;
          } else {
            debugInfo.unmatchedFunds.push(ocrData.fundName);
          }

          // 校验交易记录
          const validatedRecord = validateTradeRecord(ocrData, matchResult);

          // 添加文件名用于错误显示
          validatedRecord.fileName = file.name;

          validatedRecords.push(validatedRecord);
        }

        // DEBUG: 累积调试信息
        parseDebugInfosAccum.push(debugInfo);

        return validatedRecords;
      });

      const batchResults = await Promise.allSettled(batchPromises);

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        processed++;

        if (result.status === 'fulfilled') {
          // 一张图片可能有多笔交易，展开添加
          for (const record of result.value) {
            results.push(record);
          }
        } else {
          errors.push({
            fileName: batch[i].name,
            message: result.reason.message,
          });
        }
      }

      // 批量更新状态
      setState(prev => ({
        ...prev,
        processed,
        progress: Math.round((processed / files.length) * 100),
        successCount: results.filter(r => r.validation.isValid).length,
        failCount: errors.length + results.filter(r => !r.validation.isValid).length,
        records: [...results],
        errors: [...errors],
        ocrRawTexts: { ...prev.ocrRawTexts, ...ocrRawTextsAccum },
        parseDebugInfos: [...parseDebugInfosAccum],
      }));
    }

    // 处理完成
    setState(prev => ({
      ...prev,
      isProcessing: false,
      currentFile: '',
      currentOcrText: '',
    }));
  }, []);

  const confirm = useCallback((selectedRecords: ValidatedTradeRecord[]) => {
    for (const record of selectedRecords) {
      if (!record.validation.isValid) continue;
      if (!record.matchResult.symbol) continue;

      const { ocrData } = record;
      const symbol = record.matchResult.symbol;

      // 使用系统价格（如果有）或OCR识别价格
      const price = record.systemPrice ?? ocrData.nav ?? 0;

      // 计算份额（如果没有OCR识别份额）
      const shares = ocrData.shares ?? record.calculatedShares ?? 0;

      // 创建交易记录（定投映射为买入）
      const tradeRecord: TradeRecord = {
        id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        date: ocrData.tradeDate,
        type: mapOperationToBuySell(ocrData.operation),
        shares,
        price,
        fee: ocrData.fee,
      };

      // 添加到基金的交易记录
      addTrade(symbol, tradeRecord);
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      isProcessing: false,
      progress: 0,
      processed: 0,
      total: 0,
      successCount: 0,
      failCount: 0,
      currentFile: '',
      currentOcrText: '',
      ocrRawTexts: {},
      parseDebugInfos: [],
      records: [],
      errors: [],
    });
  }, []);

  return {
    state,
    actions: { processFiles, confirm, reset },
  };
}