import { computeRiskRating } from '../../utils/riskTooltip';

describe('computeRiskRating dual-dimension analysis', () => {
  test('emits opportunity signals for a golden-cross setup', () => {
    const values = [1.0, 1.3];
    const maValues = {
      5: [1.0, 1.3],
      10: [1.2, 1.1],
      20: [0.9, 0.95]
    } as any;

    const res = computeRiskRating({ price: 1.3, values, maValues, index: 1, prevIndex: 0 });

    expect(res.opportunitySignals.some(r => r.includes('金叉'))).toBe(true);
    expect(['机会', '偏多']).toContain(res.rating);
    expect(res.riskSignals.some(r => r.includes('MA20'))).toBe(false);
  });

  test('emits strong risk signals for a death-cross plus MA20 break setup', () => {
    const values = [1.2, 1.0];
    const maValues = {
      5: [1.3, 1.0],
      10: [1.1, 1.05],
      20: [1.15, 1.1]
    } as any;

    const res = computeRiskRating({ price: 1.0, values, maValues, index: 1, prevIndex: 0 });

    expect(res.riskSignals.some(r => r.includes('死叉'))).toBe(true);
    expect(res.riskSignals.some(r => r.includes('MA20'))).toBe(true);
    expect(res.rating).toBe('风险');
  });

  test('falls back to watch mode when price is invalid', () => {
    const maValues = { 5: [1.0], 10: [1.0], 20: [1.0] } as any;
    const res = computeRiskRating({ price: 0, values: [], maValues, index: 0, prevIndex: -1 });

    expect(res.rating).toBe('观望');
    expect(res.notes.some(note => note.includes('历史数据不足'))).toBe(true);
  });
});
