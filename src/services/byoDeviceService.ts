/**
 * BYO 设备数据层：完全客户端实现，基于 OSS list/delete。
 * 输出 DeviceRecord[] / StorageInfo，与 managed 的 userDataService 同形。
 *
 * Pure aggregation functions (parseDeviceId*, aggregateDevices) carry no side
 * effects and no runtime imports — safe to import in Node.js unit tests.
 * The async byoDeviceService methods use dynamic imports so that the OSS /
 * gateway / store chain is only resolved at call time (browser only).
 */
import type { OSSObject } from './oss';
import type { DeviceRecord, StorageInfo } from './userDataService';

const STALE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

export function parseDeviceIdFromSnapshotName(name: string): string | null {
  // 期望 .../snapshots/{deviceId}.json，deviceId 非空
  const file = name.split('/').pop() ?? '';
  if (!file.endsWith('.json')) return null;
  const stem = file.slice(0, -'.json'.length);
  return stem.length > 0 ? stem : null;
}

export function parseDeviceIdFromOplogName(name: string): string | null {
  // 期望 .../oplog/{deviceId}_{timestamp}.json，timestamp 为纯数字
  const file = name.split('/').pop() ?? '';
  const match = file.match(/^(.+)_(\d+)\.json$/);
  return match ? match[1] : null;
}

interface DeviceAccumulator {
  snapshotBytes: number;
  oplogCount: number;
  oplogBytes: number;
  lastSeenAtMs: number;
}

export function aggregateDevices(
  snapshots: OSSObject[],
  oplogs: OSSObject[],
  nowMs: number,
  namespace: string,
): DeviceRecord[] {
  const acc = new Map<string, DeviceAccumulator>();
  const touch = (id: string): DeviceAccumulator => {
    let row = acc.get(id);
    if (!row) {
      row = { snapshotBytes: 0, oplogCount: 0, oplogBytes: 0, lastSeenAtMs: 0 };
      acc.set(id, row);
    }
    return row;
  };

  for (const obj of snapshots) {
    const id = parseDeviceIdFromSnapshotName(obj.name);
    if (!id) {
      console.warn('[byoDeviceService] unparseable snapshot name:', obj.name);
      continue;
    }
    const row = touch(id);
    row.snapshotBytes = obj.size;
    const ts = new Date(obj.lastModified).getTime();
    if (ts > row.lastSeenAtMs) row.lastSeenAtMs = ts;
  }

  for (const obj of oplogs) {
    const id = parseDeviceIdFromOplogName(obj.name);
    if (!id) {
      console.warn('[byoDeviceService] unparseable oplog name:', obj.name);
      continue;
    }
    const row = touch(id);
    row.oplogCount += 1;
    row.oplogBytes += obj.size;
    const ts = new Date(obj.lastModified).getTime();
    if (ts > row.lastSeenAtMs) row.lastSeenAtMs = ts;
  }

  const devices: DeviceRecord[] = [];
  for (const [deviceId, row] of acc) {
    devices.push({
      deviceId,
      namespace,
      lastSeenAt: new Date(row.lastSeenAtMs).toISOString(),
      snapshotBytes: row.snapshotBytes,
      oplogCount: row.oplogCount,
      oplogBytes: row.oplogBytes,
      stale: nowMs - row.lastSeenAtMs > STALE_THRESHOLD_MS,
    });
  }

  devices.sort((a, b) =>
    new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
  );
  return devices;
}

export const byoDeviceService = {
  listDevices: async (): Promise<{ devices: DeviceRecord[] }> => {
    const { getSyncUserId, listAllSnapshotObjects, listAllOplogObjects } =
      await import('./oss');
    const [userId, snapshots, oplogs] = await Promise.all([
      getSyncUserId(),
      listAllSnapshotObjects(),
      listAllOplogObjects(),
    ]);
    const devices = aggregateDevices(snapshots, oplogs, Date.now(), `sync/${userId}`);
    return { devices };
  },

  removeDevice: async (deviceId: string): Promise<{ ok: true }> => {
    const { listAllSnapshotObjects, listAllOplogObjects, deleteOSSFiles } =
      await import('./oss');
    const [snapshots, oplogs] = await Promise.all([
      listAllSnapshotObjects(),
      listAllOplogObjects(),
    ]);
    const names: string[] = [];
    for (const obj of snapshots) {
      if (parseDeviceIdFromSnapshotName(obj.name) === deviceId) names.push(obj.name);
    }
    for (const obj of oplogs) {
      if (parseDeviceIdFromOplogName(obj.name) === deviceId) names.push(obj.name);
    }
    if (names.length === 0) return { ok: true };
    await deleteOSSFiles(names);
    return { ok: true };
  },

  getStorage: async (): Promise<StorageInfo> => {
    const { getSyncUserId, listAllObjects } = await import('./oss');
    const userId = await getSyncUserId();
    const all = await listAllObjects(`sync/${userId}/`);
    let snapshotsBytes = 0;
    let oplogBytes = 0;
    // Only snapshots/ and oplog/ live under sync/{userId}/; if other files
    // ever exist there they will not be counted toward totalBytes.
    for (const obj of all) {
      if (obj.name.includes('/snapshots/')) snapshotsBytes += obj.size;
      else if (obj.name.includes('/oplog/')) oplogBytes += obj.size;
    }
    return {
      totalBytes: snapshotsBytes + oplogBytes,
      breakdown: [
        { namespace: 'snapshots', bytes: snapshotsBytes },
        { namespace: 'oplog', bytes: oplogBytes },
      ],
    };
  },
};
