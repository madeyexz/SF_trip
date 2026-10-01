import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  addMonthsToMonthISO,
  buildCalendarGridDates,
  buildISODateRange,
  formatDate,
  formatDateDayMonth,
  formatDateWeekday,
  formatDayOfMonth,
  formatMonthYear,
  normalizeDateKey,
  toISODate,
  toMonthISO,
} from './helpers.ts';

const helpersUrl = new URL('./helpers.ts', import.meta.url).href;

describe('calendar date-only operations', () => {
  for (const timeZone of ['Asia/Taipei', 'America/Los_Angeles', 'UTC']) {
    it(`keeps calendar labels and navigation stable in ${timeZone}`, () => {
      // Separate processes prevent ambient timezone state leaking between tests.
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        import * as dates from ${JSON.stringify(helpersUrl)};
        assert.equal(dates.toISODate('2026-03-01'), '2026-03-01');
        assert.equal(dates.formatMonthYear('2026-03-01'), 'March 2026');
        assert.equal(dates.formatDayOfMonth('2026-03-01'), '1');
        assert.equal(dates.formatDateWeekday('2026-03-01'), 'Sun');
        assert.equal(dates.formatDateDayMonth('2026-03-01'), 'Mar 1');
        assert.equal(dates.addMonthsToMonthISO('2026-03-01', 1), '2026-04-01');
        assert.equal(dates.addMonthsToMonthISO('2026-03-01', -1), '2026-02-01');
        assert.equal(dates.addMonthsToMonthISO('2026-03-31', 1), '2026-04-01');
        const grid = dates.buildCalendarGridDates('2026-03-01');
        assert.equal(grid.length, 42);
        assert.equal(grid[0], '2026-03-01');
        assert.equal(grid.at(-1), '2026-04-11');
        for (let index = 0; index < grid.length; index += 1) {
          assert.equal(new Date(grid[index] + 'T00:00:00Z').getUTCDay(), index % 7);
          assert.equal(dates.formatDayOfMonth(grid[index]), String(Number(grid[index].slice(8))));
        }
        assert.deepEqual(dates.buildISODateRange('2026-03-07', '2026-03-10'),
          ['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
        assert.deepEqual(dates.buildISODateRange('2026-10-31', '2026-11-03'),
          ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
        assert.equal(dates.formatDateWeekday('2026-03-08'), 'Sun');
        assert.equal(dates.formatDateWeekday('2026-11-01'), 'Sun');
        const localNow = new Date(2026, 2, 8, 23, 30);
        assert.equal(dates.toISODate(localNow), '2026-03-08');
        assert.equal(dates.normalizeDateKey('2026-03-08T23:30:00-07:00'), '2026-03-08');
      `], { env: { ...process.env, TZ: timeZone, LANG: 'en_US.UTF-8' }, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr || result.stdout);
    });
  }

  it('crosses year and leap-month boundaries without overflowing the month', () => {
    assert.equal(addMonthsToMonthISO('2026-12-31', 1), '2027-01-01');
    assert.equal(addMonthsToMonthISO('2026-01-31', -1), '2025-12-01');
    assert.equal(addMonthsToMonthISO('2024-01-31', 1), '2024-02-01');
    const grid = buildCalendarGridDates('2024-02-29');
    assert.equal(grid[0], '2024-01-28');
    assert.equal(grid.at(-1), '2024-03-09');
    assert.ok(grid.includes('2024-02-29'));
    assert.deepEqual(buildISODateRange('2024-02-28', '2024-03-01'),
      ['2024-02-28', '2024-02-29', '2024-03-01']);
  });

  it('preserves existing event date keys rather than reinterpreting timestamps', () => {
    const timestamp = '2026-03-08T23:30:00-07:00';
    assert.equal(normalizeDateKey(timestamp), '2026-03-08');
    assert.equal(toMonthISO(timestamp), '2026-03-01');
    assert.equal(formatDayOfMonth(timestamp), '8');
    assert.equal(formatDateWeekday(timestamp), 'Sun');
    assert.equal(formatDateDayMonth(timestamp), 'Mar 8');
    assert.match(formatDate(timestamp), /2026/);
    assert.equal(toISODate('2026-03-08'), '2026-03-08');
    assert.equal(formatMonthYear('2026-03-01'), formatMonthYear('2026-03-31'));
  });

  it('keeps invalid-input fallbacks', () => {
    assert.equal(toISODate('not a date'), '');
    assert.deepEqual(buildCalendarGridDates('not a date'), []);
    assert.equal(formatDate('not a date'), 'not a date');
    assert.equal(formatMonthYear('not a date'), 'not a date');
  });
});
