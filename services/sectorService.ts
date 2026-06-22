import { SectorData } from '../types/sectorData';
import { fetchJson } from './marketNewsService';

/**
 * API固定参数
 */
const UT = 'fa1a66105171779fbdd067425f38a7c2';
const BASE_URL = 'https://push2delay.eastmoney.com/api/qt/clist/get';

/**
 * 请求字段列表
 */
const FIELDS = 'f2,f3,f4,f8,f12,f14,f20,f21,f24,f25,f128';

/**
 * 转换单个板块数据
 */
export function transformSectorData(rawData: any): SectorData {
  return {
    code: rawData.f12 || '',
    name: rawData.f14 || '',
    price: rawData.f2 || 0,
    changePercent: rawData.f3 || 0,
    changeAmount: rawData.f4 || 0,
    marketCap: rawData.f20 || 0,
    turnoverRate: rawData.f8 || 0,
    upCount: rawData.f24 || 0,
    downCount: rawData.f25 || 0,
    leadingStock: rawData.f128 || ''
  };
}

/**
 * 获取概念板块数据
 */
export async function fetchConceptSectors(): Promise<SectorData[]> {
  const timestamp = Date.now();
  // 不使用fid参数，获取全部板块数据（包括涨幅和跌幅）
  const url = `${BASE_URL}?pn=1&pz=500&po=1&np=1&ut=${UT}&fltt=2&invt=2&fs=m:90+t:3&fields=${FIELDS}&_=${timestamp}`;

  try {
    const response: any = await fetchJson(url);

    if (!response?.data?.diff) {
      return [];
    }

    const sectors = (response.data.diff as any[])
      .map(transformSectorData)
      .filter(s => s.code && s.name); // 过滤无效数据

    return sectors;
  } catch (error) {
    throw new Error(`获取概念板块数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * 获取行业板块数据
 */
export async function fetchIndustrySectors(): Promise<SectorData[]> {
  const timestamp = Date.now();
  // 不使用fid参数，获取全部板块数据（包括涨幅和跌幅）
  const url = `${BASE_URL}?pn=1&pz=500&po=1&np=1&ut=${UT}&fltt=2&invt=2&fs=m:90+t:2&fields=${FIELDS}&_=${timestamp}`;

  try {
    const response: any = await fetchJson(url);

    if (!response?.data?.diff) {
      return [];
    }

    const sectors = (response.data.diff as any[])
      .map(transformSectorData)
      .filter(s => s.code && s.name);

    return sectors;
  } catch (error) {
    throw new Error(`获取行业板块数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * 提取涨幅Top10和跌幅Top10
 */
export function extractTopSectors(sectors: SectorData[]): {
  topGainers: SectorData[];
  topLosers: SectorData[];
} {
  // 分离涨幅板块和跌幅板块
  const gainers = sectors.filter(s => s.changePercent > 0);
  const losers = sectors.filter(s => s.changePercent < 0);

  // 按涨跌幅降序排序（涨幅最大的在前）
  const sortedGainers = [...gainers].sort((a, b) => b.changePercent - a.changePercent);

  // 按涨跌幅升序排序（跌幅最大的在前，即负值最小的）
  const sortedLosers = [...losers].sort((a, b) => a.changePercent - b.changePercent);

  // 提取Top10
  const topGainers = sortedGainers.slice(0, Math.min(10, sortedGainers.length));
  const topLosers = sortedLosers.slice(0, Math.min(10, sortedLosers.length));

  return { topGainers, topLosers };
}