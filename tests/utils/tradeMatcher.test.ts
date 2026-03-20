import { normalMatcher, fifoMatcher, lifoMatcher, MatchedRecord } from '../../utils/tradeMatcher';
import { TradeRecord } from '../../types';

describe('tradeMatcher', () => {
  describe('normalMatcher', () => {
    test('returns records unchanged', () => {
      const records: TradeRecord[] = [
        { id: '1', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
      ];

      const result = normalMatcher(records, 1.5);

      expect(result.records).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.records[0].remainingShares).toBe(100);
      expect(result.records[0].remainingFee).toBe(10);
    });

    test('sets remainingShares equal to original shares', () => {
      const records: TradeRecord[] = [
        { id: '1', date: '2024-01-01', type: 'buy', shares: 50, price: 1.0, fee: 5 },
      ];

      const result = normalMatcher(records, 1.5);

      expect(result.records[0].remainingShares).toBe(result.records[0].originalShares);
    });

    test('handles multiple records', () => {
      const records: TradeRecord[] = [
        { id: '1', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
        { id: '2', date: '2024-01-02', type: 'sell', shares: 50, price: 1.2, fee: 5 },
        { id: '3', date: '2024-01-03', type: 'buy', shares: 200, price: 1.1, fee: 20 },
      ];

      const result = normalMatcher(records, 1.5);

      expect(result.records).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      expect(result.records[0].remainingShares).toBe(100);
      expect(result.records[1].remainingShares).toBe(50);
      expect(result.records[2].remainingShares).toBe(200);
    });

    test('preserves original record properties', () => {
      const records: TradeRecord[] = [
        { id: 'test-id', date: '2024-06-15', type: 'buy', shares: 75, price: 2.5, fee: 15 },
      ];

      const result = normalMatcher(records, 3.0);

      expect(result.records[0].id).toBe('test-id');
      expect(result.records[0].date).toBe('2024-06-15');
      expect(result.records[0].type).toBe('buy');
      expect(result.records[0].price).toBe(2.5);
    });

    test('handles records with zero fee', () => {
      const records: TradeRecord[] = [
        { id: '1', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
      ];

      const result = normalMatcher(records, 1.5);

      expect(result.records[0].remainingFee).toBe(0);
      expect(result.records[0].originalFee).toBe(0);
    });

    test('handles empty records array', () => {
      const records: TradeRecord[] = [];

      const result = normalMatcher(records, 1.5);

      expect(result.records).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    test('sets originalShares and originalFee correctly', () => {
      const records: TradeRecord[] = [
        { id: '1', date: '2024-01-01', type: 'sell', shares: 150, price: 2.0, fee: 25 },
      ];

      const result = normalMatcher(records, 2.5);

      expect(result.records[0].originalShares).toBe(150);
      expect(result.records[0].originalFee).toBe(25);
    });
  });

  describe('fifoMatcher', () => {
    test('fully matched buy and sell records are removed', () => {
      const records: TradeRecord[] = [
        { id: '1', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
        { id: '2', date: '2024-01-02', type: 'sell', shares: 100, price: 1.5, fee: 0 },
      ];

      const result = fifoMatcher(records, 1.5);

      // 买入和卖出都被完全匹配，过滤掉
      expect(result.records).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    test('partially matched buy record has reduced shares and fee, sell removed', () => {
      const records: TradeRecord[] = [
        { id: '1', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
        { id: '2', date: '2024-01-02', type: 'sell', shares: 60, price: 1.5, fee: 0 },
      ];

      const result = fifoMatcher(records, 1.5);

      // 买入剩余40份，卖出完全匹配被过滤掉
      expect(result.records).toHaveLength(1);
      const buyRecord = result.records.find(r => r.type === 'buy');
      expect(buyRecord?.remainingShares).toBe(40);
      expect(buyRecord?.remainingFee).toBe(4); // 10 * (40/100)
    });

    test('multiple buys matched in FIFO order, sell removed', () => {
      const records: TradeRecord[] = [
        { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
        { id: 'B', date: '2024-01-02', type: 'buy', shares: 50, price: 1.2, fee: 0 },
        { id: 'C', date: '2024-01-03', type: 'sell', shares: 120, price: 1.5, fee: 0 },
      ];

      const result = fifoMatcher(records, 1.5);

      // A(100)被完全匹配，B(50)剩余30份，卖出完全匹配被过滤掉
      expect(result.records).toHaveLength(1);
      const buyB = result.records.find(r => r.id === 'B');
      expect(buyB?.remainingShares).toBe(30);
    });

    test('unmatched sell returns error', () => {
      const records: TradeRecord[] = [
        { id: '1', date: '2024-01-01', type: 'sell', shares: 100, price: 1.5, fee: 10 },
      ];

      const result = fifoMatcher(records, 1.5);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('未匹配');
      const sellRecord = result.records.find(r => r.type === 'sell');
      expect(sellRecord?.isError).toBe(true);
      expect(sellRecord?.remainingShares).toBe(100);
      expect(sellRecord?.remainingFee).toBe(10);
    });

    test('partially matched sell record has reduced shares and fee', () => {
      // 卖出100份，手续费10元，但只有60份能匹配买入
      const records: TradeRecord[] = [
        { id: '1', date: '2024-01-01', type: 'buy', shares: 60, price: 1.0, fee: 0 },
        { id: '2', date: '2024-01-02', type: 'sell', shares: 100, price: 1.5, fee: 10 },
      ];

      const result = fifoMatcher(records, 1.5);

      // 买入被完全匹配，过滤掉
      // 卖出剩余40份未匹配，手续费按比例: 10 * (40/100) = 4
      expect(result.records).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      const sellRecord = result.records.find(r => r.type === 'sell');
      expect(sellRecord?.isError).toBe(true);
      expect(sellRecord?.remainingShares).toBe(40);
      expect(sellRecord?.remainingFee).toBe(4);
    });
  });

  describe('lifoMatcher', () => {
    test('multiple buys matched in LIFO order, sell removed', () => {
      const records: TradeRecord[] = [
        { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
        { id: 'B', date: '2024-01-02', type: 'buy', shares: 50, price: 1.2, fee: 0 },
        { id: 'C', date: '2024-01-03', type: 'sell', shares: 120, price: 1.5, fee: 0 },
      ];

      const result = lifoMatcher(records, 1.5);

      // LIFO: B(50)被完全匹配（最近），A(100)剩余30份（120-50=70从A消耗），卖出被过滤掉
      expect(result.records).toHaveLength(1);
      const buyA = result.records.find(r => r.id === 'A');
      expect(buyA?.remainingShares).toBe(30);
    });

    test('LIFO with partial match on most recent, sell removed', () => {
      const records: TradeRecord[] = [
        { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
        { id: 'B', date: '2024-01-02', type: 'buy', shares: 50, price: 1.2, fee: 0 },
        { id: 'C', date: '2024-01-03', type: 'sell', shares: 30, price: 1.5, fee: 0 },
      ];

      const result = lifoMatcher(records, 1.5);

      // LIFO: B(50)被部分匹配30份，剩余20份；A不变；卖出被过滤掉
      expect(result.records).toHaveLength(2);
      const buyB = result.records.find(r => r.id === 'B');
      expect(buyB?.remainingShares).toBe(20);
    });

    test('LIFO partially matched sell record has reduced shares and fee', () => {
      // 卖出100份，手续费10元，但只有60份能匹配买入
      const records: TradeRecord[] = [
        { id: '1', date: '2024-01-01', type: 'buy', shares: 60, price: 1.0, fee: 0 },
        { id: '2', date: '2024-01-02', type: 'sell', shares: 100, price: 1.5, fee: 10 },
      ];

      const result = lifoMatcher(records, 1.5);

      // 买入被完全匹配，过滤掉
      // 卖出剩余40份未匹配，手续费按比例: 10 * (40/100) = 4
      expect(result.records).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      const sellRecord = result.records.find(r => r.type === 'sell');
      expect(sellRecord?.isError).toBe(true);
      expect(sellRecord?.remainingShares).toBe(40);
      expect(sellRecord?.remainingFee).toBe(4);
    });
  });
});