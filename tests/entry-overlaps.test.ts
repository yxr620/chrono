import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';

import { detectEntryOverlaps } from '../src/services/entryOverlaps';
import type { TimeEntry } from '../src/services/db';

const d = (value: string): Date => dayjs(value).toDate();

const entry = (
  id: string,
  startTime: string,
  endTime: string | null,
  deleted = false,
): TimeEntry => {
  const timestamp = d('2026-08-15 12:00');
  return {
    id,
    startTime: d(startTime),
    endTime: endTime ? d(endTime) : null,
    activity: id,
    categoryId: null,
    goalId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deleted,
  };
};

test('detectEntryOverlaps finds nested non-adjacent conflicts and their true duration', () => {
  const overlaps = detectEntryOverlaps([
    entry('long', '2026-08-15 08:00', '2026-08-15 12:00'),
    entry('nested', '2026-08-15 09:00', '2026-08-15 10:00'),
    entry('later', '2026-08-15 11:00', '2026-08-15 13:00'),
  ]);

  assert.deepEqual(
    overlaps.map(pair => [pair.entryA.id, pair.entryB.id, pair.overlapMinutes]),
    [
      ['long', 'nested', 60],
      ['long', 'later', 60],
    ],
  );
});

test('touching entries are not overlapping', () => {
  const overlaps = detectEntryOverlaps([
    entry('first', '2026-08-15 08:00', '2026-08-15 09:00'),
    entry('second', '2026-08-15 09:00', '2026-08-15 10:00'),
  ]);

  assert.equal(overlaps.length, 0);
});

test('range filtering attributes a cross-midnight overlap to the affected day', () => {
  const entries = [
    entry('cross-midnight', '2026-08-15 23:00', '2026-08-16 01:00'),
    entry('next-day', '2026-08-16 00:30', '2026-08-16 02:00'),
  ];

  const firstDay = detectEntryOverlaps(entries, {
    start: d('2026-08-15 00:00'),
    end: d('2026-08-16 00:00'),
  });
  const secondDay = detectEntryOverlaps(entries, {
    start: d('2026-08-16 00:00'),
    end: d('2026-08-17 00:00'),
  });

  assert.equal(firstDay.length, 0);
  assert.equal(secondDay.length, 1);
  assert.equal(secondDay[0].overlapMinutes, 30);
});

test('ongoing, deleted, and reversed entries do not produce overlap warnings', () => {
  const overlaps = detectEntryOverlaps([
    entry('valid', '2026-08-15 08:00', '2026-08-15 12:00'),
    entry('ongoing', '2026-08-15 09:00', null),
    entry('deleted', '2026-08-15 09:00', '2026-08-15 10:00', true),
    entry('reversed', '2026-08-15 11:00', '2026-08-15 10:00'),
  ]);

  assert.equal(overlaps.length, 0);
});
