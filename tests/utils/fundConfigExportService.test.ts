import { exportFundConfig, importFundConfig } from '../../utils/fundConfigExportService';
import * as marketFundService from '../../services/marketFundService';
import * as fileDownload from '../../utils/fileDownload';

// Mock dependencies
jest.mock('../../services/marketFundService');
jest.mock('../../utils/fileDownload');

describe('fundConfigExportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fileDownload.localTimestamp as jest.Mock).mockReturnValue('2026-07-29_12-00-00');
  });

  describe('exportFundConfig', () => {
    it('应该正确导出基金配置（只包含4个字段）', () => {
      const mockFundInfos = [
        {
          ticker: { symbol: '000001', name: '华夏成长混合', market: 'Fund' },
          position: {
            aliasName: '华夏成长',
            trackingIndex: '2.H50036',
            fullCapacity: 10000,
            initialPosition: 2000,
          },
        },
        {
          ticker: { symbol: '000002', name: '易方达消费', market: 'Fund' },
          position: {
            aliasName: null,
            trackingIndex: null,
            fullCapacity: 5000,
            initialPosition: 1000,
          },
        },
      ];

      (marketFundService.getAllFundInfos as jest.Mock).mockReturnValue(mockFundInfos);

      const result = exportFundConfig();

      expect(result.version).toBe('1.0');
      expect(result.exportedAt).toBe('2026-07-29_12-00-00');
      expect(result.funds).toHaveLength(2);

      // 验证只包含4个字段
      expect(result.funds[0]).toEqual({
        symbol: '000001',
        name: '华夏成长混合',
        aliasName: '华夏成长',
        trackingIndex: '2.H50036',
      });

      expect(result.funds[1]).toEqual({
        symbol: '000002',
        name: '易方达消费',
        aliasName: null,
        trackingIndex: null,
      });
    });

    it('应该正确处理没有position的基金', () => {
      const mockFundInfos = [
        {
          ticker: { symbol: '000001', name: '测试基金', market: 'Fund' },
          // 没有 position
        },
      ];

      (marketFundService.getAllFundInfos as jest.Mock).mockReturnValue(mockFundInfos);

      const result = exportFundConfig();

      expect(result.funds).toHaveLength(1);
      expect(result.funds[0]).toEqual({
        symbol: '000001',
        name: '测试基金',
        aliasName: null,
        trackingIndex: null,
      });
    });

    it('应该处理空基金列表', () => {
      (marketFundService.getAllFundInfos as jest.Mock).mockReturnValue([]);

      const result = exportFundConfig();

      expect(result.funds).toHaveLength(0);
    });
  });

  describe('importFundConfig', () => {
    beforeEach(() => {
      const mockPosition = {
        aliasName: '旧名称',
        trackingIndex: null,
        fullCapacity: 10000,
        initialPosition: 2000,
        startDate: '2026-01-01',
        initialPrice: null,
      };

      (marketFundService.getPosition as jest.Mock).mockReturnValue(mockPosition);
    });

    it('应该正确导入基金配置（只更新aliasName和trackingIndex）', () => {
      const importData = {
        version: '1.0',
        exportedAt: '2026-07-29T10:30:00',
        funds: [
          {
            symbol: '000001',
            name: '华夏成长混合',
            aliasName: '新名称',
            trackingIndex: '2.H50036',
          },
        ],
      };

      const result = importFundConfig(importData);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      // 验证只更新了aliasName和trackingIndex
      expect(marketFundService.updatePosition).toHaveBeenCalledWith(
        '000001',
        expect.objectContaining({
          aliasName: '新名称',
          trackingIndex: '2.H50036',
          // 其他字段保持不变
          fullCapacity: 10000,
          initialPosition: 2000,
        })
      );
    });

    it('应该静默跳过不存在的基金', () => {
      (marketFundService.getPosition as jest.Mock).mockReturnValue(undefined);

      const importData = {
        version: '1.0',
        exportedAt: '2026-07-29T10:30:00',
        funds: [
          {
            symbol: '999999',
            name: '不存在的基金',
            aliasName: '测试',
            trackingIndex: null,
          },
        ],
      };

      const result = importFundConfig(importData);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(marketFundService.updatePosition).not.toHaveBeenCalled();
    });

    it('应该在字段为空字符串时不更新', () => {
      const importData = {
        version: '1.0',
        exportedAt: '2026-07-29T10:30:00',
        funds: [
          {
            symbol: '000001',
            name: '华夏成长混合',
            aliasName: '', // 空字符串
            trackingIndex: null,
          },
        ],
      };

      const result = importFundConfig(importData);

      expect(result.imported).toBe(1);

      // 验证保留了旧值
      expect(marketFundService.updatePosition).toHaveBeenCalledWith(
        '000001',
        expect.objectContaining({
          aliasName: '旧名称', // 保留了旧值
        })
      );
    });

    it('应该在格式错误时返回错误', () => {
      const result = importFundConfig(null);

      expect(result.errors).toContain('导入数据不是有效对象');
    });

    it('应该处理缺少funds数组的情况', () => {
      const result = importFundConfig({ version: '1.0' });

      expect(result.errors).toContain('缺少 funds 数组字段');
    });
  });
});