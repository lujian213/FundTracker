const data = require('../jest-results.json');

// Suite-level timings
const suites = data.testResults.map(s => ({
  name: s.name.split('\\tests\\')[1] || s.name,
  ms: s.endTime - s.startTime,
})).sort((a, b) => b.ms - a.ms);

console.log('=== Test Suite Timings (ms) ===');
suites.forEach(s => console.log(String(s.ms).padStart(6) + 'ms  ' + s.name));

// Individual test timings
const tests = [];
data.testResults.forEach(suite =>
  suite.assertionResults.forEach(t =>
    tests.push({ name: t.fullName, ms: t.duration || 0 })
  )
);
tests.sort((a, b) => b.ms - a.ms);

console.log('\n=== Top 20 Slowest Individual Tests (ms) ===');
tests.slice(0, 20).forEach(t =>
  console.log(String(t.ms).padStart(6) + 'ms  ' + t.name.slice(0, 100))
);

