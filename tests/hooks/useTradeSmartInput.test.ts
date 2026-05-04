// tests/hooks/useTradeSmartInput.test.ts

import { renderHook, act } from '@testing-library/react';
import { useTradeSmartInput } from '../../hooks/useTradeSmartInput';

// Mock dependencies
jest.mock('../../services/ocrService', () => ({
  recognizeImageRaw: jest.fn(),
}));

jest.mock('../../services/systemConfigService', () => ({
  getOcrConcurrency: jest.fn(() => 2),
}));

jest.mock('../../services/marketFundService', () => ({
  addTrade: jest.fn(),
}));

jest.mock('../../utils/tradeOcrParser', () => ({
  parseTradeOcrText: jest.fn(),
}));

jest.mock('../../utils/fundNameMatcher', () => ({
  matchFundByName: jest.fn(),
  matchFundByCode: jest.fn(),
}));

jest.mock('../../utils/tradeRecordValidator', () => ({
  validateTradeRecord: jest.fn(),
  mapOperationToBuySell: jest.fn((op: string) => op === 'sell' ? 'sell' : 'buy'),
}));

jest.mock('../../utils/arrayUtils', () => ({
  chunk: jest.fn((arr, size) => {
    const result = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }),
}));

import { recognizeImageRaw } from '../../services/ocrService';
import { parseTradeOcrText } from '../../utils/tradeOcrParser';
import { matchFundByName, matchFundByCode } from '../../utils/fundNameMatcher';
import { validateTradeRecord } from '../../utils/tradeRecordValidator';
import { addTrade } from '../../services/marketFundService';

const mockRecognizeImageRaw = recognizeImageRaw as jest.MockedFunction<typeof recognizeImageRaw>;
const mockParseTradeOcrText = parseTradeOcrText as jest.MockedFunction<typeof parseTradeOcrText>;
const mockMatchFundByName = matchFundByName as jest.MockedFunction<typeof matchFundByName>;
const mockMatchFundByCode = matchFundByCode as jest.MockedFunction<typeof matchFundByCode>;
const mockValidateTradeRecord = validateTradeRecord as jest.MockedFunction<typeof validateTradeRecord>;
const mockAddTrade = addTrade as jest.MockedFunction<typeof addTrade>;

describe('useTradeSmartInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('初始状态', () => {
    test('初始状态正确', () => {
      const { result } = renderHook(() => useTradeSmartInput());

      expect(result.current.state.isProcessing).toBe(false);
      expect(result.current.state.progress).toBe(0);
      expect(result.current.state.processed).toBe(0);
      expect(result.current.state.total).toBe(0);
      expect(result.current.state.successCount).toBe(0);
      expect(result.current.state.failCount).toBe(0);
      expect(result.current.state.currentOcrText).toBe('');
      expect(result.current.state.ocrRawTexts).toEqual({});
      expect(result.current.state.records).toEqual([]);
      expect(result.current.state.errors).toEqual([]);
    });
  });

  describe('processFiles', () => {
    test('处理成功识别的交易截图', async () => {
      const mockFile = new File(['test'], 'trade1.jpg', { type: 'image/jpeg' });

      // Mock OCR成功
      mockRecognizeImageRaw.mockResolvedValue({
        success: true,
        text: 'test text',
        confidence: 90,
      });

      // Mock解析成功
      mockParseTradeOcrText.mockReturnValue({
        success: true,
        data: [{
          fundName: '测试基金A',
          operation: 'buy',
          amount: 10000,
          shares: 1000,
          nav: 1.5,
          fee: 0,
          tradeTime: '2026-04-24 10:00:00',
          tradeDate: '2026-04-24',
        }],
        format: 'single',
      });

      // Mock匹配成功
      mockMatchFundByName.mockReturnValue({
        matched: true,
        symbol: '000001',
        matchedName: '测试基金A',
        similarity: 0.9,
        hasPosition: true,
      });

      // Mock校验成功
      mockValidateTradeRecord.mockReturnValue({
        ocrData: {
          fundName: '测试基金A',
          operation: 'buy',
          amount: 10000,
          shares: 1000,
          nav: 1.5,
          fee: 0,
          tradeTime: '2026-04-24 10:00:00',
          tradeDate: '2026-04-24',
        },
        matchResult: {
          matched: true,
          symbol: '000001',
          matchedName: '测试基金A',
          similarity: 0.9,
          hasPosition: true,
        },
        validation: { isValid: true, errors: [], warnings: [] },
      });

      const { result } = renderHook(() => useTradeSmartInput());

      await act(async () => {
        await result.current.actions.processFiles([mockFile]);
      });

      expect(result.current.state.isProcessing).toBe(false);
      expect(result.current.state.total).toBe(1);
      expect(result.current.state.processed).toBe(1);
      expect(result.current.state.successCount).toBe(1);
      expect(result.current.state.failCount).toBe(0);
      expect(result.current.state.records.length).toBe(1);
    });

    test('处理OCR失败的情况', async () => {
      const mockFile = new File(['test'], 'trade1.jpg', { type: 'image/jpeg' });

      mockRecognizeImageRaw.mockResolvedValue({
        success: false,
        text: '',
        confidence: 0,
        error: 'OCR识别失败',
      });

      const { result } = renderHook(() => useTradeSmartInput());

      await act(async () => {
        await result.current.actions.processFiles([mockFile]);
      });

      expect(result.current.state.failCount).toBe(1);
      expect(result.current.state.errors.length).toBe(1);
      expect(result.current.state.errors[0].fileName).toBe('trade1.jpg');
    });

    test('处理解析失败的情况', async () => {
      const mockFile = new File(['test'], 'trade1.jpg', { type: 'image/jpeg' });

      mockRecognizeImageRaw.mockResolvedValue({
        success: true,
        text: 'test text',
        confidence: 90,
      });

      mockParseTradeOcrText.mockReturnValue({
        success: false,
        missingFields: ['交易时间'],
      });

      const { result } = renderHook(() => useTradeSmartInput());

      await act(async () => {
        await result.current.actions.processFiles([mockFile]);
      });

      expect(result.current.state.failCount).toBe(1);
      expect(result.current.state.errors[0].message).toContain('无法识别交易信息');
    });

    test('处理校验失败的情况', async () => {
      const mockFile = new File(['test'], 'trade1.jpg', { type: 'image/jpeg' });

      mockRecognizeImageRaw.mockResolvedValue({
        success: true,
        text: 'test text',
        confidence: 90,
      });

      mockParseTradeOcrText.mockReturnValue({
        success: true,
        data: [{
          fundName: '未知基金',
          operation: 'buy',
          amount: 10000,
          shares: 1000,
          nav: 1.5,
          fee: 0,
          tradeTime: '2026-04-24 10:00:00',
          tradeDate: '2026-04-24',
        }],
        format: 'single',
      });

      mockMatchFundByName.mockReturnValue({
        matched: false,
        similarity: 0.3,
      });

      mockValidateTradeRecord.mockReturnValue({
        ocrData: {
          fundName: '未知基金',
          operation: 'buy',
          amount: 10000,
          shares: 1000,
          nav: 1.5,
          fee: 0,
          tradeTime: '2026-04-24 10:00:00',
          tradeDate: '2026-04-24',
        },
        matchResult: { matched: false, similarity: 0.3 },
        validation: {
          isValid: false,
          errors: ['未知基金无法根据基金名称匹配出系统中已有的基金'],
          warnings: [],
        },
      });

      const { result } = renderHook(() => useTradeSmartInput());

      await act(async () => {
        await result.current.actions.processFiles([mockFile]);
      });

      expect(result.current.state.failCount).toBe(1);
      expect(result.current.state.records[0].validation.isValid).toBe(false);
    });
  });

  describe('confirm', () => {
    test('确认添加有效记录', () => {
      const mockRecord = {
        ocrData: {
          fundName: '测试基金A',
          operation: 'buy',
          amount: 10000,
          shares: 1000,
          nav: 1.5,
          fee: 0,
          tradeTime: '2026-04-24 10:00:00',
          tradeDate: '2026-04-24',
        },
        matchResult: {
          matched: true,
          symbol: '000001',
          matchedName: '测试基金A',
          similarity: 0.9,
          hasPosition: true,
        },
        validation: { isValid: true, errors: [], warnings: [] },
      };

      const { result } = renderHook(() => useTradeSmartInput());

      act(() => {
        result.current.actions.confirm([mockRecord]);
      });

      expect(mockAddTrade).toHaveBeenCalledWith('000001', expect.objectContaining({
        date: '2026-04-24',
        type: 'buy',
        shares: 1000,
        price: 1.5,
        fee: 0,
      }));
    });

    test('跳过无效记录', () => {
      const mockInvalidRecord = {
        ocrData: {
          fundName: '未知基金',
          operation: 'buy',
          amount: 10000,
          shares: 1000,
          nav: 1.5,
          fee: 0,
          tradeTime: '2026-04-24 10:00:00',
          tradeDate: '2026-04-24',
        },
        matchResult: { matched: false, similarity: 0.3 },
        validation: {
          isValid: false,
          errors: ['无法匹配'],
          warnings: [],
        },
      };

      const { result } = renderHook(() => useTradeSmartInput());

      act(() => {
        result.current.actions.confirm([mockInvalidRecord]);
      });

      expect(mockAddTrade).not.toHaveBeenCalled();
    });

    test('添加卖出记录', () => {
      const mockSellRecord = {
        ocrData: {
          fundName: '测试基金A',
          operation: 'sell',
          amount: 15000,
          shares: 10000,
          nav: 1.5,
          fee: 100,
          tradeTime: '2026-04-24 10:00:00',
          tradeDate: '2026-04-24',
        },
        matchResult: {
          matched: true,
          symbol: '000001',
          matchedName: '测试基金A',
          similarity: 0.9,
          hasPosition: true,
        },
        validation: { isValid: true, errors: [], warnings: [] },
      };

      const { result } = renderHook(() => useTradeSmartInput());

      act(() => {
        result.current.actions.confirm([mockSellRecord]);
      });

      expect(mockAddTrade).toHaveBeenCalledWith('000001', expect.objectContaining({
        date: '2026-04-24',
        type: 'sell',
        shares: 10000,
        price: 1.5,
        fee: 100,
      }));
    });
  });

  describe('reset', () => {
    test('重置状态', () => {
      const { result } = renderHook(() => useTradeSmartInput());

      // 先设置一些状态
      act(() => {
        result.current.actions.reset();
      });

      expect(result.current.state.isProcessing).toBe(false);
      expect(result.current.state.progress).toBe(0);
      expect(result.current.state.processed).toBe(0);
      expect(result.current.state.total).toBe(0);
      expect(result.current.state.successCount).toBe(0);
      expect(result.current.state.failCount).toBe(0);
      expect(result.current.state.currentOcrText).toBe('');
      expect(result.current.state.ocrRawTexts).toEqual({});
      expect(result.current.state.records).toEqual([]);
      expect(result.current.state.errors).toEqual([]);
    });
  });
});