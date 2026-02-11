import { computeSMA, computeMultipleSMAs } from '../../utils/movingAverage';

describe('movingAverage utils', () => {
  test('computeSMA returns nulls until window filled and then averages', () => {
    const vals = [1,2,3,4,5,6];
    const res = computeSMA(vals, 3);
    expect(res.length).toBe(vals.length);
    expect(res[0]).toBeNull();
    expect(res[1]).toBeNull();
    expect(res[2]).toBeCloseTo((1+2+3)/3);
    expect(res[3]).toBeCloseTo((2+3+4)/3);
    expect(res[5]).toBeCloseTo((4+5+6)/3);
  });

  test('computeMultipleSMAs returns correct windows', () => {
    const vals = [10,20,30,40,50];
    const res = computeMultipleSMAs(vals, [2,5]);
    expect(res[2].length).toBe(vals.length);
    expect(res[5].length).toBe(vals.length);
    // For window=2, index 1 should be the average of [10,20]
    expect(res[2][1]).toBeCloseTo((10+20)/2);
    expect(res[2][2]).toBeCloseTo((20+30)/2);
    expect(res[5][4]).toBeCloseTo((10+20+30+40+50)/5);
  });
});
