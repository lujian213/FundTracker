import {
  fetchConceptSectors,
  fetchIndustrySectors,
  extractTopSectors,
  transformSectorData
} from '../../services/sectorService';
import { SectorData } from '../../types/sectorData';

// Mock fetchJson
jest.mock('../../services/marketNewsService', () => ({
  fetchJson: jest.fn()
}));

import { fetchJson } from '../../services/marketNewsService';

describe('SectorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('transformSectorData', () => {
    test('transforms raw API data to SectorData', () => {
      const rawData = {
        f12: 'BK0428',
        f14: '电力',
        f2: 1994,
        f3: 110,
        f4: 22,
        f20: 100000000000,
        f8: 133,
        f24: 15,
        f25: 3,
        f128: '领涨股A'
      };

      const result = transformSectorData(rawData);

      expect(result.code).toBe('BK0428');
      expect(result.name).toBe('电力');
      expect(result.price).toBe(1994); // API返回值已是正常值，不需要转换
      expect(result.changePercent).toBe(110); // API返回值已是正常值
      expect(result.changeAmount).toBe(22); // API返回值已是正常值
      expect(result.marketCap).toBe(100000000000);
      expect(result.turnoverRate).toBe(133); // API返回值已是正常值
      expect(result.upCount).toBe(15);
      expect(result.downCount).toBe(3);
      expect(result.leadingStock).toBe('领涨股A');
    });

    test('handles missing fields', () => {
      const rawData = {
        f12: 'BK0428',
        f14: '电力'
      };

      const result = transformSectorData(rawData);

      expect(result.code).toBe('BK0428');
      expect(result.name).toBe('电力');
      expect(result.price).toBe(0);
      expect(result.changePercent).toBe(0);
      expect(result.changeAmount).toBe(0);
      expect(result.marketCap).toBe(0);
      expect(result.turnoverRate).toBe(0);
      expect(result.upCount).toBe(0);
      expect(result.downCount).toBe(0);
      expect(result.leadingStock).toBe('');
    });
  });

  describe('fetchConceptSectors', () => {
    test('fetches and transforms concept sectors', async () => {
      const mockResponse = {
        data: {
          diff: [
            { f12: 'BK0428', f14: '电力', f2: 1994, f3: 650, f4: 22, f20: 100000000000, f8: 133, f24: 15, f25: 3, f128: '领涨股A' },
            { f12: 'BK0450', f14: '人工智能', f2: 2000, f3: 800, f4: 25, f20: 500000000000, f8: 150, f24: 20, f25: 5, f128: '领涨股B' }
          ]
        }
      };

      (fetchJson as jest.Mock).mockResolvedValue(mockResponse);

      const sectors = await fetchConceptSectors();

      expect(sectors.length).toBe(2);
      expect(sectors[0].name).toBe('电力');
      expect(sectors[0].changePercent).toBe(650); // API返回值直接使用
      expect(sectors[1].name).toBe('人工智能');
      expect(sectors[1].changePercent).toBe(800); // API返回值直接使用
    });

    test('handles API error', async () => {
      (fetchJson as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(fetchConceptSectors()).rejects.toThrow('获取概念板块数据失败: Network error');
    });

    test('handles empty response', async () => {
      (fetchJson as jest.Mock).mockResolvedValue({ data: { diff: [] } });

      const sectors = await fetchConceptSectors();
      expect(sectors.length).toBe(0);
    });

    test('handles missing data field', async () => {
      (fetchJson as jest.Mock).mockResolvedValue({});

      const sectors = await fetchConceptSectors();
      expect(sectors.length).toBe(0);
    });
  });

  describe('fetchIndustrySectors', () => {
    test('fetches industry sectors with correct fs parameter', async () => {
      const mockResponse = {
        data: {
          diff: [
            { f12: 'BK0428', f14: '银行', f2: 1000, f3: 300, f4: 10, f20: 200000000000, f8: 80, f24: 8, f25: 2, f128: '领涨股C' }
          ]
        }
      };

      (fetchJson as jest.Mock).mockResolvedValue(mockResponse);

      const sectors = await fetchIndustrySectors();

      expect(sectors.length).toBe(1);
      expect(sectors[0].name).toBe('银行');
      expect(sectors[0].changePercent).toBe(300); // API返回值直接使用

      // 验证fetchJson被调用且URL包含正确的fs参数
      expect(fetchJson).toHaveBeenCalled();
      const url = (fetchJson as jest.Mock).mock.calls[0][0];
      expect(url).toContain('m:90+t:2'); // 行业板块参数
    });
  });

  describe('extractTopSectors', () => {
    test('extracts top 10 gainers and losers', () => {
      const sectors: SectorData[] = [
        { code: 'BK001', name: '板块1', price: 100, changePercent: 10, changeAmount: 10, marketCap: 100, turnoverRate: 1, upCount: 10, downCount: 5, leadingStock: '领涨股1' },
        { code: 'BK002', name: '板块2', price: 100, changePercent: 8, changeAmount: 8, marketCap: 200, turnoverRate: 1, upCount: 10, downCount: 5, leadingStock: '领涨股2' },
        { code: 'BK003', name: '板块3', price: 100, changePercent: 6, changeAmount: 6, marketCap: 300, turnoverRate: 1, upCount: 10, downCount: 5, leadingStock: '领涨股3' },
        { code: 'BK004', name: '板块4', price: 100, changePercent: -2, changeAmount: -2, marketCap: 400, turnoverRate: 1, upCount: 10, downCount: 5, leadingStock: '领涨股4' },
        { code: 'BK005', name: '板块5', price: 100, changePercent: -4, changeAmount: -4, marketCap: 500, turnoverRate: 1, upCount: 10, downCount: 5, leadingStock: '领涨股5' },
        { code: 'BK006', name: '板块6', price: 100, changePercent: -6, changeAmount: -6, marketCap: 600, turnoverRate: 1, upCount: 10, downCount: 5, leadingStock: '领涨股6' },
      ];

      const { topGainers, topLosers } = extractTopSectors(sectors);

      expect(topGainers.length).toBe(3);
      expect(topLosers.length).toBe(3);
      expect(topGainers[0].changePercent).toBe(10);
      expect(topLosers[0].changePercent).toBe(-6);
    });

    test('handles less than 20 sectors', () => {
      const sectors: SectorData[] = [
        { code: 'BK001', name: '板块1', price: 100, changePercent: 5, changeAmount: 5, marketCap: 100, turnoverRate: 1, upCount: 10, downCount: 5, leadingStock: '领涨股1' },
        { code: 'BK002', name: '板块2', price: 100, changePercent: -3, changeAmount: -3, marketCap: 200, turnoverRate: 1, upCount: 10, downCount: 5, leadingStock: '领涨股2' },
      ];

      const { topGainers, topLosers } = extractTopSectors(sectors);

      expect(topGainers.length).toBe(1);
      expect(topLosers.length).toBe(1);
    });

    test('sorts sectors by change percent', () => {
      const sectors: SectorData[] = [
        { code: 'BK001', name: '板块1', price: 100, changePercent: 3, changeAmount: 3, marketCap: 100, turnoverRate: 1, upCount: 10, downCount: 5, leadingStock: '领涨股1' },
        { code: 'BK002', name: '板块2', price: 100, changePercent: 10, changeAmount: 10, marketCap: 200, turnoverRate: 1, upCount: 10, downCount: 5, leadingStock: '领涨股2' },
        { code: 'BK003', name: '板块3', price: 100, changePercent: 5, changeAmount: 5, marketCap: 300, turnoverRate: 1, upCount: 10, downCount: 5, leadingStock: '领涨股3' },
      ];

      const { topGainers } = extractTopSectors(sectors);

      expect(topGainers[0].changePercent).toBe(10); // 降序排列
      expect(topGainers[1].changePercent).toBe(5);
      expect(topGainers[2].changePercent).toBe(3);
    });

    test('handles exactly 20 sectors', () => {
      const sectors: SectorData[] = Array.from({ length: 20 }, (_, i) => ({
        code: `BK${String(i).padStart(3, '0')}`,
        name: `板块${i}`,
        price: 100,
        changePercent: i < 10 ? 10 - i : -(i - 9), // 前10涨，后10跌
        changeAmount: 0,
        marketCap: 100,
        turnoverRate: 1,
        upCount: 10,
        downCount: 5,
        leadingStock: '领涨股'
      }));

      const { topGainers, topLosers } = extractTopSectors(sectors);

      expect(topGainers.length).toBe(10);
      expect(topLosers.length).toBe(10);
    });

    test('filters invalid sectors with empty code or name', async () => {
      const mockResponse = {
        data: {
          diff: [
            { f12: 'BK0428', f14: '电力', f3: 650 },
            { f12: '', f14: '无效板块', f3: 500 }, // 无效：code为空
            { f12: 'BK0450', f14: '', f3: 400 }, // 无效：name为空
            { f12: 'BK0451', f14: '人工智能', f3: 300 }
          ]
        }
      };

      (fetchJson as jest.Mock).mockResolvedValue(mockResponse);

      const sectors = await fetchConceptSectors();

      expect(sectors.length).toBe(2);
      expect(sectors[0].name).toBe('电力');
      expect(sectors[1].name).toBe('人工智能');
    });
  });
});