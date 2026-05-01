// hooks/useTradeSmartInput.ts

import { useState, useCallback } from 'react';
import { recognizeImageRaw } from '../services/ocrService';
import { getOcrConcurrency } from '../services/systemConfigService';
import { addTrade } from '../services/marketFundService';
import { parseTradeScreenshotText, OcrTradeData } from '../utils/tradeOcrParser';
import { matchFundByName } from '../utils/fundNameMatcher';
import { validateTradeRecord, ValidatedTradeRecord } from '../utils/tradeRecordValidator';
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
    }));

    const concurrency = getOcrConcurrency();
    const results: ValidatedTradeRecord[] = [];
    const errors: TradeSmartInputError[] = [];
    const ocrRawTextsAccum: Record<string, string> = {}; // 累积 OCR 文本，避免并发状态竞态
    let processed = 0;

    // 分批并发处理
    const batches = chunk(files, concurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(async (file) => {
        // 更新当前处理文件（不涉及并发数据累积，单独更新）
        setState(prev => ({ ...prev, currentFile: file.name }));

        // OCR识别（纯文本，不解析）
        const ocrResult = await recognizeImageRaw(file);

        // 累积 OCR 原始文本到独立变量，避免并发状态竞态
        if (ocrResult.success) {
          ocrRawTextsAccum[file.name] = ocrResult.text;
        }

        if (!ocrResult.success) {
          throw new Error(ocrResult.error || 'OCR识别失败');
        }

        // 解析交易截图文本
        const parseResult = parseTradeScreenshotText(ocrResult.text);

        if (!parseResult.success || !parseResult.data) {
          const missingFields = parseResult.missingFields?.join('、') || '未知错误';
          throw new Error(`无法识别交易信息：缺少${missingFields}`);
        }

        const ocrData = parseResult.data;

        // 基金名称匹配
        const matchResult = matchFundByName(ocrData.fundName);

        // 校验交易记录
        const validatedRecord = validateTradeRecord(ocrData, matchResult);

        // 添加文件名用于错误显示
        validatedRecord.fileName = file.name;

        return validatedRecord;
      });

      const batchResults = await Promise.allSettled(batchPromises);

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        processed++;

        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          errors.push({
            fileName: batch[i].name,
            message: result.reason.message,
          });
        }
      }

      // 批量更新状态（创建数组副本确保 React 检测到变化）
      setState(prev => ({
        ...prev,
        processed,
        progress: Math.round((processed / files.length) * 100),
        successCount: results.filter(r => r.validation.isValid).length,
        failCount: errors.length + results.filter(r => !r.validation.isValid).length,
        records: [...results],  // 创建副本确保引用变化
        errors: [...errors],    // 创建副本确保引用变化
        ocrRawTexts: { ...prev.ocrRawTexts, ...ocrRawTextsAccum },
      }));
    }

    // 处理完成
    setState(prev => ({
      ...prev,
      isProcessing: false,
      currentFile: '',
      currentOcrText: '', // 清空当前显示的 OCR 文本
    }));
  }, []);

  const confirm = useCallback((selectedRecords: ValidatedTradeRecord[]) => {
    for (const record of selectedRecords) {
      if (!record.validation.isValid) continue;
      if (!record.matchResult.symbol) continue;

      const { ocrData } = record;
      const symbol = record.matchResult.symbol;

      // 创建交易记录
      const tradeRecord: TradeRecord = {
        id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        date: ocrData.tradeDate,
        type: ocrData.operation,
        shares: ocrData.shares,
        price: ocrData.nav,
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
      records: [],
      errors: [],
    });
  }, []);

  return {
    state,
    actions: { processFiles, confirm, reset },
  };
}