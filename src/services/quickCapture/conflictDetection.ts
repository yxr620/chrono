/**
 * 检测候选时间段与已有 TimeEntry 的重叠
 * 纯函数，不依赖 store 或 db
 */

import type { TimeEntry } from '../db';

export interface ConflictInfo {
  existingEntryId: string;
  overlapStart: Date;
  overlapEnd: Date;
  existingActivity: string;
}

export function detectConflicts(
  candidateStart: Date,
  candidateEnd: Date,
  existing: TimeEntry[],
): ConflictInfo[] {
  const cs = candidateStart.getTime();
  const ce = candidateEnd.getTime();

  const out: ConflictInfo[] = [];
  for (const e of existing) {
    if (e.deleted) continue;
    if (!e.endTime) continue;
    if (!e.id) continue;

    const es = new Date(e.startTime).getTime();
    const ee = new Date(e.endTime).getTime();
    const overlapStart = Math.max(cs, es);
    const overlapEnd = Math.min(ce, ee);
    if (overlapStart >= overlapEnd) continue;

    out.push({
      existingEntryId: e.id,
      overlapStart: new Date(overlapStart),
      overlapEnd: new Date(overlapEnd),
      existingActivity: e.activity,
    });
  }
  return out;
}
