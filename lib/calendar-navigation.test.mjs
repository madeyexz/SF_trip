import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addMonthsToMonthISO, toMonthISO } from './helpers.ts';

const providerSource = await readFile(
  new URL('../components/providers/TripProvider.tsx', import.meta.url), 'utf8'
);
const calendarSource = await readFile(
  new URL('../app/(tabs)/calendar/page.tsx', import.meta.url), 'utf8'
);

// Exercise the actual provider effect and navigation callback with a small
// dependency-aware hook harness, without adding a DOM or test-renderer runtime.
const monthEffect = providerSource.match(
  /useEffect\(\(\) => \{\s*if \(!selectedDate\) return;[\s\S]*?\}, \[[^\]]*\]\);/
)?.[0];
const shiftCallback = providerSource.match(
  /const shiftCalendarMonth = useCallback\(\(offset\) => \{[\s\S]*?\}, \[[^\]]*\]\);/
)?.[0];

function createCalendarHarness(initialDate = '2026-03-05') {
  assert.ok(monthEffect, 'Calendar selection effect must exist');
  assert.ok(shiftCallback, 'Month navigation callback must exist');
  let selectedDate = initialDate;
  let month = '';
  let previousDependencies;
  const setCalendarMonthISO = (next) => { month = next; };
  const runEffect = new Function(
    'useEffect', 'selectedDate', 'calendarMonthISO', 'setCalendarMonthISO', 'toMonthISO',
    monthEffect
  );
  const buildShiftCallback = new Function(
    'useCallback', 'calendarAnchorISO', 'setCalendarMonthISO', 'addMonthsToMonthISO',
    `${shiftCallback}\nreturn shiftCalendarMonth;`
  );
  const render = () => {
    runEffect((callback, dependencies) => {
      if (!previousDependencies || dependencies.some((value, index) =>
        !Object.is(value, previousDependencies[index]))) {
        callback();
      }
      previousDependencies = dependencies;
    }, selectedDate, month, setCalendarMonthISO, toMonthISO);
  };
  render();
  return {
    get month() { return month; },
    get selectedDate() { return selectedDate; },
    render,
    shift(offset) {
      const shift = buildShiftCallback(
        (callback) => callback, month || selectedDate, setCalendarMonthISO, addMonthsToMonthISO
      );
      shift(offset);
      render();
    },
    selectDate(next) {
      selectedDate = next;
      render();
    },
  };
}

describe('calendar month navigation', () => {
  it('keeps Next and Prev changes after effects run, without changing the active trip day', () => {
    const calendar = createCalendarHarness();
    assert.equal(calendar.month, '2026-03-01');
    calendar.shift(1);
    assert.equal(calendar.month, '2026-04-01');
    calendar.render();
    assert.equal(calendar.month, '2026-04-01');
    calendar.shift(1);
    assert.equal(calendar.month, '2026-05-01');
    calendar.shift(-1);
    calendar.shift(-1);
    calendar.shift(-1);
    assert.equal(calendar.month, '2026-02-01');
    assert.equal(calendar.selectedDate, '2026-03-05');
  });

  it('follows a new selected day after browsing without locking subsequent navigation', () => {
    const calendar = createCalendarHarness();
    calendar.shift(1);
    calendar.selectDate('2026-03-20');
    assert.equal(calendar.month, '2026-03-01');
    calendar.shift(1);
    assert.equal(calendar.month, '2026-04-01');
    calendar.selectDate('2026-12-15');
    assert.equal(calendar.month, '2026-12-01');
    calendar.shift(1);
    assert.equal(calendar.month, '2027-01-01');
    calendar.shift(-1);
    assert.equal(calendar.month, '2026-12-01');
  });

  it('does not erase browsed month during an empty selection or same-date update', () => {
    const calendar = createCalendarHarness();
    calendar.shift(1);
    calendar.selectDate('2026-03-05');
    assert.equal(calendar.month, '2026-04-01');
    calendar.selectDate('');
    assert.equal(calendar.month, '2026-04-01');
  });

  it('wires calendar controls to month navigation rather than selected-day changes', () => {
    assert.match(calendarSource, /onClick=\{\(\) => shiftCalendarMonth\(-1\)\}/);
    assert.match(calendarSource, /onClick=\{\(\) => shiftCalendarMonth\(1\)\}/);
  });
});
