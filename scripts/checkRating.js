const { computeRatingFromHistory } = require('../utils/ratingHelper');
const fs = require('fs');

// Build sample history similar to tests
const HISTORY = Array.from({ length: 25 }).map((_, i) => ({ date: 1670000000000 + i * 1000, value: i < 24 ? 1.0 : 1.5, equityReturn: 0 }));
const data = {
  symbol: '000001',
  name: 'Sample Fund',
  currentPrice: 1.5,
  previousPrice: 1.4,
  changePercentage: 1.0,
  lastUpdated: '2026-02-12 15:00',
  realtimeDate: new Date(HISTORY[HISTORY.length - 1].date).toISOString().split('T')[0],
  netWorthDate: '2026-02-11',
  valuationDate: '2026-02-12',
  sourceUrl: ''
};

const res = computeRatingFromHistory(HISTORY, data);
console.log('rating:', res);

