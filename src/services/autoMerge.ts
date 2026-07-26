import { db, type TimeEntry } from './db';
import { syncDb } from './syncDb';

const STORAGE_KEY = 'chrono_auto_merge_enabled';
const TOLERANCE_MS = 2000;
const MAX_CHAIN = 3;

export function isAutoMergeEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAutoMergeEnabled(value: boolean): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, 'true');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function isIdentical(a: TimeEntry, b: TimeEntry): boolean {
  return (
    (a.activity ?? '').trim() === (b.activity ?? '').trim() &&
    (a.categoryId ?? null) === (b.categoryId ?? null) &&
    (a.goalId ?? null) === (b.goalId ?? null) &&
    (a.memo ?? '').trim() === (b.memo ?? '').trim()
  );
}

async function findLeftNeighbor(entry: TimeEntry): Promise<TimeEntry | null> {
  if (!entry.startTime) return null;
  const startMs = new Date(entry.startTime).getTime();
  const lower = new Date(startMs - TOLERANCE_MS);
  const upper = new Date(startMs);

  const candidates = await db.entries
    .where('endTime')
    .between(lower, upper, true, true)
    .toArray();

  const filtered = candidates.filter(
    c => !c.deleted && c.id !== entry.id && c.endTime !== null
  );
  if (filtered.length === 0) return null;
  filtered.sort(
    (a, b) => new Date(b.endTime!).getTime() - new Date(a.endTime!).getTime()
  );
  return filtered[0];
}

export async function tryMergeWithLeftNeighbor(entry: TimeEntry): Promise<string | null> {
  let visibleEntryId = entry.id ?? null;
  if (!isAutoMergeEnabled()) return visibleEntryId;
  if (!entry.id || !entry.endTime || entry.deleted) return visibleEntryId;

  let current = entry;
  for (let i = 0; i < MAX_CHAIN; i++) {
    const left = await findLeftNeighbor(current);
    if (!left || !left.id) return visibleEntryId;
    if (!isIdentical(left, current)) return visibleEntryId;

    try {
      await syncDb.entries.update(left.id, { endTime: current.endTime });
      await syncDb.entries.delete(current.id!);
    } catch (err) {
      console.warn('[autoMerge] merge failed', err);
      return visibleEntryId;
    }

    current = { ...left, endTime: current.endTime };
    visibleEntryId = left.id;
  }

  return visibleEntryId;
}
