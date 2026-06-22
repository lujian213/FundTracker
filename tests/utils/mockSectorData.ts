import { SectorData } from '../../types/sectorData';

/**
 * Mock板块数据生成工具
 * @param count 生成数量
 * @param type 数据类型：'gainer'涨幅、'loser'跌幅、'mixed'混合
 * @returns SectorData数组
 */
export function mockSectorData(
  count: number,
  type: 'gainer' | 'loser' | 'mixed' = 'mixed'
): SectorData[] {
  return Array.from({ length: count }, (_, i) => {
    let changePercent: number;

    if (type === 'gainer') {
      changePercent = 10 - i * 0.5; // 从10%降到5%
    } else if (type === 'loser') {
      changePercent = -(10 - i * 0.5); // 从-10%升到-5%
    } else {
      changePercent = i % 2 === 0 ? (5 - i * 0.2) : -(5 - i * 0.2);
    }

    return {
      code: `BK${String(1000 + i).padStart(4, '0')}`,
      name: `测试板块${i + 1}`,
      price: 1000 + i * 10,
      changePercent,
      changeAmount: changePercent * 10,
      marketCap: 100000000000 + i * 10000000000, // 100亿到1000亿
      turnoverRate: 2 + i * 0.5,
      upCount: 10 + i,
      downCount: 5 + i,
      leadingStock: `领涨股${i + 1}`
    };
  });
}

/**
 * Mock真实板块数据（基于真实板块名称）
 */
export function mockRealSectorData(): SectorData[] {
  const conceptNames = [
    '人工智能', '新能源汽车', '元宇宙', '数字经济', '芯片',
    '光伏', '储能', '机器人', '量子计算', '区块链'
  ];

  return conceptNames.map((name, i) => ({
    code: `BK${String(400 + i).padStart(4, '0')}`,
    name,
    price: 1500 + i * 50,
    changePercent: 8 - i * 0.8,
    changeAmount: (8 - i * 0.8) * 15,
    marketCap: 500000000000 + i * 50000000000,
    turnoverRate: 3.5 - i * 0.3,
    upCount: 15 - i,
    downCount: 3 + i,
    leadingStock: `领涨股${name}`
  }));
}