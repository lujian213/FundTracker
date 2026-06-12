// services/importantDataService.ts

import { JobResult } from '../types';
import { ImportantDataType } from './calendarService';
import { ImportantDataSourceBase } from './importantDataSourceBase';
import { UsBeaGdpSource } from './sources/usBeaGdpSource';
import { UsBeaPceSource } from './sources/usBeaPceSource';
import { UsIsmMfgSource } from './sources/usIsmMfgSource';
import { UsIsmSvcSource } from './sources/usIsmSvcSource';
import { ChicagoFedFomcSource } from './sources/usChicagoFedFomcSource';
import { UsBlsCpiSource } from './sources/usBlsCpiSource';
import { UsBlsPpiSource } from './sources/usBlsPpiSource';
import { UsBlsEmploymentSource } from './sources/usBlsEmploymentSource';
import { CensusRetailSalesSource } from './sources/usCensusRetailSalesSource';

/**
 * 美股重要数据源列表
 * 包含所有需要刷新的美股经济数据源
 *
 * 数据源配置说明：
 * - UsBlsCpiSource: 从 BLS 官网获取 CPI 数据（需要代理，不支持 CORS）
 * - UsBlsPpiSource: 从 BLS 官网获取 PPI 数据（需要代理，不支持 CORS）
 * - UsBlsEmploymentSource: 从 BLS 官网获取非农就业数据（需要代理，不支持 CORS）
 * - CensusRetailSalesSource: 从 Census Bureau 官网获取零售销售数据（需要代理，不支持 CORS）
 * - UsBeaGdpSource/PceSource: 从 BEA 获取 GDP/PCE 数据（支持 CORS，直接访问）
 * - ChicagoFedFomcSource: 从 Chicago Fed 获取 FOMC 会议日程（支持 CORS，直接访问）
 * - UsIsmMfgSource/SvcSource: 从 ISM 获取 PMI 数据（需要代理，不支持 CORS）
 */
export const US_DATA_SOURCES: ImportantDataSourceBase[] = [
  new UsBlsCpiSource(),        // CPI（BLS官网）
  new UsBlsPpiSource(),        // PPI（BLS官网）
  new UsBlsEmploymentSource(), // 非农就业（BLS官网）
  new CensusRetailSalesSource(), // 零售销售（Census官网）
  new UsBeaGdpSource(),          // GDP（BEA官网）
  new UsBeaPceSource(),          // PCE（BEA官网）
  new UsIsmMfgSource(),          // ISM 制造业 PMI（ISM官网）
  new UsIsmSvcSource(),          // ISM 服务业 PMI（ISM官网）
  new ChicagoFedFomcSource()     // FOMC（Chicago Fed官网）
];

/**
 * 单个数据源的刷新结果
 */
export interface DataSourceRefreshResult {
  eventType: ImportantDataType;
  eventName: string;
  success: boolean;
  count: number;
  error?: string;
}

/**
 * 重要数据刷新结果
 */
export interface ImportantDataRefreshResult {
  total: number;
  success: number;
  failed: number;
  results: DataSourceRefreshResult[];
}

/**
 * 重要数据服务
 * 统一管理所有美股重要数据源的刷新
 */
export class ImportantDataService {
  private sources: Map<ImportantDataType, ImportantDataSourceBase>;

  constructor() {
    this.sources = new Map();
    for (const source of US_DATA_SOURCES) {
      // 通过 source 的 config 获取 eventType
      // 由于 config 是 protected，需要通过 refresh 返回值间接获取类型
      // 这里我们直接硬编码映射，更可靠
    }
    this.initSourceMap();
  }

  /**
   * 初始化数据源映射
   * 每个数据源对应一个数据类型（单类型数据源）
   */
  private initSourceMap(): void {
    const sourceTypes: Array<{ source: ImportantDataSourceBase; types: ImportantDataType[] }> = [
      { source: new UsBlsCpiSource(), types: ['important_data_us_cpi'] },
      { source: new UsBlsPpiSource(), types: ['important_data_us_ppi'] },
      { source: new UsBlsEmploymentSource(), types: ['important_data_us_nonfarm'] },
      { source: new CensusRetailSalesSource(), types: ['important_data_us_retail'] },
      { source: new UsBeaGdpSource(), types: ['important_data_us_gdp'] },
      { source: new UsBeaPceSource(), types: ['important_data_us_pce'] },
      { source: new UsIsmMfgSource(), types: ['important_data_us_ism_mfg'] },
      { source: new UsIsmSvcSource(), types: ['important_data_us_ism_svc'] },
      { source: new ChicagoFedFomcSource(), types: ['important_data_us_fomc'] }
    ];

    for (const { source, types } of sourceTypes) {
      for (const type of types) {
        if (!this.sources.has(type)) {
          this.sources.set(type, source);
        }
      }
    }
  }

  /**
   * 并行刷新所有美股数据源
   * @returns 所有数据源的刷新结果汇总
   */
  async refreshAllUsData(): Promise<JobResult<ImportantDataRefreshResult>> {
    const results: DataSourceRefreshResult[] = [];

    // 去重：同一个 source 只刷新一次
    const uniqueSources = new Map<ImportantDataSourceBase, ImportantDataType[]>();
    for (const [eventType, source] of this.sources.entries()) {
      if (!uniqueSources.has(source)) {
        uniqueSources.set(source, []);
      }
      uniqueSources.get(source)!.push(eventType);
    }

    // 并行执行所有数据源刷新（每个 source 只刷新一次）
    const refreshPromises = Array.from(uniqueSources.entries()).map(async ([source, eventTypes]) => {
      const sourceName = eventTypes[0]; // 用第一个类型名称代表数据源

      const result = await source.refresh();

      // 返回该 source 对应的所有类型的结果
      // 对于多类型数据源（如 WhitehousePdfSource），一个成功结果覆盖多个类型
      return eventTypes.map(eventType => ({
        eventType,
        eventName: this.getEventName(eventType),
        success: result.success,
        count: Math.ceil(result.count / eventTypes.length),  // 平均分配计数
        error: result.error
      }));
    });

    const refreshResults = await Promise.all(refreshPromises);
    results.push(...refreshResults.flat());

    // 统计结果
    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      success: failed === 0,
      data: {
        total: results.length,
        success,
        failed,
        results
      },
      message: failed === 0
        ? `全部 ${success} 个数据类型刷新成功`
        : `${success} 个成功，${failed} 个失败`
    };
  }

  /**
   * 刷新单个数据源
   * @param eventType 数据源类型
   * @returns 刷新结果
   */
  async refreshSingle(eventType: ImportantDataType): Promise<JobResult<DataSourceRefreshResult>> {
    const source = this.sources.get(eventType);
    if (!source) {
      return {
        success: false,
        message: `未知的数据源类型: ${eventType}`
      };
    }

    const result = await source.refresh();
    return {
      success: result.success,
      data: {
        eventType,
        eventName: this.getEventName(eventType),
        success: result.success,
        count: result.count,
        error: result.error
      },
      message: result.success
        ? `${this.getEventName(eventType)} 刷新成功，共 ${result.count} 条数据`
        : result.error
    };
  }

  /**
   * 获取所有数据源列表
   * @returns 数据源类型列表
   */
  getDataSourceList(): Array<{ eventType: ImportantDataType; eventName: string }> {
    return [
      { eventType: 'important_data_us_cpi', eventName: 'CPI数据公布' },
      { eventType: 'important_data_us_ppi', eventName: 'PPI数据公布' },
      { eventType: 'important_data_us_nonfarm', eventName: '非农数据公布' },
      { eventType: 'important_data_us_gdp', eventName: 'GDP数据公布' },
      { eventType: 'important_data_us_pce', eventName: 'PCE数据公布' },
      { eventType: 'important_data_us_ism_mfg', eventName: 'ISM制造业PMI公布' },
      { eventType: 'important_data_us_ism_svc', eventName: 'ISM服务业PMI公布' },
      { eventType: 'important_data_us_retail', eventName: '零售销售数据公布' },
      { eventType: 'important_data_us_fomc', eventName: 'FOMC议息会议' }
    ];
  }

  /**
   * 获取事件名称
   */
  private getEventName(eventType: ImportantDataType): string {
    const nameMap: Record<ImportantDataType, string> = {
      'important_data_us_cpi': 'CPI数据公布',
      'important_data_us_ppi': 'PPI数据公布',
      'important_data_us_nonfarm': '非农数据公布',
      'important_data_us_gdp': 'GDP数据公布',
      'important_data_us_pce': 'PCE数据公布',
      'important_data_us_ism_mfg': 'ISM制造业PMI公布',
      'important_data_us_ism_svc': 'ISM服务业PMI公布',
      'important_data_us_retail': '零售销售数据公布',
      'important_data_us_fomc': 'FOMC议息会议'
    };
    return nameMap[eventType];
  }
}

// 导出单例
export const importantDataService = new ImportantDataService();

/**
 * 便捷函数：刷新所有重要数据
 */
export async function refreshImportantData(): Promise<JobResult<ImportantDataRefreshResult>> {
  return importantDataService.refreshAllUsData();
}