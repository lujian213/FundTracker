import { computePositionTrend, downsampleLTTB, PositionTrendInput } from '../../utils/positionTrend';

describe('computePositionTrend', () => {
  test('happy path - basic aggregation', () => {
    const input: PositionTrendInput = {
      symbols: ['A'],
      initialPositions: { A: 100 },
      trades: {
        A: [
          { id: 't1', date: '2026-01-05', type: 'buy', shares: 50 },
          { id: 't2', date: '2026-01-10', type: 'sell', shares: 20 }
        ]
      },
      valuationHistory: {
        A: [
          { date: '2026-01-01', price: 1.0 },
          { date: '2026-01-08', price: 1.5 }
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-01-12'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;
    expect(find('2026-01-01').value).toBeCloseTo(100 * 1.0);
    expect(find('2026-01-06').value).toBeCloseTo(150 * 1.0);
    expect(find('2026-01-09').value).toBeCloseTo(150 * 1.5);
    expect(find('2026-01-11').value).toBeCloseTo(130 * 1.5);
  });

  test('edge - missing early valuation carry-forward absent', () => {
    const input: PositionTrendInput = {
      symbols: ['B'],
      initialPositions: { B: 50 },
      trades: {
        B: [
          { id: 't1', date: '2026-01-10', type: 'buy', shares: 50 }
        ]
      },
      valuationHistory: {
        B: [
          { date: '2026-02-01', price: 2.0 }
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-02-05'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;
    // dates before 2026-02-01 should have value 0 because no known price yet
    expect(find('2026-01-15').value).toBeCloseTo(0);
    // from 2026-02-01 onward should use price 2.0 and cumulative shares (50 initial + 50 buy)
    expect(find('2026-02-02').value).toBeCloseTo(100 * 2.0);
  });
});

describe('downsampleLTTB', () => {
  test('downsamples preserving endpoints', () => {
    const data = [] as any[];
    for (let i = 0; i < 1000; i++) {
      const date = `2026-01-${String(i + 1).padStart(2, '0')}`;
      data.push({ date, value: Math.sin(i / 10) * 100 + i });
    }
    const sampled = downsampleLTTB(data, 100);
    expect(sampled[0].date).toBe(data[0].date);
    expect(sampled[sampled.length - 1].date).toBe(data[data.length - 1].date);
    expect(sampled.length).toBe(100);
  });
});

describe('computePositionTrend - netInvestment', () => {
  test('单基金单个买入交易的净投入', () => {
    const input: PositionTrendInput = {
      symbols: ['A'],
      initialPositions: { A: 0 },
      trades: {
        A: [
          { id: 't1', date: '2026-01-05', type: 'buy', shares: 100, price: 1.0, fee: 5.0 }
        ]
      },
      valuationHistory: {
        A: [
          { date: '2026-01-01', price: 1.0 }
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-01-10'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;

    // 买入前净投入应为0
    expect(find('2026-01-04').netInvestment).toBeCloseTo(0);
    // 买入后净投入应为 100*1.0 + 5 = 105
    expect(find('2026-01-05').netInvestment).toBeCloseTo(105);
    expect(find('2026-01-10').netInvestment).toBeCloseTo(105);
  });

  test('单基金包含买入和卖出的净投入', () => {
    const input: PositionTrendInput = {
      symbols: ['A'],
      initialPositions: { A: 0 },
      trades: {
        A: [
          { id: 't1', date: '2026-01-05', type: 'buy', shares: 100, price: 1.0, fee: 5.0 },
          { id: 't2', date: '2026-01-10', type: 'sell', shares: 50, price: 1.5, fee: 3.0 }
        ]
      },
      valuationHistory: {
        A: [
          { date: '2026-01-01', price: 1.0 }
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-01-15'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;

    // 买入后净投入应为 105
    expect(find('2026-01-06').netInvestment).toBeCloseTo(105);
    // 卖出后净投入应为 105 - (50*1.5 - 3) = 105 - 72 = 33
    expect(find('2026-01-10').netInvestment).toBeCloseTo(33);
    expect(find('2026-01-15').netInvestment).toBeCloseTo(33);
  });

  test('包含建仓记录的净投入', () => {
    const input: PositionTrendInput = {
      symbols: ['A'],
      initialPositions: { A: 100 }, // 建仓数量
      trades: {
        A: [
          { id: 't1', date: '2026-01-01', type: 'initial', shares: 100, price: 1.0, fee: 0 }
        ]
      },
      valuationHistory: {
        A: [
          { date: '2026-01-01', price: 1.0 }
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-01-10'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;

    // 建仓视为买入，净投入应为 100*1.0 + 0 = 100
    expect(find('2026-01-01').netInvestment).toBeCloseTo(100);
    expect(find('2026-01-10').netInvestment).toBeCloseTo(100);
  });

  test('多基金组合的净投入总额', () => {
    const input: PositionTrendInput = {
      symbols: ['A', 'B'],
      initialPositions: { A: 0, B: 0 },
      trades: {
        A: [
          { id: 't1', date: '2026-01-05', type: 'buy', shares: 100, price: 1.0, fee: 5.0 }
        ],
        B: [
          { id: 't2', date: '2026-01-08', type: 'buy', shares: 200, price: 2.0, fee: 10.0 }
        ]
      },
      valuationHistory: {
        A: [
          { date: '2026-01-01', price: 1.0 }
        ],
        B: [
          { date: '2026-01-01', price: 2.0 }
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-01-15'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;

    // A买入后净投入应为 105
    expect(find('2026-01-06').netInvestment).toBeCloseTo(105);
    // B买入后净投入总额应为 105 + 410 = 515
    expect(find('2026-01-08').netInvestment).toBeCloseTo(515);
    expect(find('2026-01-15').netInvestment).toBeCloseTo(515);
  });

  test('无交易时的净投入', () => {
    const input: PositionTrendInput = {
      symbols: ['A'],
      initialPositions: { A: 0 },
      trades: { A: [] },
      valuationHistory: {
        A: [
          { date: '2026-01-01', price: 1.0 }
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-01-10'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;

    // 无交易，净投入应为0
    expect(find('2026-01-01').netInvestment).toBeCloseTo(0);
    expect(find('2026-01-10').netInvestment).toBeCloseTo(0);
  });

  test('第一个点的持仓和净投入差异体现建仓盈亏', () => {
    const input: PositionTrendInput = {
      symbols: ['A'],
      initialPositions: { A: 100 },
      trades: {
        A: [
          { id: 't1', date: '2026-01-01', type: 'initial', shares: 100, price: 1.0, fee: 0 }
        ]
      },
      valuationHistory: {
        A: [
          { date: '2026-01-01', price: 1.2 } // 当前净值高于建仓价格
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-01-10'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;

    // 第一个点的持仓总金额 = 份额 × 当前净值 = 100 × 1.2 = 120
    expect(find('2026-01-01').value).toBeCloseTo(120);
    // 第一个点的净投入总额 = 份额 × 建仓价格 = 100 × 1.0 = 100
    expect(find('2026-01-01').netInvestment).toBeCloseTo(100);
    // 差异 = 持仓 - 净投入 = 20（建仓以来的盈利）
    expect(find('2026-01-01').value - find('2026-01-01').netInvestment).toBeCloseTo(20);
  });

  test('后续买入按买入价格计算净投入而非建仓价格', () => {
    const input: PositionTrendInput = {
      symbols: ['A'],
      initialPositions: { A: 100 },
      trades: {
        A: [
          { id: 't1', date: '2026-01-01', type: 'initial', shares: 100, price: 1.0, fee: 0 },
          { id: 't2', date: '2026-01-05', type: 'buy', shares: 50, price: 1.5, fee: 5.0 } // 买入价格高于建仓价格
        ]
      },
      valuationHistory: {
        A: [
          { date: '2026-01-01', price: 1.0 }
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-01-10'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;

    // 建仓时净投入 = 100 × 1.0 = 100
    expect(find('2026-01-01').netInvestment).toBeCloseTo(100);
    // 买入前净投入不变
    expect(find('2026-01-04').netInvestment).toBeCloseTo(100);
    // 买入后净投入 = 100 + (50 × 1.5 + 5) = 100 + 80 = 180（按买入价格计算）
    expect(find('2026-01-05').netInvestment).toBeCloseTo(180);
    expect(find('2026-01-10').netInvestment).toBeCloseTo(180);
  });

  test('建仓价格低于当前净值体现盈利', () => {
    const input: PositionTrendInput = {
      symbols: ['A'],
      initialPositions: { A: 100 },
      trades: {
        A: [
          { id: 't1', date: '2026-01-01', type: 'initial', shares: 100, price: 0.8, fee: 0 }
        ]
      },
      valuationHistory: {
        A: [
          { date: '2026-01-01', price: 1.2 } // 当前净值高于建仓价格
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-01-10'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;

    // 持仓总金额 = 100 × 1.2 = 120
    expect(find('2026-01-01').value).toBeCloseTo(120);
    // 净投入总额 = 100 × 0.8 = 80
    expect(find('2026-01-01').netInvestment).toBeCloseTo(80);
    // 盈利 = 120 - 80 = 40
    expect(find('2026-01-01').value - find('2026-01-01').netInvestment).toBeCloseTo(40);
  });

  test('建仓价格高于当前净值体现亏损', () => {
    const input: PositionTrendInput = {
      symbols: ['A'],
      initialPositions: { A: 100 },
      trades: {
        A: [
          { id: 't1', date: '2026-01-01', type: 'initial', shares: 100, price: 1.5, fee: 0 }
        ]
      },
      valuationHistory: {
        A: [
          { date: '2026-01-01', price: 1.2 } // 当前净值低于建仓价格
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-01-10'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;

    // 持仓总金额 = 100 × 1.2 = 120
    expect(find('2026-01-01').value).toBeCloseTo(120);
    // 净投入总额 = 100 × 1.5 = 150
    expect(find('2026-01-01').netInvestment).toBeCloseTo(150);
    // 亏损 = 120 - 150 = -30
    expect(find('2026-01-01').value - find('2026-01-01').netInvestment).toBeCloseTo(-30);
  });

  test('多基金组合的第一个点持仓和净投入差异', () => {
    const input: PositionTrendInput = {
      symbols: ['A', 'B'],
      initialPositions: { A: 100, B: 200 },
      trades: {
        A: [
          { id: 't1', date: '2026-01-01', type: 'initial', shares: 100, price: 1.0, fee: 0 }
        ],
        B: [
          { id: 't2', date: '2026-01-01', type: 'initial', shares: 200, price: 2.0, fee: 0 }
        ]
      },
      valuationHistory: {
        A: [
          { date: '2026-01-01', price: 1.2 }
        ],
        B: [
          { date: '2026-01-01', price: 1.8 }
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-01-10'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;

    // A持仓 = 100 × 1.2 = 120，净投入 = 100 × 1.0 = 100，盈利 = 20
    // B持仓 = 200 × 1.8 = 360，净投入 = 200 × 2.0 = 400，亏损 = -40
    // 总持仓 = 480，总净投入 = 500，总亏损 = -20
    expect(find('2026-01-01').value).toBeCloseTo(480);
    expect(find('2026-01-01').netInvestment).toBeCloseTo(500);
    expect(find('2026-01-01').value - find('2026-01-01').netInvestment).toBeCloseTo(-20);
  });

  test('卖出后净投入和持仓都减少', () => {
    const input: PositionTrendInput = {
      symbols: ['A'],
      initialPositions: { A: 100 },
      trades: {
        A: [
          { id: 't1', date: '2026-01-01', type: 'initial', shares: 100, price: 1.0, fee: 0 },
          { id: 't2', date: '2026-01-05', type: 'sell', shares: 50, price: 1.5, fee: 3.0 }
        ]
      },
      valuationHistory: {
        A: [
          { date: '2026-01-01', price: 1.5 }
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-01-10'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;

    // 建仓时：持仓 = 100 × 1.5 = 150，净投入 = 100 × 1.0 = 100
    expect(find('2026-01-01').value).toBeCloseTo(150);
    expect(find('2026-01-01').netInvestment).toBeCloseTo(100);

    // 卖出后：份额 = 50，持仓 = 50 × 1.5 = 75
    expect(find('2026-01-05').value).toBeCloseTo(75);
    // 卖出后净投入 = 100 - (50 × 1.5 - 3) = 100 - 72 = 28
    expect(find('2026-01-05').netInvestment).toBeCloseTo(28);
    // 盈利 = 75 - 28 = 47
    expect(find('2026-01-05').value - find('2026-01-05').netInvestment).toBeCloseTo(47);
  });
});

