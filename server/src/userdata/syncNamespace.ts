import { ossAdmin } from '../shared/ossAdmin.js';
import { registerNamespace } from './registry.js';
import type { UserDataNamespace, DeviceRecord } from './types.js';

const STALE_DAYS = 90;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

const syncPrefix = (userId: string) => `sync/${userId}/`;

interface ListedObject { name: string; size: number; lastModified: string }

async function listAll(prefix: string): Promise<ListedObject[]> {
  const oss = ossAdmin();
  const results: ListedObject[] = [];
  let marker: string | undefined;
  do {
    const r: any = await oss.list({ prefix, marker, 'max-keys': 1000 }, {});
    if (r.objects) {
      results.push(
        ...r.objects.map((o: any) => ({
          name: o.name as string,
          size: o.size as number,
          lastModified: o.lastModified as string,
        })),
      );
    }
    marker = r.nextMarker;
  } while (marker);
  return results;
}

async function listDevices(userId: string): Promise<DeviceRecord[]> {
  const all = await listAll(syncPrefix(userId));
  const devices = new Map<string, {
    snapshotBytes: number; oplogCount: number; oplogBytes: number; lastSeen: number;
  }>();

  for (const obj of all) {
    // sync/{userId}/snapshots/{deviceId}.json
    // sync/{userId}/oplog/{deviceId}_{timestamp}.json
    const rel = obj.name.slice(syncPrefix(userId).length);
    let deviceId: string | null = null;
    let isSnapshot = false;
    if (rel.startsWith('snapshots/')) {
      deviceId = rel.slice('snapshots/'.length).replace(/\.json$/, '');
      isSnapshot = true;
    } else if (rel.startsWith('oplog/')) {
      const file = rel.slice('oplog/'.length);
      const idx = file.indexOf('_');
      if (idx > 0) deviceId = file.slice(0, idx);
    }
    if (!deviceId) continue;

    const cur = devices.get(deviceId) ?? { snapshotBytes: 0, oplogCount: 0, oplogBytes: 0, lastSeen: 0 };
    const ts = new Date(obj.lastModified).getTime();
    if (isSnapshot) cur.snapshotBytes += obj.size;
    else { cur.oplogCount += 1; cur.oplogBytes += obj.size; }
    if (ts > cur.lastSeen) cur.lastSeen = ts;
    devices.set(deviceId, cur);
  }

  const now = Date.now();
  return Array.from(devices.entries()).map(([deviceId, v]) => ({
    deviceId,
    lastSeenAt: new Date(v.lastSeen).toISOString(),
    snapshotBytes: v.snapshotBytes,
    oplogCount: v.oplogCount,
    oplogBytes: v.oplogBytes,
    stale: (now - v.lastSeen) > STALE_MS,
  }));
}

async function storageBytes(userId: string): Promise<number> {
  const all = await listAll(syncPrefix(userId));
  return all.reduce((sum, o) => sum + o.size, 0);
}

async function bulkDelete(keys: string[]) {
  if (keys.length === 0) return;
  const oss = ossAdmin();
  // OSS deleteMulti accepts up to 1000 keys per call
  for (let i = 0; i < keys.length; i += 1000) {
    await oss.deleteMulti(keys.slice(i, i + 1000), { quiet: true });
  }
}

async function purgeDevice(userId: string, deviceId: string): Promise<void> {
  const all = await listAll(syncPrefix(userId));
  const keys = all
    .map(o => o.name)
    .filter(name => {
      const rel = name.slice(syncPrefix(userId).length);
      return rel === `snapshots/${deviceId}.json`
          || rel.startsWith(`oplog/${deviceId}_`);
    });
  await bulkDelete(keys);
}

async function purgeAll(userId: string): Promise<void> {
  const all = await listAll(syncPrefix(userId));
  await bulkDelete(all.map(o => o.name));
}

export const syncNamespace: UserDataNamespace = {
  id: 'sync',
  prefix: syncPrefix,
  listDevices,
  storageBytes,
  purgeDevice,
  purgeAll,
};

registerNamespace(syncNamespace);
