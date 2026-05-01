// tests/utils/tradeRecordValidator.test.ts

import { validateTradeRecord, getValidationTooltip } from '../../utils/tradeRecordValidator';
import { OcrTradeData } from '../../utils/tradeOcrParser';
import { FundMatchResult } from '../../utils/fundNameMatcher';

// Mock marketFundService
jest.mock('../../services/marketFundService', () => ({
  getHistory: jest.fn(),
  getPosition: jest.fn(),
}));

import { getHistory, getPosition } from '../../services/marketFundService';

const mockGetHistory = getHistory as jest.MockedFunction<typeof getHistory>;
const mockGetPosition = getPosition as jest.MockedFunction<typeof getPosition>;

describe('validateTradeRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('基金匹配检查', () => {
    const ocrData: OcrTradeData = {
      fundName: '未知基金XYZ',
      operation: 'buy',
      amount: 10000,
      shares: 1000,
      nav: 1.5,
      fee: 0,
      tradeTime: '2026-04-24 10:00:00',
      tradeDate: '2026-04-24',
    };

    test('未匹配到基金时返回无效', () => {
      const matchResult: FundMatchResult = {
        matched: false,
        similarity: 0.3,
      };

      const result = validateTradeRecord(ocrData, matchResult);

      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors).toContain(
        '未知基金XYZ无法根据基金名称匹配出系统中已有的基金'
      );
    });

    test('匹配成功但无仓位配置时返回无效', () => {
      const matchResult: FundMatchResult = {
        matched: true,
        symbol: '000001',
        matchedName: '测试基金A',
        similarity: 0.9,
        hasPosition: false,
      };

      mockGetPosition.mockReturnValue(undefined);

      const result = validateTradeRecord(ocrData, matchResult);

      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors).toContain(
        '测试基金A匹配到系统中的基金，但该基金没有配置仓位信息'
      );
    });
  });

  describe('价格校验', () => {
    const ocrData: OcrTradeData = {
      fundName: '测试基金A',
      operation: 'buy',
      amount: 10000,
      shares: 1000,
      nav: 1.5000,
      fee: 0,
      tradeTime: '2026-04-24 10:00:00',
      tradeDate: '2026-04-24',
    };

    const matchResult: FundMatchResult = {
      matched: true,
      symbol: '000001',
      matchedName: '测试基金A',
      similarity: 0.9,
      hasPosition: true,
    };

    test('无历史价格数据时返回无效', () => {
      mockGetHistory.mockReturnValue([]);

      const result = validateTradeRecord(ocrData, matchResult);

      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors).toContain(
        '测试基金A在2026-04-24无历史价格数据，无法校验'
      );
    });

    test('价格不一致时返回无效', () => {
      mockGetHistory.mockReturnValue([
        { date: new Date('2026-04-24').getTime(), value: 1.6000 },
      ]);

      const result = validateTradeRecord(ocrData, matchResult);

      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors[0]).toContain('交易价格识别为');
      expect(result.validation.errors[0]).toContain('不一致');
    });

    test('价格一致时继续校验', () => {
      mockGetHistory.mockReturnValue([
        { date: new Date('2026-04-24').getTime(), value: 1.5000 },
      ]);

      // 设置正确的份额计算：(10000 - 0) / 1.5 = 6666.67，但ocrData.shares是1000
      // 所以份额校验会失败，但价格校验应该通过
      const result = validateTradeRecord(ocrData, matchResult);

      expect(result.systemPrice).toBe(1.5);
      // 份额校验失败
      expect(result.validation.isValid).toBe(false);
    });
  });

  describe('份额校验（买入）', () => {
    const matchResult: FundMatchResult = {
      matched: true,
      symbol: '000001',
      matchedName: '测试基金A',
      similarity: 0.9,
      hasPosition: true,
    };

    beforeEach(() => {
      mockGetHistory.mockReturnValue([
        { date: new Date('2026-04-24').getTime(), value: 1.5000 },
      ]);
    });

    test('份额计算一致时校验通过', () => {
      // (10000 - 0) / 1.5 = 6666.67
      const ocrData: OcrTradeData = {
        fundName: '测试基金A',
        operation: 'buy',
        amount: 10000,
        shares: 6666.67,
        nav: 1.5000,
        fee: 0,
        tradeTime: '2026-04-24 10:00:00',
        tradeDate: '2026-04-24',
      };

      const result = validateTradeRecord(ocrData, matchResult);

      expect(result.validation.isValid).toBe(true);
      expect(result.calculatedShares).toBeCloseTo(6666.67, 2);
    });

    test('份额计算不一致时返回无效', () => {
      const ocrData: OcrTradeData = {
        fundName: '测试基金A',
        operation: 'buy',
        amount: 10000,
        shares: 1000, // 错误的份额
        nav: 1.5000,
        fee: 0,
        tradeTime: '2026-04-24 10:00:00',
        tradeDate: '2026-04-24',
      };

      const result = validateTradeRecord(ocrData, matchResult);

      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors[0]).toContain('交易份额识别为');
      expect(result.validation.errors[0]).toContain('不一致');
    });

    test('带手续费时的份额计算', () => {
      // (10000 - 10) / 1.5 = 6660
      const ocrData: OcrTradeData = {
        fundName: '测试基金A',
        operation: 'buy',
        amount: 10000,
        shares: 6660,
        nav: 1.5000,
        fee: 10,
        tradeTime: '2026-04-24 10:00:00',
        tradeDate: '2026-04-24',
      };

      const result = validateTradeRecord(ocrData, matchResult);

      expect(result.validation.isValid).toBe(true);
      expect(result.calculatedShares).toBeCloseTo(6660, 2);
    });
  });

  describe('总额校验（卖出）', () => {
    const matchResult: FundMatchResult = {
      matched: true,
      symbol: '000001',
      matchedName: '测试基金A',
      similarity: 0.9,
      hasPosition: true,
    };

    beforeEach(() => {
      mockGetHistory.mockReturnValue([
        { date: new Date('2026-04-24').getTime(), value: 2.0000 },
      ]);
    });

    test('总额计算一致时校验通过', () => {
      // 5000 * 2 - 0 = 10000
      const ocrData: OcrTradeData = {
        fundName: '测试基金A',
        operation: 'sell',
        amount: 10000,
        shares: 5000,
        nav: 2.0000,
        fee: 0,
        tradeTime: '2026-04-24 10:00:00',
        tradeDate: '2026-04-24',
      };

      const result = validateTradeRecord(ocrData, matchResult);

      expect(result.validation.isValid).toBe(true);
      expect(result.calculatedTotal).toBeCloseTo(10000, 2);
    });

    test('总额计算不一致时返回无效', () => {
      const ocrData: OcrTradeData = {
        fundName: '测试基金A',
        operation: 'sell',
        amount: 8000, // 错误的总额
        shares: 5000,
        nav: 2.0000,
        fee: 0,
        tradeTime: '2026-04-24 10:00:00',
        tradeDate: '2026-04-24',
      };

      const result = validateTradeRecord(ocrData, matchResult);

      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors[0]).toContain('交易总额识别为');
      expect(result.validation.errors[0]).toContain('不一致');
    });

    test('带手续费时的总额计算', () => {
      // 5000 * 2 - 100 = 9900
      const ocrData: OcrTradeData = {
        fundName: '测试基金A',
        operation: 'sell',
        amount: 9900,
        shares: 5000,
        nav: 2.0000,
        fee: 100,
        tradeTime: '2026-04-24 10:00:00',
        tradeDate: '2026-04-24',
      };

      const result = validateTradeRecord(ocrData, matchResult);

      expect(result.validation.isValid).toBe(true);
      expect(result.calculatedTotal).toBeCloseTo(9900, 2);
    });
  });

  describe('价格精度校验', () => {
    const matchResult: FundMatchResult = {
      matched: true,
      symbol: '000001',
      matchedName: '测试基金A',
      similarity: 0.9,
      hasPosition: true,
    };

    test('保留4位小数后一致的价格应该通过', () => {
      // OCR识别: 1.50001，系统: 1.50002，保留4位后都是1.5000
      const ocrData: OcrTradeData = {
        fundName: '测试基金A',
        operation: 'buy',
        amount: 15000,
        shares: 10000,
        nav: 1.50001,
        fee: 0,
        tradeTime: '2026-04-24 10:00:00',
        tradeDate: '2026-04-24',
      };

      mockGetHistory.mockReturnValue([
        { date: new Date('2026-04-24').getTime(), value: 1.50002 },
      ]);

      const result = validateTradeRecord(ocrData, matchResult);

      // 价格校验应该通过（因为保留4位后一致）
      expect(result.systemPrice).toBeDefined();
    });
  });
});

describe('getValidationTooltip', () => {
  test('有效时返回校验通过', () => {
    const validation = { isValid: true, errors: [], warnings: [] };
    expect(getValidationTooltip(validation)).toBe('校验通过');
  });

  test('无效时返回错误信息', () => {
    const validation = {
      isValid: false,
      errors: ['错误1', '错误2'],
      warnings: [],
    };
    expect(getValidationTooltip(validation)).toBe('错误1\n错误2');
  });

  test('单个错误信息', () => {
    const validation = {
      isValid: false,
      errors: ['基金无法匹配'],
      warnings: [],
    };
    expect(getValidationTooltip(validation)).toBe('基金无法匹配');
  });
});