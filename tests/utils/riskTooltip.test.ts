import { computeRiskRating } from '../../utils/riskTooltip';

describe('computeRiskRating golden/death cross detection', () => {
  test('detects golden cross when prev <= and now 5>10 and same-day 5>10>20', () => {
    const maValues = {
      5: [1.0, 1.3],
      10: [1.2, 1.1],
      20: [0.9, 0.9]
    } as any;
    const res = computeRiskRating({ price: 1.3, maValues, index: 1, prevIndex: 0 });
    expect(res.reasons.some(r => r.includes('黄金交叉'))).toBe(true);
    // rating should be '机会' or '安全' depending on price vs sma5*TOLERANCE; here price==sma5 so it's >=
    expect(res.rating === '机会' || res.rating === '安全').toBe(true);
  });

  test('does not detect golden cross when prev values missing', () => {
    const maValues = {
      5: [null, 1.3],
      10: [null, 1.1],
      20: [null, 0.9]
    } as any;
    const res = computeRiskRating({ price: 1.3, maValues, index: 1, prevIndex: 0 });
    expect(res.reasons.some(r => r.includes('黄金交叉'))).toBe(false);
  });

  test('detects death cross when prev >= and now 5<10 and same-day 5<10<20', () => {
    const maValues = {
      5: [1.3, 1.0],
      10: [1.1, 1.05],
      20: [1.4, 1.1]
    } as any;
    const res = computeRiskRating({ price: 1.0, maValues, index: 1, prevIndex: 0 });
    expect(res.reasons.some(r => r.includes('死亡交叉'))).toBe(true);
  });

  test('treats equality prev_sma5 === prev_sma10 and now sma5 > sma10 as golden cross', () => {
    const maValues = {
      5: [1.1, 1.3],
      10: [1.1, 1.1],
      20: [1.0, 0.9]
    } as any;
    const res = computeRiskRating({ price: 1.3, maValues, index: 1, prevIndex: 0 });
    expect(res.reasons.some(r => r.includes('黄金交叉'))).toBe(true);
  });
});

