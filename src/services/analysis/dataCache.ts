import { db, getAnalysisDataRevision } from '../db';
import type { Category, Goal, TimeEntry } from '../db';

export interface AnalysisDataSnapshot {
  entries: TimeEntry[];
  goals: Goal[];
  categories: Category[];
  revision: number;
}

let cachedSnapshot: AnalysisDataSnapshot | null = null;
let snapshotPromise: Promise<AnalysisDataSnapshot> | null = null;

/**
 * Read the analysis tables once and reuse the same stable snapshot across the
 * dashboard, trend and goal chapters. Concurrent callers share the same
 * promise, preventing duplicate full-table IndexedDB scans on first render.
 */
export async function getAnalysisDataSnapshot(): Promise<AnalysisDataSnapshot> {
  const currentRevision = getAnalysisDataRevision();
  if (cachedSnapshot?.revision === currentRevision) {
    return cachedSnapshot;
  }

  if (snapshotPromise) {
    return snapshotPromise;
  }

  snapshotPromise = (async () => {
    // A database upgrade or sync can write while the first read is in flight.
    // Retry until all three arrays belong to one unchanged revision.
    for (;;) {
      const revisionBeforeRead = getAnalysisDataRevision();
      const [entries, goals, categories] = await Promise.all([
        db.entries.toArray(),
        db.goals.toArray(),
        db.categories.toArray(),
      ]);
      const revisionAfterRead = getAnalysisDataRevision();

      if (revisionBeforeRead === revisionAfterRead) {
        const snapshot = { entries, goals, categories, revision: revisionAfterRead };
        cachedSnapshot = snapshot;
        return snapshot;
      }
    }
  })();

  try {
    return await snapshotPromise;
  } finally {
    snapshotPromise = null;
  }
}
