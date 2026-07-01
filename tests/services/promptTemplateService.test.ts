// tests/services/promptTemplateService.test.ts

import {
  fillFundTemplateVariables,
  fillIndexTemplateVariables,
  fillTemplateVariables,
  loadAllTemplates,
  getById,
  getByType,
  resetCache,
  TEMPLATE_IDS,
  TEMPLATE_TYPES,
} from '../../services/promptTemplateService';
import { fillTemplate } from '../../utils/templateFiller';
import { FundAIQueryContext, IndexAIQueryContext } from '../../types/aiServiceTypes';

// Mock fetch for template loading tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('promptTemplateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fillFundTemplateVariables', () => {
    it('should fill fund template variables correctly', () => {
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: '测试基金',
        fundSymbol: '000001',
        fullCapacity: 10000,
        initialCapacity: 5000,
      };
      const template = '基金名称：{name}，代码：{code}，满仓：{fullCapacity}';
      const result = fillFundTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('基金名称：测试基金，代码：000001，满仓：10000');
    });

    it('should fill history variable with trade history', () => {
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: '测试基金',
        fundSymbol: '000001',
        tradeHistory: [
          { date: '2024-01-01', amount: 1000, shares: 100, price: 10.0 }
        ],
      };
      const template = '交易历史：{history}';
      const result = fillFundTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('2024-01-01');
      expect(result.content).toContain('1000');
    });

    it('should fill valuation data variables', () => {
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: '测试基金',
        fundSymbol: '000001',
        valuationData: {
          currentPrice: 1.2345,
          previousPrice: 1.2000,
          changePercentage: 2.88,
          realtimeDate: '2024-01-15',
          netWorthDate: '2024-01-14',
          lastUpdated: '2024-01-15T10:00:00',
        },
      };
      const template = '当前净值：{currentPrice}，前值：{previousPrice}，涨跌幅：{rate}';
      const result = fillFundTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('1.2345');
      expect(result.content).toContain('1.2000');
      expect(result.content).toContain('+2.88%');
    });

    it('should fill empty string for undefined values', () => {
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: '测试基金',
        fundSymbol: '000001',
      };
      const template = '满仓：{fullCapacity}，初始份额：{initialCapacity}';
      const result = fillFundTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('满仓：，初始份额：');
    });

    it('should fill position and profit variables', () => {
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: '测试基金',
        fundSymbol: '000001',
        position: 1000.50,
        positionRate: 75.5,
        profit: 150.25,
        avgCostPrice: 1.1234,
        marketValue: 1234.56,
      };
      const template = '仓位：{position}份，仓位占比：{positionRate}，盈利：{profit}，成本价：{avgCostPrice}，市值：{marketValue}';
      const result = fillFundTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('1000.50');
      expect(result.content).toContain('75.50%');
      expect(result.content).toContain('+150.25');
      expect(result.content).toContain('1.1234');
      expect(result.content).toContain('1234.56');
    });
  });

  describe('fillIndexTemplateVariables', () => {
    it('should fill index template variables correctly', () => {
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '上证指数',
        indexSymbol: '000001',
        datetime: '2024-01-01T10:00:00+08:00',
        closingPrices: [{ date: '2024-01-01', price: 3000 }],
      };
      const template = '指数：{name}，代码：{code}，时间：{datetime}';
      const result = fillIndexTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('上证指数');
      expect(result.content).toContain('000001');
      expect(result.content).toContain('2024-01-01T10:00:00+08:00');
    });

    it('should fill closing_prices variable', () => {
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '上证指数',
        indexSymbol: '000001',
        datetime: '2024-01-01T10:00:00+08:00',
        closingPrices: [
          { date: '2024-01-01', price: 3000 },
          { date: '2024-01-02', price: 3050 },
        ],
      };
      const template = '收盘价数据：{closing_prices}';
      const result = fillIndexTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('2024-01-01');
      expect(result.content).toContain('3000');
    });

    it('should fill MA data variables', () => {
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '上证指数',
        indexSymbol: '000001',
        datetime: '2024-01-01T10:00:00+08:00',
        ma5: [3000, 3010, 3020, 3030, 3040],
        ma10: [2950, 2960, 2970, 2980, 2990],
        ma20: [2900, 2910, 2920, 2930, 2940],
      };
      const template = 'MA5：{ma5}，MA10：{ma10}，MA20：{ma20}';
      const result = fillIndexTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('3000');
      expect(result.content).toContain('2950');
      expect(result.content).toContain('2900');
    });

    it('should fill volume and realtime data variables', () => {
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '上证指数',
        indexSymbol: '000001',
        datetime: '2024-01-01T10:00:00+08:00',
        currentVolume: 5000000,
        volumes: [1000000, 1200000],
        realtimePrices: [
          { time: '09:30', price: 3000 },
          { time: '09:31', price: 3005 },
        ],
      };
      const template = '成交量：{volumes}，实时价格：{realtime_prices}，当前成交量：{current_volume}';
      const result = fillIndexTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('100.00万手');  // 格式化后的成交量（带"手"单位）
      expect(result.content).toContain('09:30');
      expect(result.content).toContain('500.00万手');  // 格式化后的当前成交量（带"手"单位）
    });

    it('should show [] for undefined index values', () => {
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '上证指数',
        indexSymbol: '000001',
        datetime: '2024-01-01T10:00:00+08:00',
      };
      const template = '收盘价：{closing_prices}，MA5：{ma5}';
      const result = fillIndexTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('[]');
    });

    it('should use currentValue for current_price directly', () => {
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '上证指数',
        indexSymbol: '000001',
        datetime: '2024-01-01T10:00:00+08:00',
        currentValue: 3150.88,
      };
      const template = '当前点位：{current_price}';
      const result = fillIndexTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('3150.88');
    });

    it('should use currentVolume for current_volume directly', () => {
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '上证指数',
        indexSymbol: '000001',
        datetime: '2024-01-01T10:00:00+08:00',
        currentVolume: 5000000,
      };
      const template = '当前成交量：{current_volume}';
      const result = fillIndexTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('500.00万手');
    });

    it('should not use realtimePrices or closingPrices for current_price', () => {
      // realtimePrices 和 closingPrices 不参与当前点位计算
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '上证指数',
        indexSymbol: '000001',
        datetime: '2024-01-01T10:00:00+08:00',
        realtimePrices: [{ time: '09:30', price: 3100 }],
        closingPrices: [{ date: '2024-01-01', price: 3000 }],
      };
      const template = '当前点位：{current_price}';
      const result = fillIndexTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('当前点位：');  // 空值，因为没有 currentValue
    });
  });

  describe('fillTemplateVariables', () => {
    it('should route to fund template filler when marketType is fund', () => {
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: '测试基金',
        fundSymbol: '000001',
        fullCapacity: 10000,
      };
      const template = '名称：{name}，满仓：{fullCapacity}';
      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('名称：测试基金，满仓：10000');
    });

    it('should route to index template filler when marketType is index', () => {
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '上证指数',
        indexSymbol: '000001',
        datetime: '2024-01-01T10:00:00+08:00',
        closingPrices: [{ date: '2024-01-01', price: 3000 }],
      };
      const template = '指数：{name}，代码：{code}';
      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('指数：上证指数，代码：000001');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 新增测试：模板加载和查询
// ═══════════════════════════════════════════════════════════════════════════════

describe('promptTemplateService - template loading', () => {
  beforeEach(() => {
    resetCache();
    jest.clearAllMocks();
  });

  describe('loadAllTemplates', () => {
    it('should load templates from config files', async () => {
      // Mock responses for all config files
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'fund-analysis',
            name: '基金分析',
            description: 'AI助手首次打开时的欢迎消息和分析模板',
            templates: [
              { enabled: true, template: '基金分析模板内容 {name} {code}' }
            ]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'index-analysis',
            name: '指数分析',
            description: '指数分析模板',
            templates: [
              { enabled: true, template: '指数分析模板内容 {name} {code}' }
            ]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            templates: [
              { id: 'fund-info-summary', name: '信息汇总', type: 'fund-common-question', template: '请列出最新的和本基金相关的国内外信息' }
            ]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            templates: [
              { id: 'index-info-summary', name: '信息汇总', type: 'index-common-question', template: '请列出最新的和本指数相关的信息' }
            ]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            templates: [
              { id: 'investment-draft-analysis', name: '投资计划分析', template: '投资计划分析模板' }
            ]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            templates: [
              { id: 'portfolio-analysis', name: '投资组合综合分析', enabled: true, template: '投资组合分析模板' },
              { id: 'portfolio-risk', name: '投资组合风险评估', enabled: false, template: '投资组合风险评估模板' }
            ]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            templates: [
              { id: 'bg-holiday', name: '假期查询', enabled: true, template: '假期查询模板' }
            ]
          })
        }));

      await loadAllTemplates();

      // 验证基金分析模板加载成功
      const fundTemplate = getById(TEMPLATE_IDS.FUND_ANALYSIS);
      expect(fundTemplate).toBeDefined();
      expect(fundTemplate?.name).toBe('基金分析');

      // 验证指数分析模板加载成功
      const indexTemplate = getById(TEMPLATE_IDS.INDEX_ANALYSIS);
      expect(indexTemplate).toBeDefined();
    });

    it('should only cache enabled templates', async () => {
      // Mock responses - portfolio-risk is disabled
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'fund-analysis',
            name: '基金分析',
            templates: [{ enabled: true, template: 'test' }]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'index-analysis',
            name: '指数分析',
            templates: [{ enabled: true, template: 'test' }]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            templates: [
              { id: 'portfolio-analysis', name: '投资组合综合分析', enabled: true, template: 'test' },
              { id: 'portfolio-risk', name: '投资组合风险评估', enabled: false, template: 'test' }
            ]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }));

      await loadAllTemplates();

      // portfolio-risk 在配置中 enabled=false
      const riskTemplate = getById(TEMPLATE_IDS.PORTFOLIO_RISK);
      expect(riskTemplate).toBeNull();
    });

    it('should not load twice', async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'fund-analysis',
            name: '基金分析',
            templates: [{ enabled: true, template: 'test' }]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'index-analysis',
            name: '指数分析',
            templates: [{ enabled: true, template: 'test' }]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }));

      await loadAllTemplates();
      await loadAllTemplates(); // 第二次调用应该被忽略

      // 验证只加载了一次（fetch 调用次数应该等于配置文件数量 8）
      expect(mockFetch).toHaveBeenCalledTimes(8);
    });
  });

  describe('getById', () => {
    it('should return template by id', async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'fund-analysis',
            name: '基金分析',
            templates: [{ enabled: true, template: 'test' }]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'index-analysis',
            name: '指数分析',
            templates: [{ enabled: true, template: 'test' }]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            templates: [
              { id: 'investment-draft-analysis', name: '投资计划分析', template: '投资计划分析模板' }
            ]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }));

      await loadAllTemplates();

      const template = getById(TEMPLATE_IDS.INVESTMENT_DRAFT_ANALYSIS);
      expect(template).toBeDefined();
      expect(template?.id).toBe('investment-draft-analysis');
    });

    it('should return null for unknown id', () => {
      const template = getById('unknown-id');
      expect(template).toBeNull();
    });
  });

  describe('getByType', () => {
    it('should return all templates with matching type', async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'fund-analysis',
            name: '基金分析',
            templates: [{ enabled: true, template: 'test' }]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'index-analysis',
            name: '指数分析',
            templates: [{ enabled: true, template: 'test' }]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            templates: [
              { id: 'fund-info-summary', name: '信息汇总', type: 'fund-common-question', template: 'test1' },
              { id: 'fund-profit-loss', name: '盈亏分析', type: 'fund-common-question', template: 'test2' }
            ]
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }))
        .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ templates: [] }) }));

      await loadAllTemplates();

      const questions = getByType(TEMPLATE_TYPES.FUND_COMMON_QUESTION);
      expect(questions.length).toBeGreaterThan(0);
      expect(questions.every(q => q.type === TEMPLATE_TYPES.FUND_COMMON_QUESTION)).toBe(true);
    });

    it('should return empty array for unknown type', () => {
      const templates = getByType('unknown-type');
      expect(templates).toEqual([]);
    });
  });

  describe('fillTemplate', () => {
    it('should fill template variables', () => {
      const template = '基金：{name}，代码：{code}';
      const result = fillTemplate(template, { name: '测试基金', code: '000001' });
      expect(result.success).toBe(true);
      expect(result.content).toBe('基金：测试基金，代码：000001');
    });

    it('should report error for undefined values', () => {
      const template = '值：{value}';
      const result = fillTemplate(template, {});
      expect(result.success).toBe(false);
      expect(result.missingPlaceholders).toContain('value');
    });

    it('should report error for null values', () => {
      const template = '值：{value}';
      const result = fillTemplate(template, { value: null as any });
      expect(result.success).toBe(false);
      expect(result.missingPlaceholders).toContain('value');
    });

    it('should stringify object values', () => {
      const template = '数据：{data}';
      const result = fillTemplate(template, { data: { key: 'value' } });
      expect(result.success).toBe(true);
      expect(result.content).toContain('"key"');
      expect(result.content).toContain('"value"');
    });

    it('should handle number values', () => {
      const template = '金额：{amount}';
      const result = fillTemplate(template, { amount: 1234.56 });
      expect(result.success).toBe(true);
      expect(result.content).toBe('金额：1234.56');
    });
  });
});