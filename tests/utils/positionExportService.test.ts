import { exportPositions, buildExportData, validateImportData, importPositions, computeCompareResult } from '../../utils/positionExportService';
import { Ticker, ValuationData } from '../../types';
import { PositionExportData } from '../../types/positionExportTypes';

// Mock computePositions
jest.mock('../../utils/positionHelper', () => ({
  computePositions: jest.fn(),
}));

// Mock backupService.downloadBackupFile
jest.mock('../../utils/backupService', () => ({
  localDateStr: jest.fn(() => '2026-06-23'),
}));

describe('positionExportService', () => {
  describe('buildExportData', () => {
    it('should build export data from current positions', () => {
      const mockComputePositions = require('../../utils/positionHelper').computePositions;
      mockComputePositions.mockReturnValue({
        entries: [
          {
            symbol: '000001',
            name: '华夏成长混合',
            currentShares: 1000.50,
            marketValue: 1234.61,
            fullCapacity: 2000,
            ratio: 0.5,
            color: 'hsl(0,72%,48%)',
          },
          {
            symbol: '000002',
            name: '南方稳健成长',
            currentShares: 500,
            marketValue: 750,
            fullCapacity: 1000,
            ratio: 0.3,
            color: 'hsl(138,65%,62%)',
          },
        ],
        totalMarketValue: 1984.61,
      });

      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '华夏成长混合', market: 'Fund' },
        { id: '2', symbol: '000002', name: '南方稳健成长', market: 'Fund' },
      ];

      const marketData: Record<string, ValuationData> = {
        '000001': {
          symbol: '000001',
          name: '华夏成长混合',
          currentPrice: 1.234,
          previousPrice: 1.200,
          changePercentage: 2.83,
          lastUpdated: '2026-06-23 15:00',
          realtimeDate: '2026-06-23',
          netWorthDate: '2026-06-22',
          valuationDate: '2026-06-23',
          sourceUrl: 'http://example.com',
        },
        '000002': {
          symbol: '000002',
          name: '南方稳健成长',
          currentPrice: 1.5,
          previousPrice: 1.4,
          changePercentage: 7.14,
          lastUpdated: '2026-06-23 15:00',
          realtimeDate: '2026-06-23',
          netWorthDate: '2026-06-22',
          valuationDate: '2026-06-23',
          sourceUrl: 'http://example.com',
        },
      };

      const result = buildExportData(portfolio, marketData);

      expect(result.exportDate).toBe('2026-06-23');
      expect(result.positions).toHaveLength(2);
      expect(result.positions[0]).toEqual({
        symbol: '000001',
        name: '华夏成长混合',
        shares: 1000.50,
        price: 1.234,
      });
      expect(result.positions[1]).toEqual({
        symbol: '000002',
        name: '南方稳健成长',
        shares: 500,
        price: 1.5,
      });
    });

    it('should use previousPrice when currentPrice is 0', () => {
      const mockComputePositions = require('../../utils/positionHelper').computePositions;
      mockComputePositions.mockReturnValue({
        entries: [
          {
            symbol: '000001',
            name: '华夏成长混合',
            currentShares: 1000,
            marketValue: 1200,
            fullCapacity: 2000,
            ratio: 1,
            color: 'hsl(0,72%,48%)',
          },
        ],
        totalMarketValue: 1200,
      });

      const marketData: Record<string, ValuationData> = {
        '000001': {
          symbol: '000001',
          name: '华夏成长混合',
          currentPrice: 0,
          previousPrice: 1.2,
          changePercentage: 0,
          lastUpdated: '2026-06-23 15:00',
          realtimeDate: '2026-06-23',
          netWorthDate: '2026-06-22',
          valuationDate: '2026-06-23',
          sourceUrl: 'http://example.com',
        },
      };

      const result = buildExportData([], marketData);
      expect(result.positions[0].price).toBe(1.2);
    });

    it('should return empty positions when no entries', () => {
      const mockComputePositions = require('../../utils/positionHelper').computePositions;
      mockComputePositions.mockReturnValue({
        entries: [],
        totalMarketValue: 0,
      });

      const result = buildExportData([], {});
      expect(result.positions).toHaveLength(0);
    });
  });

  describe('validateImportData', () => {
    it('should pass valid import data', () => {
      const validData = {
        exportDate: '2026-06-23',
        positions: [
          { symbol: '000001', name: '华夏成长混合', shares: 1000, price: 1.234 },
          { symbol: '000002', name: '南方稳健成长', shares: 500, price: 1.5 },
        ],
      };

      const result = validateImportData(validData);
      expect(result).toBeNull();
    });

    it('should fail when exportDate is missing', () => {
      const invalidData = {
        positions: [
          { symbol: '000001', name: '华夏成长混合', shares: 1000, price: 1.234 },
        ],
      };

      const result = validateImportData(invalidData);
      expect(result).toEqual({
        message: '导入文件格式不正确，请检查文件是否为有效的JSON格式，且包含必要的字段信息。',
      });
    });

    it('should fail when positions array is missing', () => {
      const invalidData = {
        exportDate: '2026-06-23',
      };

      const result = validateImportData(invalidData);
      expect(result).toEqual({
        message: '导入文件格式不正确，请检查文件是否为有效的JSON格式，且包含必要的字段信息。',
      });
    });

    it('should fail when position item missing symbol', () => {
      const invalidData = {
        exportDate: '2026-06-23',
        positions: [
          { name: '华夏成长混合', shares: 1000, price: 1.234 },
        ],
      };

      const result = validateImportData(invalidData);
      expect(result).toEqual({
        message: '导入文件格式不正确，请检查文件是否为有效的JSON格式，且包含必要的字段信息。',
      });
    });

    it('should fail when shares is not a number', () => {
      const invalidData = {
        exportDate: '2026-06-23',
        positions: [
          { symbol: '000001', name: '华夏成长混合', shares: '1000', price: 1.234 },
        ],
      };

      const result = validateImportData(invalidData);
      expect(result).toEqual({
        message: '导入文件格式不正确，请检查文件是否为有效的JSON格式，且包含必要的字段信息。',
      });
    });
  });

  describe('importPositions', () => {
    // Helper to create mock File with text() method
    const createMockFile = (content: string, name: string, type: string = 'application/json'): File => {
      const file = {
        name,
        type,
        size: content.length,
        text: () => Promise.resolve(content),
      } as unknown as File;
      return file;
    };

    it('should successfully import a valid JSON file', async () => {
      const validJson = JSON.stringify({
        exportDate: '2026-06-23',
        positions: [
          { symbol: '000001', name: '华夏成长混合', shares: 1000, price: 1.234 },
          { symbol: '000002', name: '南方稳健成长', shares: 500, price: 1.5 },
        ],
      });

      const file = createMockFile(validJson, 'test.json');
      const result = await importPositions(file);

      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data!.exportDate).toBe('2026-06-23');
      expect(result.data!.positions).toHaveLength(2);
      expect(result.data!.positions[0]).toEqual({
        symbol: '000001',
        name: '华夏成长混合',
        shares: 1000,
        price: 1.234,
      });
    });

    it('should return error when importing a file with invalid JSON', async () => {
      const invalidJson = '{ not valid json }';
      const file = createMockFile(invalidJson, 'invalid.json');

      const result = await importPositions(file);

      expect(result.data).toBeNull();
      expect(result.error).toEqual({
        message: '导入文件格式不正确，请检查文件是否为有效的JSON格式，且包含必要的字段信息。',
      });
    });

    it('should return error when importing a file that fails validation', async () => {
      const invalidData = JSON.stringify({
        exportDate: '2026-06-23',
        positions: [
          { symbol: '000001', name: '华夏成长混合', shares: 'not-a-number', price: 1.234 },
        ],
      });

      const file = createMockFile(invalidData, 'invalid.json');
      const result = await importPositions(file);

      expect(result.data).toBeNull();
      expect(result.error).toEqual({
        message: '导入文件格式不正确，请检查文件是否为有效的JSON格式，且包含必要的字段信息。',
      });
    });
  });

  describe('computeCompareResult', () => {
    beforeEach(() => {
      // Reset mocks
      jest.clearAllMocks();
    });

    it('should merge local and imported funds', () => {
      const mockComputePositions = require('../../utils/positionHelper').computePositions;
      mockComputePositions.mockReturnValue({
        entries: [
          {
            symbol: '000001',
            name: '华夏成长混合',
            currentShares: 1000,
            marketValue: 1234,
            fullCapacity: 2000,
            ratio: 0.6,
            color: 'hsl(0,72%,48%)',
          },
          {
            symbol: '000002',
            name: '南方稳健成长',
            currentShares: 500,
            marketValue: 750,
            fullCapacity: 1000,
            ratio: 0.4,
            color: 'hsl(138,65%,62%)',
          },
        ],
        totalMarketValue: 1984,
      });

      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '华夏成长混合', market: 'Fund' },
        { id: '2', symbol: '000002', name: '南方稳健成长', market: 'Fund' },
      ];

      const marketData: Record<string, ValuationData> = {
        '000001': {
          symbol: '000001',
          name: '华夏成长混合',
          currentPrice: 1.234,
          previousPrice: 1.2,
          changePercentage: 2.83,
          lastUpdated: '2026-06-23 15:00',
          realtimeDate: '2026-06-23',
          netWorthDate: '2026-06-22',
          valuationDate: '2026-06-23',
          sourceUrl: '',
        },
        '000002': {
          symbol: '000002',
          name: '南方稳健成长',
          currentPrice: 1.5,
          previousPrice: 1.4,
          changePercentage: 7.14,
          lastUpdated: '2026-06-23 15:00',
          realtimeDate: '2026-06-23',
          netWorthDate: '2026-06-22',
          valuationDate: '2026-06-23',
          sourceUrl: '',
        },
      };

      const importedData: PositionExportData = {
        exportDate: '2026-06-20',
        positions: [
          { symbol: '000001', name: '华夏成长', shares: 900, price: 1.2 },
          { symbol: '000003', name: '新增基金', shares: 300, price: 2.0 },
        ],
      };

      const result = computeCompareResult(portfolio, marketData, importedData);

      // Should have 3 funds: 000001, 000002 (local), 000003 (imported only)
      expect(result.items).toHaveLength(3);

      // Check 000001 (both have)
      const item001 = result.items.find(i => i.symbol === '000001');
      expect(item001).toBeDefined();
      expect(item001!.name).toBe('华夏成长混合'); // Local name preferred
      expect(item001!.currentShares).toBe(1000);
      expect(item001!.importedShares).toBe(900);
      expect(item001!.sharesDiff).toBe(100);
      // Imported value uses local price: 900 * 1.234 = 1110.6
      expect(item001!.importedValue).toBe(1110.6);
      expect(item001!.ratio).toBeCloseTo(111.11, 2); // 1000/900 * 100

      // Check 000002 (local only)
      const item002 = result.items.find(i => i.symbol === '000002');
      expect(item002).toBeDefined();
      expect(item002!.currentShares).toBe(500);
      expect(item002!.importedShares).toBe(0);
      expect(item002!.importedValue).toBe(0);
      expect(item002!.ratio).toBeNull();

      // Check 000003 (imported only)
      const item003 = result.items.find(i => i.symbol === '000003');
      expect(item003).toBeDefined();
      expect(item003!.name).toBe('新增基金'); // Imported name
      expect(item003!.currentShares).toBe(0);
      expect(item003!.currentValue).toBe(0);
      expect(item003!.importedShares).toBe(300);
      // Imported value: 300 * 2.0 (imported price, no local data)
      expect(item003!.importedValue).toBe(600);
      expect(item003!.ratio).toBeNull();
    });

    it('should calculate totals correctly', () => {
      const mockComputePositions = require('../../utils/positionHelper').computePositions;
      mockComputePositions.mockReturnValue({
        entries: [
          { symbol: '000001', name: 'A', currentShares: 100, marketValue: 100, fullCapacity: 200, ratio: 0.5, color: 'red' },
          { symbol: '000002', name: 'B', currentShares: 200, marketValue: 200, fullCapacity: 400, ratio: 0.5, color: 'blue' },
        ],
        totalMarketValue: 300,
      });

      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: 'A', market: 'Fund' },
      ];

      const marketData: Record<string, ValuationData> = {
        '000001': {
          symbol: '000001',
          name: 'A',
          currentPrice: 1.0,
          previousPrice: 1.0,
          changePercentage: 0,
          lastUpdated: '2026-06-23 15:00',
          realtimeDate: '2026-06-23',
          netWorthDate: '2026-06-22',
          valuationDate: '2026-06-23',
          sourceUrl: '',
        },
      };

      const importedData: PositionExportData = {
        exportDate: '2026-06-20',
        positions: [
          { symbol: '000001', name: 'A', shares: 80, price: 1.0 },
        ],
      };

      const result = computeCompareResult(portfolio, marketData, importedData);

      // Totals
      expect(result.totalCurrentValue).toBe(300);
      expect(result.totalImportedValue).toBe(80); // 80 * 1.0 (local price)
      expect(result.totalValueDiff).toBe(220);
    });

    it('should sort by local display name', () => {
      const mockComputePositions = require('../../utils/positionHelper').computePositions;
      mockComputePositions.mockReturnValue({
        entries: [
          { symbol: '000002', name: 'B基金', currentShares: 100, marketValue: 100, fullCapacity: 200, ratio: 0.5, color: 'red' },
          { symbol: '000001', name: 'A基金', currentShares: 100, marketValue: 100, fullCapacity: 200, ratio: 0.5, color: 'blue' },
        ],
        totalMarketValue: 200,
      });

      const importedData: PositionExportData = {
        exportDate: '2026-06-20',
        positions: [],
      };

      const result = computeCompareResult([], {}, importedData);

      expect(result.items[0].name).toBe('A基金');
      expect(result.items[1].name).toBe('B基金');
    });

    it('should use imported price when no local marketData', () => {
      const mockComputePositions = require('../../utils/positionHelper').computePositions;
      mockComputePositions.mockReturnValue({
        entries: [],
        totalMarketValue: 0,
      });

      const importedData: PositionExportData = {
        exportDate: '2026-06-20',
        positions: [
          { symbol: '000003', name: '新基金', shares: 100, price: 2.5 },
        ],
      };

      const result = computeCompareResult([], {}, importedData);

      const item003 = result.items.find(i => i.symbol === '000003');
      expect(item003!.importedValue).toBe(250); // 100 * 2.5
    });
  });
});