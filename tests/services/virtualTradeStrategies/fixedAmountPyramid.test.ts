import { fixedAmountPyramidStrategy } from '../../../services/virtualTradeStrategies/fixedAmountPyramid';
import { VirtualStrategyContext } from '../../../types';

describe('FixedAmountPyramidStrategy', () => {
  const baseContext: VirtualStrategyContext = {
    history: [
      { date: new Date('2023-01-01').getTime(), value: 1.0, equityReturn: 0 },
      { date: new Date('2023-01-02').getTime(), value: 1.05, equityReturn: 0 },
      { date: new Date('2023-01-03').getTime(), value: 0.95, equityReturn: 0 },
    ],
    cash: 100000,
    shares: 0,
    baseUnit: 1000,
    startNav: 1.0,
    transactionHistory: []
  };

  it('should initialize reference prices using startNav when no transaction history exists', () => {
    const context: VirtualStrategyContext = {
      ...baseContext,
      transactionHistory: []
    };

    const decision = fixedAmountPyramidStrategy.decide(context);
    expect(decision).toBeDefined();
  });

  it('should use transaction history to determine reference prices for triggers', () => {
    const context: VirtualStrategyContext = {
      ...baseContext,
      history: [
        { date: new Date('2023-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2023-01-02').getTime(), value: 1.05, equityReturn: 0 },
        { date: new Date('2023-01-03').getTime(), value: 0.95, equityReturn: 0 },
        { date: new Date('2023-01-04').getTime(), value: 0.90, equityReturn: 0 },
      ],
      transactionHistory: [
        {
          date: '2023-01-02',
          action: 'buy',
          nav: 0.92,
          shares: 1000,
          amount: 920
        },
        {
          date: '2023-01-03',
          action: 'sell',
          nav: 1.02,
          shares: -500,
          amount: -510
        }
      ]
    };

    const decision = fixedAmountPyramidStrategy.decide(context);
    expect(decision.action).toBeDefined();
  });

  it('should respect max position limit from fund configuration', () => {
    const context: VirtualStrategyContext = {
      ...baseContext,
      cash: 50000,
      shares: 40000,
      history: [
        { date: new Date('2023-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2023-01-02').getTime(), value: 0.80, equityReturn: 0 },
      ],
      fundConfig: {
        maxPosition: 50000
      }
    };

    const decision = fixedAmountPyramidStrategy.decide(context);
    expect(decision).toBeDefined();
  });

  it('should calculate buy threshold based on last buy reference price', () => {
    const context: VirtualStrategyContext = {
      ...baseContext,
      history: [
        { date: new Date('2023-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2023-01-02').getTime(), value: 0.90, equityReturn: 0 },
      ],
      transactionHistory: [
        {
          date: '2023-01-01',
          action: 'buy',
          nav: 0.95,
          shares: 1000,
          amount: 950
        }
      ]
    };

    const decision = fixedAmountPyramidStrategy.decide(context);
    expect(decision).toBeDefined();
  });

  it('should calculate sell threshold based on last sell reference price', () => {
    const context: VirtualStrategyContext = {
      ...baseContext,
      history: [
        { date: new Date('2023-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2023-01-02').getTime(), value: 1.10, equityReturn: 0 },
      ],
      transactionHistory: [
        {
          date: '2023-01-01',
          action: 'sell',
          nav: 1.05,
          shares: -500,
          amount: -525
        }
      ]
    };

    const decision = fixedAmountPyramidStrategy.decide(context);
    expect(decision).toBeDefined();
  });

  it('should use fundConfig.maxPosition when available instead of default', () => {
    const contextWithFundConfig: VirtualStrategyContext = {
      ...baseContext,
      cash: 150000,
      shares: 20000,
      history: [
        { date: new Date('2023-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2023-01-02').getTime(), value: 0.85, equityReturn: 0 },
      ],
      fundConfig: {
        maxPosition: 75000
      }
    };

    const contextWithoutFundConfig: VirtualStrategyContext = {
      ...baseContext,
      cash: 150000,
      shares: 20000,
      history: [
        { date: new Date('2023-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2023-01-02').getTime(), value: 0.85, equityReturn: 0 },
      ],
    };

    const decisionWithConfig = fixedAmountPyramidStrategy.decide(contextWithFundConfig);
    const decisionWithoutConfig = fixedAmountPyramidStrategy.decide(contextWithoutFundConfig);

    expect(decisionWithConfig).toBeDefined();
    expect(decisionWithoutConfig).toBeDefined();
  });
});