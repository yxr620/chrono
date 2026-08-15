import type { TimeEntry } from './db';

export interface OverlapPair {
  entryA: TimeEntry;
  entryB: TimeEntry;
  overlapMinutes: number;
}

export interface EntryOverlapRange {
  start?: Date;
  end?: Date;
}

interface CompletedEntryInterval {
  entry: TimeEntry;
  startMs: number;
  endMs: number;
}

/**
 * Finds every pair of completed entries whose intervals overlap.
 * Range boundaries are optional and use a half-open interval: [start, end).
 */
export function detectEntryOverlaps(
  entries: TimeEntry[],
  range?: EntryOverlapRange,
): OverlapPair[] {
  const rangeStartMs = range?.start?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rangeEndMs = range?.end?.getTime() ?? Number.POSITIVE_INFINITY;

  const completed = entries
    .filter(entry => !entry.deleted && entry.endTime !== null)
    .map<CompletedEntryInterval>(entry => ({
      entry,
      startMs: new Date(entry.startTime).getTime(),
      endMs: new Date(entry.endTime!).getTime(),
    }))
    .filter(interval => (
      Number.isFinite(interval.startMs)
      && Number.isFinite(interval.endMs)
      && interval.endMs > interval.startMs
      && interval.endMs > rangeStartMs
      && interval.startMs < rangeEndMs
    ))
    .sort((a, b) => (
      a.startMs - b.startMs
      || a.endMs - b.endMs
      || (a.entry.id ?? '').localeCompare(b.entry.id ?? '')
    ));

  const active: CompletedEntryInterval[] = [];
  const overlaps: OverlapPair[] = [];

  for (const current of completed) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].endMs <= current.startMs) {
        active.splice(i, 1);
      }
    }

    for (const previous of active) {
      const overlapStartMs = current.startMs;
      const overlapEndMs = Math.min(previous.endMs, current.endMs);

      if (overlapEndMs <= rangeStartMs || overlapStartMs >= rangeEndMs) continue;

      const clippedStartMs = Math.max(overlapStartMs, rangeStartMs);
      const clippedEndMs = Math.min(overlapEndMs, rangeEndMs);
      if (clippedEndMs <= clippedStartMs) continue;

      overlaps.push({
        entryA: previous.entry,
        entryB: current.entry,
        overlapMinutes: Math.round((clippedEndMs - clippedStartMs) / 60_000),
      });
    }

    active.push(current);
  }

  return overlaps;
}
