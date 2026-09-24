import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashSeed, dateKey, dailyNumber, addDays, dailySeed, parseHash, buildHash, rating, squares, dailyStreak, overText } from '../template/core/golf.js';

test('hashSeed is stable and spreads nearby inputs', () => {
  assert.equal(hashSeed('pour:level:1'), hashSeed('pour:level:1'));
  assert.notEqual(hashSeed('pour:level:1'), hashSeed('pour:level:2'));
  assert.ok(hashSeed('x') >= 0 && hashSeed('x') < 2 ** 32);
});

test('dates: local key, day arithmetic and daily numbers', () => {
  assert.equal(dateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(dailyNumber('2026-09-24', '2026-09-24'), 1);
  assert.equal(dailyNumber('2026-10-24', '2026-09-24'), 31);
  assert.equal(dailySeed('pour', '2026-09-24'), dailySeed('pour', '2026-09-24'));
  assert.notEqual(dailySeed('pour', '2026-09-24'), dailySeed('sudoku', '2026-09-24'));
});

test('hash links round-trip', () => {
  assert.deepEqual(parseHash(buildHash({ d: '2026-09-24', m: 22 })), { d: '2026-09-24', m: '22' });
  assert.equal(buildHash({ l: 3, m: null }), '#l=3');
  assert.equal(buildHash({}), '');
  assert.deepEqual(parseHash(''), {});
});

test('rating against par', () => {
  assert.equal(rating(20, 20).label, 'Perfect');
  assert.equal(rating(21, 20).label, 'Great');
  assert.equal(rating(24, 20).label, 'Solved');
  assert.equal(rating(40, 20).label, 'Finished');
  assert.equal(overText(0), 'par');
  assert.equal(overText(3), '+3');
});

test('squares show par in green and overage in yellow', () => {
  assert.equal(squares(20, 20), '🟩'.repeat(10));
  const over = squares(25, 20);
  assert.ok(over.includes('🟨') && over.startsWith('🟩'));
  assert.ok([...over].length <= 10);
});

test('daily streak counts back from today or yesterday', () => {
  const log = { '2026-09-22': {}, '2026-09-23': {}, '2026-09-24': {} };
  assert.equal(dailyStreak(log, '2026-09-24'), 3);
  assert.equal(dailyStreak(log, '2026-09-25'), 3);
  assert.equal(dailyStreak(log, '2026-09-26'), 0);
  assert.equal(dailyStreak({}, '2026-09-24'), 0);
});
