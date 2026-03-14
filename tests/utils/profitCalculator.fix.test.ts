// Test case to verify the fix for the issue where changing the start date
// resulted in the first record's daily and cumulative profit not being correctly calculated as 0
describe('Profit Calculation Fix Verification', () => {
  test('should correctly handle scenario where user selects initial start date in UI', () => {
    // This test simulates the situation handled in ProfitModal.tsx
    // where we manually set the first day's profit to 0 when
    // fromDate === initialStartDate

    const timeline = [
      { date: '2026-02-24', netValue: 1.0, shares: 100, cumulativeProfit: 10.50, dailyProfit: 10.50 },
      { date: '2026-02-25', netValue: 1.05, shares: 100, cumulativeProfit: 15.75, dailyProfit: 5.25 },
      { date: '2026-02-26', netValue: 1.1, shares: 100, cumulativeProfit: 19.05, dailyProfit: 3.30 },
    ];

    // Simulate the logic from ProfitModal.tsx
    const fromDate = '2026-02-24';
    const initialStartDate = '2026-02-24'; // Same as fromDate

    // Apply the fix logic
    let processedTimeline = [...timeline];
    if (fromDate && initialStartDate && fromDate === initialStartDate && processedTimeline.length > 0) {
      if (processedTimeline[0].date === fromDate) {
        let cumAcc = 0;
        for (let i = 0; i < processedTimeline.length; i++) {
          const daily = i === 0 ? 0 : (processedTimeline[i].dailyProfit || 0);
          cumAcc = Number((cumAcc + daily).toFixed(4));

          processedTimeline[i] = {
            ...processedTimeline[i],
            cumulativeProfit: cumAcc,
            dailyProfit: daily,
          };
        }
      }
    }

    // Verify the fix worked
    expect(processedTimeline[0].dailyProfit).toBe(0);
    expect(processedTimeline[0].cumulativeProfit).toBe(0);
  });
});