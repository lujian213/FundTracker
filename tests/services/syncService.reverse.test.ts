import { aggregateTradesByDate, applyReverseSyncUpdates } from '../../services/syncService';
import { TradeRecord } from '../../types';
import { EggfundInvestRecord, TradeDifference, DateTradeGroup } from '../../types/syncTypes';
import * as eggfundService from '../../services/eggfundService';

// Mock eggfundService
jest.mock('../../services/eggfundService');

describe('syncService.reverse - aggregateTradesByDate', () => {
  it('should aggregate single buy trade correctly', () => {
    const trades: TradeRecord[] = [
      {
        id: 'local-1',
        date: '2024-01-01',
        type: 'buy',
        shares: 100.123,
        price: 1.5,
        fee: 0.456
      }
    ];

    const result = aggregateTradesByDate(trades, '123456');

    expect(result['2024-01-01']).toBeDefined();
    expect(result['2024-01-01'].day).toBe('2024-01-01');
    expect(result['2024-01-01'].code).toBe('123456');
    expect(result['2024-01-01'].share).toBe(100.12); // 保留2位小数
    expect(result['2024-01-01'].fee).toBe(0.46); // 保留2位小数
    expect(result['2024-01-01'].unitPrice).toBe(-1);
    expect(result['2024-01-01'].totalSpend).toBe(0);
    expect(result['2024-01-01'].amount).toBe(0);
    expect(result['2024-01-01'].id).toBe('');
  });

  it('should aggregate multiple buy trades correctly', () => {
    const trades: TradeRecord[] = [
      {
        id: 'local-1',
        date: '2024-01-01',
        type: 'buy',
        shares: 100.123,
        price: 1.5,
        fee: 0.456
      },
      {
        id: 'local-2',
        date: '2024-01-01',
        type: 'buy',
        shares: 50.789,
        price: 1.6,
        fee: 0.123
      }
    ];

    const result = aggregateTradesByDate(trades, '123456');

    expect(result['2024-01-01'].share).toBe(150.91); // 100.12 + 50.79
    expect(result['2024-01-01'].fee).toBe(0.58); // 0.46 + 0.12
  });

  it('should calculate net shares for buy and sell trades', () => {
    const trades: TradeRecord[] = [
      {
        id: 'local-1',
        date: '2024-01-01',
        type: 'buy',
        shares: 100,
        price: 1.5,
        fee: 0.5
      },
      {
        id: 'local-2',
        date: '2024-01-01',
        type: 'sell',
        shares: 30,
        price: 1.6,
        fee: 0.3
      }
    ];

    const result = aggregateTradesByDate(trades, '123456');

    expect(result['2024-01-01'].share).toBe(70); // 100 - 30
    expect(result['2024-01-01'].fee).toBe(0.8); // 0.5 + 0.3
  });
});

describe('syncService.reverse - applyReverseSyncUpdates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle reverse add (forward deleted) scenario', async () => {
    const differences: TradeDifference[] = [
      {
        date: '2024-01-01',
        symbol: '123456',
        type: 'deleted',
        localData: {
          date: '2024-01-01',
          symbol: '123456',
          netDirection: 'buy',
          netShares: 100,
          totalFees: 0.5,
          trades: [
            { id: 'local-1', date: '2024-01-01', type: 'buy', shares: 100, price: 1.5, fee: 0.5 }
          ]
        }
      }
    ];

    const result = await applyReverseSyncUpdates(differences, 'testuser', 'testpass');

    expect(eggfundService.addInvestRecords).toHaveBeenCalledWith('testuser', 'testpass', [
      expect.objectContaining({
        day: '2024-01-01',
        code: '123456',
        share: 100,
        fee: 0.5,
        id: ''
      })
    ]);
    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('should handle reverse delete (forward new) scenario', async () => {
    const differences: TradeDifference[] = [
      {
        date: '2024-01-01',
        symbol: '123456',
        type: 'new',
        externalData: {
          date: '2024-01-01',
          symbol: '123456',
          netDirection: 'buy',
          netShares: 100,
          totalFees: 0.5,
          trades: [
            { id: 'Lu-123456-abc', date: '2024-01-01', type: 'buy', shares: 100, price: 1.5, fee: 0.5 }
          ]
        }
      }
    ];

    const result = await applyReverseSyncUpdates(differences, 'testuser', 'testpass');

    expect(eggfundService.deleteInvestRecords).toHaveBeenCalledWith('testuser', 'testpass', ['Lu-123456-abc']);
    expect(result.success).toBe(1);
  });

  it('should handle reverse modify single record scenario', async () => {
    const differences: TradeDifference[] = [
      {
        date: '2024-01-01',
        symbol: '123456',
        type: 'modified',
        localData: {
          date: '2024-01-01',
          symbol: '123456',
          netDirection: 'buy',
          netShares: 150,
          totalFees: 1.0,
          trades: [
            { id: 'local-1', date: '2024-01-01', type: 'buy', shares: 150, price: 1.5, fee: 1.0 }
          ]
        },
        externalData: {
          date: '2024-01-01',
          symbol: '123456',
          netDirection: 'buy',
          netShares: 100,
          totalFees: 0.5,
          trades: [
            { id: 'Lu-123456-abc', date: '2024-01-01', type: 'buy', shares: 100, price: 1.5, fee: 0.5 }
          ]
        }
      }
    ];

    const result = await applyReverseSyncUpdates(differences, 'testuser', 'testpass');

    expect(eggfundService.updateInvestRecord).toHaveBeenCalledWith('testuser', 'testpass',
      expect.objectContaining({
        day: '2024-01-01',
        code: '123456',
        share: 150,
        fee: 1.0,
        id: 'Lu-123456-abc'
      })
    );
    expect(result.success).toBe(1);
  });

  it('should handle reverse modify multiple records scenario', async () => {
    const differences: TradeDifference[] = [
      {
        date: '2024-01-01',
        symbol: '123456',
        type: 'modified',
        localData: {
          date: '2024-01-01',
          symbol: '123456',
          netDirection: 'buy',
          netShares: 150,
          totalFees: 1.0,
          trades: [
            { id: 'local-1', date: '2024-01-01', type: 'buy', shares: 150, price: 1.5, fee: 1.0 }
          ]
        },
        externalData: {
          date: '2024-01-01',
          symbol: '123456',
          netDirection: 'buy',
          netShares: 100,
          totalFees: 0.5,
          trades: [
            { id: 'Lu-123456-abc', date: '2024-01-01', type: 'buy', shares: 50, price: 1.5, fee: 0.25 },
            { id: 'Lu-123456-def', date: '2024-01-01', type: 'buy', shares: 50, price: 1.5, fee: 0.25 }
          ]
        }
      }
    ];

    const result = await applyReverseSyncUpdates(differences, 'testuser', 'testpass');

    // 应该先删除两条原记录，再添加一条新记录
    expect(eggfundService.deleteInvestRecords).toHaveBeenCalledWith('testuser', 'testpass', ['Lu-123456-abc', 'Lu-123456-def']);
    expect(eggfundService.addInvestRecords).toHaveBeenCalledWith('testuser', 'testpass', [
      expect.objectContaining({
        day: '2024-01-01',
        code: '123456',
        share: 150,
        fee: 1.0,
        id: ''
      })
    ]);
    expect(result.success).toBe(3); // 2 deleted + 1 added
  });

  it('should batch multiple operations', async () => {
    const differences: TradeDifference[] = [
      {
        date: '2024-01-01',
        symbol: '123456',
        type: 'deleted',
        localData: {
          date: '2024-01-01',
          symbol: '123456',
          netDirection: 'buy',
          netShares: 100,
          totalFees: 0.5,
          trades: [{ id: 'local-1', date: '2024-01-01', type: 'buy', shares: 100, price: 1.5, fee: 0.5 }]
        }
      },
      {
        date: '2024-01-02',
        symbol: '654321',
        type: 'new',
        externalData: {
          date: '2024-01-02',
          symbol: '654321',
          netDirection: 'buy',
          netShares: 50,
          totalFees: 0.3,
          trades: [{ id: 'Lu-654321-abc', date: '2024-01-02', type: 'buy', shares: 50, price: 1.5, fee: 0.3 }]
        }
      }
    ];

    const result = await applyReverseSyncUpdates(differences, 'testuser', 'testpass');

    // 删除应该合并为一次调用
    expect(eggfundService.deleteInvestRecords).toHaveBeenCalledTimes(1);
    expect(eggfundService.deleteInvestRecords).toHaveBeenCalledWith('testuser', 'testpass', ['Lu-654321-abc']);

    // 新增应该合并为一次调用
    expect(eggfundService.addInvestRecords).toHaveBeenCalledTimes(1);
    expect(eggfundService.addInvestRecords).toHaveBeenCalledWith('testuser', 'testpass', [
      expect.objectContaining({ day: '2024-01-01', code: '123456' })
    ]);

    expect(result.success).toBe(2); // 1 deleted + 1 added
  });

  it('should handle empty differences array', async () => {
    const result = await applyReverseSyncUpdates([], 'testuser', 'testpass');

    expect(eggfundService.deleteInvestRecords).not.toHaveBeenCalled();
    expect(eggfundService.addInvestRecords).not.toHaveBeenCalled();
    expect(eggfundService.updateInvestRecord).not.toHaveBeenCalled();
    expect(result.success).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
  });
});