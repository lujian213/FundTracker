import { computeProfitTimeline } from '../../utils/profitCalculator';
import { HistoricalPoint } from '../../types';
import { TradeRecord } from '../../types';

describe('profitCalculator', () => {
  test('computes profit timeline basic scenario', () => {
    // 新逻辑：当天的交易不影响当天的份额和累计盈利
    // initialPosition=100, initialPrice=9, initCost=900
    // Day1 (2026-02-20, NAV=10): 无交易
    //   shares = 100 (截止到昨天的累计份额=0)
    //   cumulative = 100*10 - 900 = 100
    //   dailyProfit = 100 - 0 = 100
    // Day2 (2026-02-21, NAV=12, 买入50@11): 当天的买入不影响当天
    //   shares = 100 (截止到昨天的累计份额=0，今天的买入明天才生效)
    //   cumulative = 100*12 - 900 = 300
    //   dailyProfit = 300 - 100 = 200
    // Day3 (2026-02-22, NAV=11): 昨天的买入今天生效
    //   shares = 100 + 50 = 150
    //   cumulativeBuyAmount = 50*11 = 550
    //   cumulative = 150*11 - 900 - 550 = 200
    //   dailyProfit = 200 - 300 = -100
    const history: HistoricalPoint[] = [
      { date: new Date('2026-02-20').getTime(), value: 10, equityReturn: 0 },
      { date: new Date('2026-02-21').getTime(), value: 12, equityReturn: 0 },
      { date: new Date('2026-02-22').getTime(), value: 11, equityReturn: 0 }
    ];
    const trades: TradeRecord[] = [
      { id: 't1', date: '2026-02-21', type: 'buy', shares: 50, price: 11, fee: 0 }
    ];
    const timeline = computeProfitTimeline({ history, trades, initialPosition: 100, initialPrice: 9 });
    expect(timeline[0].date).toBe('2026-02-20');
    expect(timeline[0].shares).toBe(100);
    expect(timeline[0].cumulativeProfit).toBeCloseTo(100);
    expect(timeline[0].dailyProfit).toBeCloseTo(100);

    expect(timeline[1].date).toBe('2026-02-21');
    expect(timeline[1].shares).toBe(100); // 当天的买入不影响当天份额
    expect(timeline[1].cumulativeProfit).toBeCloseTo(300); // 不包含今天的买入成本
    expect(timeline[1].dailyProfit).toBeCloseTo(200);

    expect(timeline[2].shares).toBe(150); // 昨天的买入今天生效
    expect(timeline[2].cumulativeProfit).toBeCloseTo(200);
    expect(timeline[2].dailyProfit).toBeCloseTo(-100);
  });

  test('fee is included in trade amount on the next day', () => {
    // 新逻辑：手续费在交易金额中，但交易当天不影响当天
    // initialPosition=100, initialPrice=10, initCost=1000
    // Day1 (2026-02-20, NAV=10): 无交易
    //   shares = 100, cumulative = 100*10 - 1000 = 0, dailyProfit = 0
    // Day2 (2026-02-21, NAV=12, 卖出50@12 fee=6): 当天的卖出不影响当天
    //   shares = 100 (今天的卖出明天才生效)
    //   cumulative = 100*12 - 1000 = 200
    //   dailyProfit = 200 - 0 = 200
    // Day3 (2026-02-22, NAV=13): 昨天的卖出今天生效
    //   shares = 100 - 50 = 50
    //   cumulativeSellAmount = 50*12 - 6 = 594
    //   cumulative = 50*13 - 1000 + 594 = 244
    //   dailyProfit = 244 - 200 = 44
    const history: HistoricalPoint[] = [
      { date: new Date('2026-02-20').getTime(), value: 10, equityReturn: 0 },
      { date: new Date('2026-02-21').getTime(), value: 12, equityReturn: 0 },
      { date: new Date('2026-02-22').getTime(), value: 13, equityReturn: 0 },
    ];
    const trades: TradeRecord[] = [
      { id: 's1', date: '2026-02-21', type: 'sell', shares: 50, price: 12, fee: 6 }
    ];
    const timeline = computeProfitTimeline({ history, trades, initialPosition: 100, initialPrice: 10 });

    // day1 (2/20)
    expect(timeline[0].dailyProfit).toBeCloseTo(0);
    expect(timeline[0].cumulativeProfit).toBeCloseTo(0);
    expect(timeline[0].shares).toBe(100);

    // day2 (2/21): 当天的卖出不影响当天
    expect(timeline[1].shares).toBe(100); // 不包含今天的卖出
    expect(timeline[1].cumulativeProfit).toBeCloseTo(200);
    expect(timeline[1].dailyProfit).toBeCloseTo(200);

    // day3 (2/22): 昨天的卖出今天生效
    expect(timeline[2].shares).toBe(50);
    expect(timeline[2].cumulativeProfit).toBeCloseTo(244);
    expect(timeline[2].dailyProfit).toBeCloseTo(44);
  });

  test('honors fromDate and toDate and accumulates earlier trades', () => {
    // 新逻辑：start之前的日期也遵循"当天的交易不影响当天"
    // initialPosition=20, initialPrice=9, initCost=180
    // 2026-02-18: NAV=9, 无交易
    // 2026-02-19: NAV=9.5, 买入10@9.5
    // 2026-02-20: NAV=10
    // 2026-02-21: NAV=11, 卖出5@11
    //
    // 处理2026-02-18 (在start之前):
    //   buySharesBeforeToday=0, cumulative = 20*9 - 180 = 0
    //   然后累加交易(无)
    //   更新 buySharesBeforeToday=0
    // 处理2026-02-19 (在start之前):
    //   buySharesBeforeToday=0, cumulative = 20*9.5 - 180 = 10
    //   cumulativePrevious = 10
    //   然后累加交易: runningBuyShares=10, cumulativeBuyAmount=95
    //   更新 buySharesBeforeToday=10
    // 处理2026-02-20 (start):
    //   日期变化，累加2026-02-19的交易(已累加)
    //   buySharesBeforeToday=10
    //   shares = 20 + 10 = 30
    //   cumulative = 30*10 - 180 - 95 = 25
    //   dailyProfit = 25 - 10 = 15
    const history: HistoricalPoint[] = [
      { date: new Date('2026-02-18').getTime(), value: 9, equityReturn: 0 },
      { date: new Date('2026-02-19').getTime(), value: 9.5, equityReturn: 0 },
      { date: new Date('2026-02-20').getTime(), value: 10, equityReturn: 0 },
      { date: new Date('2026-02-21').getTime(), value: 11, equityReturn: 0 }
    ];
    const trades: TradeRecord[] = [
      { id: 't0', date: '2026-02-19', type: 'buy', shares: 10, price: 9.5, fee: 0 },
      { id: 't1', date: '2026-02-21', type: 'sell', shares: 5, price: 11, fee: 0 }
    ];
    const timeline = computeProfitTimeline({ history, trades, initialPosition: 20, initialPrice: 9, fromDate: '2026-02-20', toDate: '2026-02-21' });
    expect(timeline.length).toBe(2);
    expect(timeline[0].shares).toBe(30); // 20初始 + 10买入(2/19的交易)
    expect(timeline[0].dailyProfit).toBeCloseTo(15); // 25 - 10
  });

  // ── Regression: duplicate history points must not cause double trade application ──

  test('does not double-count trades when history has two points on the same date', () => {
    // 新逻辑：当天的交易不影响当天
    // 2026-03-02: NAV=1.5956, 无交易
    // 2026-03-03 (两个点): NAV=1.66, 卖出7000@1.66 fee=11.62
    //
    // Day 2026-03-02:
    //   shares = initialPosition = 13831.32
    //   cumulative = 13831.32 * 1.5956 - 13831.32 * 1.3737 = ...
    // Day 2026-03-03 (两个历史点):
    //   由于是同一天，两点的份额应该相同
    //   当天的卖出不影响当天，所以 shares = 13831.32 (不变)
    //   但卖出金额也不计入当天的累计盈利

    const d0302 = Date.UTC(2026, 2, 2, 12, 0, 0);   // 2026-03-02 12:00 UTC
    const d0303a = Date.UTC(2026, 2, 3, 7, 0, 0);   // 2026-03-03 07:00 UTC  (original history point)
    const d0303b = Date.UTC(2026, 2, 3, 12, 0, 0);  // 2026-03-03 12:00 UTC  (synthetic duplicate)

    const history: HistoricalPoint[] = [
      { date: d0302,  value: 1.5956, equityReturn: 0 },
      { date: d0303a, value: 1.66,   equityReturn: 0 },
      { date: d0303b, value: 1.66,   equityReturn: 0 },
    ];

    // Verify our timestamps actually map to the expected local dates via tsToISODate logic
    const toISO = (ts: number) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    expect(toISO(d0302)).toBe('2026-03-02');
    expect(toISO(d0303a)).toBe('2026-03-03');
    expect(toISO(d0303b)).toBe('2026-03-03');

    const trades: TradeRecord[] = [
      { id: 's1', date: '2026-03-03', type: 'sell', shares: 7000, price: 1.66, fee: 11.62 },
    ];

    const initialPosition = 13831.32;
    const initialPrice    = 1.3737;
    const initCost = initialPosition * initialPrice; // 19024.17...

    const timeline = computeProfitTimeline({
      history,
      trades,
      initialPosition,
      initialPrice,
      fromDate: null,
      toDate:   null,
    });

    // computeProfitTimeline outputs one row per input history point, so two same-date points
    // → two output rows. What must NOT happen is trades being applied twice.
    const entries0303 = timeline.filter(p => p.date === '2026-03-03');
    expect(entries0303.length).toBe(2); // one row per input history point

    // 新逻辑：当天的卖出不影响当天，所以2026-03-03的份额仍是initialPosition
    for (const entry of entries0303) {
      expect(entry.shares).toBeCloseTo(initialPosition, 4);
    }

    // 新逻辑：当天的卖出金额不计入当天的累计盈利
    // cumulative = initialPosition * 1.66 - initCost (不包含今天的卖出金额)
    const expectedCum = initialPosition * 1.66 - initCost;
    for (const entry of entries0303) {
      expect(entry.cumulativeProfit).toBeCloseTo(expectedCum, 2);
    }

    // The 2026-03-02 entry should have full initialPosition shares (no trades yet)
    const entry0302 = timeline.find(p => p.date === '2026-03-02');
    expect(entry0302).toBeDefined();
    expect(entry0302!.shares).toBeCloseTo(initialPosition, 4);
  });

  test('sells on a date that appears twice in history: shares unchanged on that day', () => {
    // 新逻辑：当天的卖出不影响当天
    // 2026-03-03 (两个点): NAV=2.0, 卖出500@2.0 fee=1.0
    // 当天份额不变，仍是1000

    // Both points at UTC hours that stay on 2026-03-03 in any timezone (UTC+0..+14)
    const d0303a = Date.UTC(2026, 2, 3, 7, 0, 0);
    const d0303b = Date.UTC(2026, 2, 3, 12, 0, 0);

    const history: HistoricalPoint[] = [
      { date: d0303a, value: 2.0, equityReturn: 0 },
      { date: d0303b, value: 2.0, equityReturn: 0 },
    ];
    const trades: TradeRecord[] = [
      { id: 'x1', date: '2026-03-03', type: 'sell', shares: 500, price: 2.0, fee: 1.0 },
    ];

    const timeline = computeProfitTimeline({
      history,
      trades,
      initialPosition: 1000,
      initialPrice: 1.5,
    });

    // Two history points → two output rows
    expect(timeline.filter(p => p.date === '2026-03-03').length).toBe(2);

    // 新逻辑：当天的卖出不影响当天份额
    // shares = 1000 (不是500)
    for (const row of timeline.filter(p => p.date === '2026-03-03')) {
      expect(row.shares).toBe(1000);
    }

    // 新逻辑：当天的卖出金额不计入当天的累计盈利
    // cumulativeProfit = 1000*2 - 1000*1.5 = 2000 - 1500 = 500
    for (const row of timeline.filter(p => p.date === '2026-03-03')) {
      expect(row.cumulativeProfit).toBeCloseTo(500, 4);
    }
  });

  test('dailyProfit on first displayed day reflects only that day change, not full cumulative from history start', () => {
    // Reproduce the scenario from bugfix-profit.md:
    // History has data before fromDate, so cumulativePrevious must be set from pre-start history
    // to avoid the first displayed day's dailyProfit being the full cumulative instead of just a daily change.
    const history: HistoricalPoint[] = [
      { date: new Date('2026-02-20').getTime(), value: 1.4000, equityReturn: 0 },
      { date: new Date('2026-02-21').getTime(), value: 1.4200, equityReturn: 0 },
      { date: new Date('2026-02-22').getTime(), value: 1.4400, equityReturn: 0 },
      { date: new Date('2026-02-23').getTime(), value: 1.4300, equityReturn: 0 },
      { date: new Date('2026-02-24').getTime(), value: 1.4507, equityReturn: 0 },
      { date: new Date('2026-02-25').getTime(), value: 1.4733, equityReturn: 0 },
    ];
    // 10000 shares held since 2026-02-20 with initial price 1.3737; no trades
    const timeline = computeProfitTimeline({
      history,
      trades: [],
      initialPosition: 10000,
      initialPrice: 1.3737,
      fromDate: '2026-02-24',
      toDate: '2026-02-25',
    });

    // Only 2 days should be in the result
    expect(timeline.length).toBe(2);
    expect(timeline[0].date).toBe('2026-02-24');
    expect(timeline[1].date).toBe('2026-02-25');

    // The dailyProfit on 2026-02-24 should be the change from 2026-02-23 (1.4300) to 2026-02-24 (1.4507):
    // = 10000 * (1.4507 - 1.4300) = 10000 * 0.0207 = 207.00
    expect(timeline[0].dailyProfit).toBeCloseTo(207.00, 1);

    // The dailyProfit on 2026-02-25 should be the change from 2026-02-24 (1.4507) to 2026-02-25 (1.4733):
    // = 10000 * (1.4733 - 1.4507) = 10000 * 0.0226 = 226.00
    expect(timeline[1].dailyProfit).toBeCloseTo(226.00, 1);

    // The cumulativeProfit on 2026-02-24 should be: 10000 * 1.4507 - 10000 * 1.3737 = 770.00
    expect(timeline[0].cumulativeProfit).toBeCloseTo(770.00, 1);
  });

  test('trade on a day does not affect that day shares and cumulative profit', () => {
    // 新逻辑：当天的交易不影响当天的份额和累计盈利
    // 基于基金023832的真实数据测试
    //
    // initialPosition=37467.96, initialPrice=1.3737, initCost=51487.54
    //
    // 2026-02-13: NAV=1.3737 (baseline, initialPrice equals NAV)
    // 2026-02-24: NAV=1.4507, sell 10000@1.4507 fee14.51
    //   当天份额不变，仍是37467.96
    //   当天累计盈利 = 37467.96*1.4507 - 51487.54 = 2870.52
    // 2026-02-25: NAV=1.4733, sell 7000@1.4733 fee10.31
    //   昨天的卖出今天生效，份额 = 37467.96 - 10000 = 27467.96
    //   sellAmount = 10000*1.4507 - 14.51 = 14492.49
    //   当天累计盈利 = 27467.96*1.4733 - 51487.54 + 14492.49 = 3476.79
    //   但今天的卖出不影响今天...

    const mkDate = (s: string) => new Date(s + 'T08:00:00.000Z').getTime();
    const history: HistoricalPoint[] = [
      { date: mkDate('2026-02-13'), value: 1.3737, equityReturn: 0 },
      { date: mkDate('2026-02-24'), value: 1.4507, equityReturn: 0 },
      { date: mkDate('2026-02-25'), value: 1.4733, equityReturn: 0 },
    ];
    const trades: TradeRecord[] = [
      { id: 'a', date: '2026-02-24', type: 'sell', shares: 10000, price: 1.4507, fee: 14.51 },
    ];

    const timeline = computeProfitTimeline({
      history,
      trades,
      initialPosition: 37467.96,
      initialPrice: 1.3737,
    });

    const byDate = Object.fromEntries(timeline.map(p => [p.date, p]));

    // 2026-02-13: baseline
    expect(byDate['2026-02-13'].dailyProfit).toBeCloseTo(0, 1);
    expect(byDate['2026-02-13'].shares).toBeCloseTo(37467.96, 2);

    // 2026-02-24: 当天的卖出不影响当天
    expect(byDate['2026-02-24'].shares).toBeCloseTo(37467.96, 2); // 份额不变
    // cumulative = 37467.96 * 1.4507 - 37467.96 * 1.3737 = 2885.03
    expect(byDate['2026-02-24'].cumulativeProfit).toBeCloseTo(2885.03, 0);

    // 2026-02-25: 昨天的卖出今天生效
    expect(byDate['2026-02-25'].shares).toBeCloseTo(27467.96, 2); // 37467.96 - 10000
    // sellAmount = 10000*1.4507 - 14.51 = 14492.49
    // cumulative = 27467.96 * 1.4733 - 51487.54 + 14492.49 = 3476.79
    const expectedCum = 27467.96 * 1.4733 - 37467.96 * 1.3737 + 10000 * 1.4507 - 14.51;
    expect(byDate['2026-02-25'].cumulativeProfit).toBeCloseTo(expectedCum, 0);
  });

  test('dividend trade increases cumulative profit on the next day', () => {
    // 新逻辑：分红交易增加累计盈利（减少净投入成本）
    // 分红当天不影响当天的累计盈利，第二天开始生效
    //
    // initialPosition=100, initialPrice=10, initCost=1000
    // Day1 (2026-02-20, NAV=10): 无交易
    //   shares = 100, cumulative = 100*10 - 1000 = 0, dailyProfit = 0
    // Day2 (2026-02-21, NAV=11, 分红 total=50): 当天的分红不影响当天
    //   shares = 100 (分红不影响份额)
    //   cumulative = 100*11 - 1000 = 100 (分红明天才生效)
    //   dailyProfit = 100 - 0 = 100
    // Day3 (2026-02-22, NAV=12): 昨天的分红今天生效
    //   shares = 100 (份额不变)
    //   cumulativeDividendAmount = 50
    //   cumulative = 100*12 - 1000 + 50 = 250
    //   dailyProfit = 250 - 100 = 150
    const history: HistoricalPoint[] = [
      { date: new Date('2026-02-20').getTime(), value: 10, equityReturn: 0 },
      { date: new Date('2026-02-21').getTime(), value: 11, equityReturn: 0 },
      { date: new Date('2026-02-22').getTime(), value: 12, equityReturn: 0 },
    ];
    const trades: TradeRecord[] = [
      { id: 'd1', date: '2026-02-21', type: 'dividend', shares: 0, price: 0, fee: 0, total: 50 }
    ];
    const timeline = computeProfitTimeline({ history, trades, initialPosition: 100, initialPrice: 10 });

    expect(timeline[0].date).toBe('2026-02-20');
    expect(timeline[0].shares).toBe(100);
    expect(timeline[0].cumulativeProfit).toBeCloseTo(0);
    expect(timeline[0].dailyProfit).toBeCloseTo(0);

    expect(timeline[1].date).toBe('2026-02-21');
    expect(timeline[1].shares).toBe(100); // 分红不影响份额
    expect(timeline[1].cumulativeProfit).toBeCloseTo(100); // 分红明天才生效
    expect(timeline[1].dailyProfit).toBeCloseTo(100);

    expect(timeline[2].date).toBe('2026-02-22');
    expect(timeline[2].shares).toBe(100); // 份额不变
    expect(timeline[2].cumulativeProfit).toBeCloseTo(250); // 100*12 - 1000 + 50
    expect(timeline[2].dailyProfit).toBeCloseTo(150);
  });

  test('multiple dividend trades accumulate correctly', () => {
    // 测试多次分红交易的累计
    // initialPosition=100, initialPrice=10, initCost=1000
    // Day1 (2026-02-20, NAV=10): 无交易
    //   cumulative = 0
    // Day2 (2026-02-21, NAV=11, 分红 total=30): 当天不影响
    //   cumulative = 100*11 - 1000 = 100
    // Day3 (2026-02-22, NAV=12, 分红 total=20): 昨天的分红生效，当天的不影响
    //   cumulative = 100*12 - 1000 + 30 = 230
    // Day4 (2026-02-23, NAV=13): 两笔分红都生效
    //   cumulative = 100*13 - 1000 + 30 + 20 = 350
    const history: HistoricalPoint[] = [
      { date: new Date('2026-02-20').getTime(), value: 10, equityReturn: 0 },
      { date: new Date('2026-02-21').getTime(), value: 11, equityReturn: 0 },
      { date: new Date('2026-02-22').getTime(), value: 12, equityReturn: 0 },
      { date: new Date('2026-02-23').getTime(), value: 13, equityReturn: 0 },
    ];
    const trades: TradeRecord[] = [
      { id: 'd1', date: '2026-02-21', type: 'dividend', shares: 0, price: 0, fee: 0, total: 30 },
      { id: 'd2', date: '2026-02-22', type: 'dividend', shares: 0, price: 0, fee: 0, total: 20 },
    ];
    const timeline = computeProfitTimeline({ history, trades, initialPosition: 100, initialPrice: 10 });

    expect(timeline[0].cumulativeProfit).toBeCloseTo(0);
    expect(timeline[1].cumulativeProfit).toBeCloseTo(100); // 分红明天生效
    expect(timeline[2].cumulativeProfit).toBeCloseTo(230); // 100*12 - 1000 + 30
    expect(timeline[3].cumulativeProfit).toBeCloseTo(350); // 100*13 - 1000 + 30 + 20
  });

  test('dividend trade with buy and sell trades', () => {
    // 测试分红与买入/卖出混合的场景
    // initialPosition=100, initialPrice=10, initCost=1000
    // Day1 (2026-02-20, NAV=10): 无交易
    //   shares = 100, cumulative = 0
    // Day2 (2026-02-21, NAV=11, 买入50@10, 分红 total=50): 当天的交易不影响当天
    //   shares = 100, cumulative = 100*11 - 1000 = 100
    // Day3 (2026-02-22, NAV=12): 昨天的买入和分红生效
    //   shares = 100 + 50 = 150
    //   buyAmount = 50*10 = 500
    //   dividendAmount = 50
    //   cumulative = 150*12 - 1000 - 500 + 50 = 350
    // Day4 (2026-02-23, NAV=13, 卖出30@13): 当天的卖出不影响当天
    //   shares = 150
    //   sellAmountBeforeToday = 0 (昨天的卖出还没发生)
    //   cumulative = 150*13 - 1000 - 500 + 50 = 500
    // Day5 (2026-02-24, NAV=14): 昨天的卖出生效
    //   shares = 150 - 30 = 120
    //   sellAmountBeforeToday = 30*13 = 390
    //   cumulative = 120*14 - 1000 - 500 + 50 + 390 = 620
    const history: HistoricalPoint[] = [
      { date: new Date('2026-02-20').getTime(), value: 10, equityReturn: 0 },
      { date: new Date('2026-02-21').getTime(), value: 11, equityReturn: 0 },
      { date: new Date('2026-02-22').getTime(), value: 12, equityReturn: 0 },
      { date: new Date('2026-02-23').getTime(), value: 13, equityReturn: 0 },
      { date: new Date('2026-02-24').getTime(), value: 14, equityReturn: 0 },
    ];
    const trades: TradeRecord[] = [
      { id: 'b1', date: '2026-02-21', type: 'buy', shares: 50, price: 10, fee: 0 },
      { id: 'd1', date: '2026-02-21', type: 'dividend', shares: 0, price: 0, fee: 0, total: 50 },
      { id: 's1', date: '2026-02-23', type: 'sell', shares: 30, price: 13, fee: 0 },
    ];
    const timeline = computeProfitTimeline({ history, trades, initialPosition: 100, initialPrice: 10 });

    expect(timeline[0].shares).toBe(100);
    expect(timeline[0].cumulativeProfit).toBeCloseTo(0);

    expect(timeline[1].shares).toBe(100); // 当天的买入不影响
    expect(timeline[1].cumulativeProfit).toBeCloseTo(100);

    expect(timeline[2].shares).toBe(150); // 昨天的买入生效
    expect(timeline[2].cumulativeProfit).toBeCloseTo(350);

    expect(timeline[3].shares).toBe(150); // 当天的卖出不影响
    expect(timeline[3].cumulativeProfit).toBeCloseTo(500);

    expect(timeline[4].shares).toBe(120); // 昨天的卖出生效
    expect(timeline[4].cumulativeProfit).toBeCloseTo(620);
  });

  test('dividend trade with zero total does not affect cumulative profit', () => {
    // 测试 total 为 0 的分红交易不影响累计盈利
    const history: HistoricalPoint[] = [
      { date: new Date('2026-02-20').getTime(), value: 10, equityReturn: 0 },
      { date: new Date('2026-02-21').getTime(), value: 11, equityReturn: 0 },
      { date: new Date('2026-02-22').getTime(), value: 12, equityReturn: 0 },
    ];
    const trades: TradeRecord[] = [
      { id: 'd1', date: '2026-02-21', type: 'dividend', shares: 0, price: 0, fee: 0, total: 0 },
    ];
    const timeline = computeProfitTimeline({ history, trades, initialPosition: 100, initialPrice: 10 });

    expect(timeline[0].cumulativeProfit).toBeCloseTo(0);
    expect(timeline[1].cumulativeProfit).toBeCloseTo(100);
    expect(timeline[2].cumulativeProfit).toBeCloseTo(200); // 没有分红增加
  });

  test('dividend trade without total field does not affect cumulative profit', () => {
    // 测试没有 total 字段的分红交易不影响累计盈利
    const history: HistoricalPoint[] = [
      { date: new Date('2026-02-20').getTime(), value: 10, equityReturn: 0 },
      { date: new Date('2026-02-21').getTime(), value: 11, equityReturn: 0 },
      { date: new Date('2026-02-22').getTime(), value: 12, equityReturn: 0 },
    ];
    const trades: TradeRecord[] = [
      // total 字段可选，缺失时不应导致错误
      { id: 'd1', date: '2026-02-21', type: 'dividend', shares: 0, price: 0, fee: 0 },
    ];
    const timeline = computeProfitTimeline({ history, trades, initialPosition: 100, initialPrice: 10 });

    expect(timeline[0].cumulativeProfit).toBeCloseTo(0);
    expect(timeline[1].cumulativeProfit).toBeCloseTo(100);
    expect(timeline[2].cumulativeProfit).toBeCloseTo(200); // 没有分红增加
  });
});
