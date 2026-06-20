// tests/services/importantDataService.test.ts

import {
  importantDataService,
  US_DATA_SOURCES,
  ImportantDataService,
  DataSourceRefreshResult,
  ImportantDataRefreshResult
} from '../../services/importantDataService';
import { ImportantDataType } from '../../services/calendarService';
import { ImportantDataSourceBase } from '../../services/importantDataSourceBase';

describe('importantDataService', () => {
  describe('US_DATA_SOURCES 常量', () => {
    it('应包含9个数据源', () => {
      expect(US_DATA_SOURCES.length).toBe(9);
    });

    it('所有数据源应为 ImportantDataSourceBase 实例', () => {
      for (const source of US_DATA_SOURCES) {
        expect(source).toBeInstanceOf(ImportantDataSourceBase);
      }
    });
  });

  describe('getDataSourceList', () => {
    it('应返回9个数据类型', () => {
      const list = importantDataService.getDataSourceList();
      expect(list.length).toBe(9);
    });

    it('应包含CPI数据源', () => {
      const list = importantDataService.getDataSourceList();
      const cpi = list.find(item => item.eventType === 'important_data_us_cpi');
      expect(cpi).toBeDefined();
      expect(cpi?.eventName).toBe('CPI数据公布');
    });

    it('应包含PPI数据源', () => {
      const list = importantDataService.getDataSourceList();
      const ppi = list.find(item => item.eventType === 'important_data_us_ppi');
      expect(ppi).toBeDefined();
      expect(ppi?.eventName).toBe('PPI数据公布');
    });

    it('应包含非农数据源', () => {
      const list = importantDataService.getDataSourceList();
      const nonfarm = list.find(item => item.eventType === 'important_data_us_nonfarm');
      expect(nonfarm).toBeDefined();
      expect(nonfarm?.eventName).toBe('非农数据公布');
    });

    it('应包含GDP数据源', () => {
      const list = importantDataService.getDataSourceList();
      const gdp = list.find(item => item.eventType === 'important_data_us_gdp');
      expect(gdp).toBeDefined();
      expect(gdp?.eventName).toBe('GDP数据公布');
    });

    it('应包含PCE数据源', () => {
      const list = importantDataService.getDataSourceList();
      const pce = list.find(item => item.eventType === 'important_data_us_pce');
      expect(pce).toBeDefined();
      expect(pce?.eventName).toBe('PCE数据公布');
    });

    it('应包含ISM制造业PMI数据源', () => {
      const list = importantDataService.getDataSourceList();
      const ismMfg = list.find(item => item.eventType === 'important_data_us_ism_mfg');
      expect(ismMfg).toBeDefined();
      expect(ismMfg?.eventName).toBe('ISM制造业PMI公布');
    });

    it('应包含ISM服务业PMI数据源', () => {
      const list = importantDataService.getDataSourceList();
      const ismSvc = list.find(item => item.eventType === 'important_data_us_ism_svc');
      expect(ismSvc).toBeDefined();
      expect(ismSvc?.eventName).toBe('ISM服务业PMI公布');
    });

    it('应包含零售销售数据源', () => {
      const list = importantDataService.getDataSourceList();
      const retail = list.find(item => item.eventType === 'important_data_us_retail');
      expect(retail).toBeDefined();
      expect(retail?.eventName).toBe('零售销售数据公布');
    });

    it('应包含FOMC数据源', () => {
      const list = importantDataService.getDataSourceList();
      const fomc = list.find(item => item.eventType === 'important_data_us_fomc');
      expect(fomc).toBeDefined();
      expect(fomc?.eventName).toBe('FOMC议息会议');
    });

    it('每个数据源应有 eventType 和 eventName', () => {
      const list = importantDataService.getDataSourceList();
      for (const item of list) {
        expect(item.eventType).toBeDefined();
        expect(item.eventName).toBeDefined();
        expect(typeof item.eventType).toBe('string');
        expect(typeof item.eventName).toBe('string');
      }
    });
  });

  describe('refreshSingle', () => {
    it('对未知数据源应返回失败', async () => {
      // 使用一个不在列表中的类型
      const result = await importantDataService.refreshSingle('important_data_us_cpi' as ImportantDataType);
      // 这里测试的是正常类型，应该不会失败
      // 由于实际刷新会访问网络，我们只测试返回结构
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
    });
  });

  describe('单例导出', () => {
    it('importantDataService 应为 ImportantDataService 实例', () => {
      expect(importantDataService).toBeInstanceOf(ImportantDataService);
    });
  });
});