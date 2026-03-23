import {
  formatCodeList,
  parseAIResponse,
  updateTickerAlerts,
  loadBackgroundJobPrompts,
  refreshTickerAlerts
} from '../../services/backgroundJobService';
import { Ticker, TickerAlert, MarketType } from '../../types';

// Mock fetch for loadBackgroundJobPrompts
global.fetch = jest.fn();

describe('backgroundJobService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatCodeList', () => {
    test('formats portfolio as symbol name pairs', () => {
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '华夏成长', market: MarketType.FUND },
        { id: '2', symbol: '510050', name: '上证50ETF', market: MarketType.FUND },
      ];

      const result = formatCodeList(portfolio);

      expect(result).toBe('000001 华夏成长\n510050 上证50ETF');
    });

    test('returns empty string for empty portfolio', () => {
      expect(formatCodeList([])).toBe('');
    });

    test('handles missing name gracefully', () => {
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '', market: MarketType.FUND },
      ];

      const result = formatCodeList(portfolio);

      expect(result).toBe('000001');
    });
  });

  describe('parseAIResponse', () => {
    test('parses valid holiday JSON response', () => {
      const response = JSON.stringify([
        { code: '000001', holiday_date_start: '2024/01/15', holiday_date_end: '2024/01/17', holiday_name: '春节', explanation: '春节休市（中国市场）' },
        { code: '510050', holiday_date_start: '2024/01/20', holiday_date_end: '2024/01/20', holiday_name: '马丁路德金日', explanation: '美股休市（美国市场）' },
      ]);

      const results = parseAIResponse(response, 'holiday');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        code: '000001',
        date: '2024/01/15',
        content: '春节休市（中国市场）'
      });
      expect(results[1]).toEqual({
        code: '510050',
        date: '2024/01/20',
        content: '美股休市（美国市场）'
      });
    });

    test('parses valid delivery JSON response', () => {
      const response = JSON.stringify([
        { code: '510050', delivery_date: '2024/01/17', explanation: '50ETF期权交割日' },
        { code: '000001', delivery_date: null, explanation: null },
      ]);

      const results = parseAIResponse(response, 'delivery');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        code: '510050',
        date: '2024/01/17',
        content: '50ETF期权交割日'
      });
      expect(results[1]).toEqual({
        code: '000001',
        date: null,
        content: null
      });
    });

    test('returns empty array for invalid JSON', () => {
      expect(parseAIResponse('not json', 'holiday')).toEqual([]);
    });

    test('returns empty array for non-array response', () => {
      expect(parseAIResponse('{"key": "value"}', 'holiday')).toEqual([]);
    });

    test('parses JSON wrapped in markdown code block', () => {
      const response = '```json\n[\n  { "code": "000001", "holiday_date_start": "2024/01/15", "explanation": "春节休市" }\n]\n```';

      const results = parseAIResponse(response, 'holiday');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        code: '000001',
        date: '2024/01/15',
        content: '春节休市'
      });
    });

    test('parses JSON wrapped in markdown code block without json label', () => {
      const response = '```\n[\n  { "code": "000001", "delivery_date": "2024/01/17", "explanation": "交割日" }\n]\n```';

      const results = parseAIResponse(response, 'delivery');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        code: '000001',
        date: '2024/01/17',
        content: '交割日'
      });
    });
  });

  describe('updateTickerAlerts', () => {
    const portfolio: Ticker[] = [
      { id: '1', symbol: '000001', name: 'Fund A', market: MarketType.FUND },
      { id: '2', symbol: '510050', name: 'Fund B', market: MarketType.FUND },
    ];

    test('adds new alert when none exists', () => {
      const result = updateTickerAlerts(portfolio, '000001', 'holiday', '2024/01/15', '春节休市');

      expect(result[0].alert_list).toHaveLength(1);
      expect(result[0].alert_list![0]).toEqual({
        type: 'holiday',
        date: '2024/01/15',
        content: '春节休市'
      });
    });

    test('updates existing alert of same type', () => {
      const portfolioWithAlert: Ticker[] = [
        {
          id: '1',
          symbol: '000001',
          name: 'Fund A',
          market: MarketType.FUND,
          alert_list: [{ type: 'holiday', date: '2024/01/10', content: '旧信息' }]
        },
      ];

      const result = updateTickerAlerts(portfolioWithAlert, '000001', 'holiday', '2024/01/15', '新信息');

      expect(result[0].alert_list).toHaveLength(1);
      expect(result[0].alert_list![0]).toEqual({
        type: 'holiday',
        date: '2024/01/15',
        content: '新信息'
      });
    });

    test('removes alert when date is null', () => {
      const portfolioWithAlert: Ticker[] = [
        {
          id: '1',
          symbol: '000001',
          name: 'Fund A',
          market: MarketType.FUND,
          alert_list: [{ type: 'delivery', date: '2024/01/10', content: '交割日' }]
        },
      ];

      const result = updateTickerAlerts(portfolioWithAlert, '000001', 'delivery', null, null);

      expect(result[0].alert_list).toHaveLength(0);
    });

    test('preserves other alert types when removing', () => {
      const portfolioWithAlerts: Ticker[] = [
        {
          id: '1',
          symbol: '000001',
          name: 'Fund A',
          market: MarketType.FUND,
          alert_list: [
            { type: 'holiday', date: '2024/01/15', content: '节假日' },
            { type: 'delivery', date: '2024/01/17', content: '交割日' }
          ]
        },
      ];

      const result = updateTickerAlerts(portfolioWithAlerts, '000001', 'delivery', null, null);

      expect(result[0].alert_list).toHaveLength(1);
      expect(result[0].alert_list![0].type).toBe('holiday');
    });

    test('returns unchanged portfolio for unknown symbol', () => {
      const result = updateTickerAlerts(portfolio, 'UNKNOWN', 'holiday', '2024/01/15', 'test');

      expect(result).toEqual(portfolio);
    });
  });

  describe('loadBackgroundJobPrompts', () => {
    test('loads prompts from config file', async () => {
      const mockPrompts = {
        prompts: [
          { id: 'holiday', name: '节假日信息', type: 'holiday', template: 'test template' }
        ]
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPrompts)
      });

      const result = await loadBackgroundJobPrompts();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('holiday');
    });

    test('returns empty array on fetch error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await loadBackgroundJobPrompts();

      expect(result).toEqual([]);
    });
  });

  describe('refreshTickerAlerts', () => {
    // These tests require mocking aiConfigService and aiService
    // Skip complex integration tests for now, focus on unit tests above
  });
});