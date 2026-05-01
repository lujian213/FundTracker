// hooks/useSmartAddFunds.ts

import { useState, useCallback } from 'react';
import { recognizeImage, OcrResult } from '../services/ocrService';
import { calculateNewPosition, PositionCalcResult } from '../utils/smartFundCalculator';
import { getOcrConcurrency } from '../services/systemConfigService';
import * as marketFundService from '../services/marketFundService';
import { FundPosition, TradeRecord } from '../types';
import { OcrFundData } from '../utils/fundOcrParser';
import { chunk } from '../utils/arrayUtils';

export interface SmartAddFund {
  // OCR 识别结果
  ocrData: OcrFundData;
  // 仓位计算结果
  positionResult: PositionCalcResult;
  // 文件名（用于显示）
  fileName: string;
}

export interface SmartAddError {
  fileName: string;
  message: string;
}

export interface SmartAddState {
  isProcessing: boolean;
  progress: number;
  processed: number;
  total: number;
  successCount: number;
  failCount: number;
  currentFile: string;
  funds: SmartAddFund[];
  errors: SmartAddError[];
  ocrRawTexts: Record<string, string>;  // DEBUG: 所有文件的OCR原始文本
}

export interface SmartAddActions {
  processFiles: (files: File[]) => Promise<void>;
  confirm: (selectedFunds: SmartAddFund[]) => void;
  reset: () => void;
}

export function useSmartAddFunds(): {
  state: SmartAddState;
  actions: SmartAddActions;
} {
  const [state, setState] = useState<SmartAddState>({
    isProcessing: false,
    progress: 0,
    processed: 0,
    total: 0,
    successCount: 0,
    failCount: 0,
    currentFile: '',
    funds: [],
    errors: [],
    ocrRawTexts: {},
  });

  const processFiles = useCallback(async (files: File[]) => {
    setState(prev => ({
      ...prev,
      isProcessing: true,
      total: files.length,
      processed: 0,
      successCount: 0,
      failCount: 0,
      funds: [],
      errors: [],
      progress: 0,
      ocrRawTexts: {},
    }));

    const concurrency = getOcrConcurrency();
    const results: SmartAddFund[] = [];
    const errors: SmartAddError[] = [];
    const ocrRawTextsAccum: Record<string, string> = {};
    let processed = 0;

    const batches = chunk(files, concurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(async (file) => {
        const ocrResult = await recognizeImage(file);

        // 累积 OCR 原始文本到独立变量，避免并发状态竞态
        ocrRawTextsAccum[file.name] = ocrResult.text;

        if (!ocrResult.success || !ocrResult.data) {
          const missingFields = ocrResult.missingFields?.join('、') || ocrResult.error || '未知错误';
          throw new Error(`无法识别必要字段：${missingFields}`);
        }

        const fundCode = ocrResult.data.fundCode;
        const existingFund = marketFundService.getMarketFund(fundCode);
        const existingPosition = existingFund?.info.position || null;
        const fundTrades = marketFundService.getTrades(fundCode);

        const positionResult = calculateNewPosition(
          ocrResult.data,
          existingPosition,
          fundTrades
        );

        if (!positionResult.success) {
          throw new Error(positionResult.error || '仓位计算失败');
        }

        return {
          ocrData: ocrResult.data,
          positionResult,
          fileName: file.name,
        };
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

      // 批量更新状态，创建数组副本确保 React 检测到变化
      setState(prev => ({
        ...prev,
        processed,
        progress: Math.round((processed / files.length) * 100),
        successCount: results.length,
        failCount: errors.length,
        funds: [...results],
        errors: [...errors],
        ocrRawTexts: { ...prev.ocrRawTexts, ...ocrRawTextsAccum },
      }));
    }

    setState(prev => ({
      ...prev,
      isProcessing: false,
      currentFile: '',
    }));
  }, []);

  const confirm = useCallback((selectedFunds: SmartAddFund[]) => {
    for (const fund of selectedFunds) {
      const { ocrData, positionResult } = fund;
      const fundCode = ocrData.fundCode;

      if (positionResult.operationType === 'add') {
        marketFundService.addFund(fundCode, ocrData.fundName || fundCode);
      }

      const position: FundPosition = {
        fullCapacity: positionResult.newPosition.fullCapacity,
        initialPosition: positionResult.newPosition.initialPosition,
        startDate: positionResult.newPosition.startDate,
        initialPrice: positionResult.newPosition.initialPrice,
      };
      marketFundService.updatePosition(fundCode, position);
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
      funds: [],
      errors: [],
      ocrRawTexts: {},
    });
  }, []);

  return {
    state,
    actions: { processFiles, confirm, reset },
  };
}