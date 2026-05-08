// services/calendarHolidaySourceService.ts
/**
 * 节假日信息来源配置服务
 * 从配置文件读取各市场节假日信息的来源 URL
 */

import { HolidayType } from './calendarService';

export interface HolidaySourceConfig {
  name: string;
  url: string;
  description: string;
}

export interface CalendarHolidaySourcesConfig {
  sources: Record<HolidayType, HolidaySourceConfig>;
}

let cachedConfig: CalendarHolidaySourcesConfig | null = null;
let pendingLoad: Promise<CalendarHolidaySourcesConfig> | null = null;

/**
 * 加载节假日来源配置
 */
export async function loadCalendarHolidaySources(): Promise<CalendarHolidaySourcesConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (pendingLoad) {
    return pendingLoad;
  }

  pendingLoad = (async () => {
    try {
      const response = await fetch('./assets/config/calendar-holiday-sources.json');
      if (!response.ok) {
        throw new Error(`加载节假日来源配置失败: HTTP ${response.status}`);
      }

      cachedConfig = await response.json();
      return cachedConfig!;
    } catch (e) {
      console.error('[CalendarHolidaySource] 加载配置失败:', e);
      cachedConfig = getDefaultConfig();
      return cachedConfig;
    } finally {
      pendingLoad = null;
    }
  })();

  return pendingLoad;
}

/**
 * 获取指定市场的节假日来源配置
 */
export async function getHolidaySource(type: HolidayType): Promise<HolidaySourceConfig | null> {
  const config = await loadCalendarHolidaySources();
  return config.sources[type] || null;
}

/**
 * 获取所有节假日来源配置
 */
export async function getAllHolidaySources(): Promise<Record<HolidayType, HolidaySourceConfig>> {
  const config = await loadCalendarHolidaySources();
  return config.sources;
}

/**
 * 重置缓存（用于测试或强制刷新）
 */
export function resetCache(): void {
  cachedConfig = null;
  pendingLoad = null;
}

/**
 * 默认配置（当配置文件加载失败时使用）
 */
function getDefaultConfig(): CalendarHolidaySourcesConfig {
  return {
    sources: {
      holiday_china: {
        name: 'A股节假日',
        url: 'https://www.sse.com.cn/disclosure/dealinstruc/closed/',
        description: '上海证券交易所休市安排页面'
      },
      holiday_hk: {
        name: '港股节假日',
        url: 'https://invest101.com.hk/hong-kong-stock-market-holiday',
        description: '港股市场节假日信息'
      },
      holiday_us: {
        name: '美股节假日',
        url: 'https://invest101.com.hk/stock-us-holidays',
        description: '美股市场节假日信息'
      },
      holiday_sg: {
        name: '新加坡股市节假日',
        url: 'https://www.ibfs.com.tw/Stockoverseas/closedday_sp.aspx?xy=2&xt=7',
        description: '新加坡股市休市安排'
      }
    }
  };
}