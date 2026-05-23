import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateDevices,
  parseDeviceIdFromOplogName,
  parseDeviceIdFromSnapshotName,
} from '../src/services/byoDeviceService';

const day = 86_400_000;

test('parseDeviceIdFromSnapshotName extracts device id', () => {
  assert.equal(
    parseDeviceIdFromSnapshotName('sync/u1/snapshots/dev-aaa.json'),
    'dev-aaa',
  );
});

test('parseDeviceIdFromSnapshotName returns null on bad shape', () => {
  assert.equal(parseDeviceIdFromSnapshotName('sync/u1/snapshots/.json'), null);
  assert.equal(parseDeviceIdFromSnapshotName('sync/u1/snapshots/no-dot'), null);
});

test('parseDeviceIdFromOplogName extracts device id from {deviceId}_{ts}.json', () => {
  assert.equal(
    parseDeviceIdFromOplogName('sync/u1/oplog/dev-bbb_1700000000000.json'),
    'dev-bbb',
  );
});

test('parseDeviceIdFromOplogName tolerates underscores in device id', () => {
  // device ids in this repo are UUIDs (no underscore), but be defensive
  assert.equal(
    parseDeviceIdFromOplogName('sync/u1/oplog/dev_with_underscores_1700.json'),
    'dev_with_underscores',
  );
});

test('parseDeviceIdFromOplogName returns null when no trailing timestamp', () => {
  assert.equal(parseDeviceIdFromOplogName('sync/u1/oplog/dev-bbb.json'), null);
});

test('aggregateDevices groups snapshots + oplogs by deviceId', () => {
  const now = new Date('2026-05-24T00:00:00Z').getTime();
  const namespace = 'sync/u1';
  const snapshots = [
    { name: 'sync/u1/snapshots/dev-A.json', size: 1000, lastModified: new Date(now - day).toISOString() },
    { name: 'sync/u1/snapshots/dev-B.json', size: 2000, lastModified: new Date(now - 100 * day).toISOString() },
  ];
  const oplogs = [
    { name: 'sync/u1/oplog/dev-A_1.json', size: 100, lastModified: new Date(now - 2 * day).toISOString() },
    { name: 'sync/u1/oplog/dev-A_2.json', size: 200, lastModified: new Date(now - 1 * day).toISOString() },
    { name: 'sync/u1/oplog/dev-C_1.json', size: 50,  lastModified: new Date(now - 5 * day).toISOString() },
  ];

  const devices = aggregateDevices(snapshots, oplogs, now, namespace);

  // 3 distinct device ids: A, B, C
  assert.equal(devices.length, 3);
  const byId = new Map(devices.map((d) => [d.deviceId, d]));

  const a = byId.get('dev-A')!;
  assert.equal(a.snapshotBytes, 1000);
  assert.equal(a.oplogCount, 2);
  assert.equal(a.oplogBytes, 300);
  assert.equal(a.namespace, 'sync/u1');
  assert.equal(a.stale, false);
  // lastSeenAt = max(snapshot lastModified, latest oplog lastModified) → -1 day
  assert.equal(new Date(a.lastSeenAt).getTime(), now - day);

  const b = byId.get('dev-B')!;
  assert.equal(b.snapshotBytes, 2000);
  assert.equal(b.oplogCount, 0);
  assert.equal(b.oplogBytes, 0);
  assert.equal(b.stale, true);  // 100 days > 90

  const c = byId.get('dev-C')!;
  assert.equal(c.snapshotBytes, 0);  // oplog without snapshot
  assert.equal(c.oplogCount, 1);
});

test('aggregateDevices sorts by lastSeenAt descending', () => {
  const now = Date.now();
  const namespace = 'sync/u1';
  const snapshots = [
    { name: 'sync/u1/snapshots/old.json',    size: 1, lastModified: new Date(now - 10 * day).toISOString() },
    { name: 'sync/u1/snapshots/recent.json', size: 1, lastModified: new Date(now - 1  * day).toISOString() },
  ];
  const devices = aggregateDevices(snapshots, [], now, namespace);
  assert.equal(devices[0].deviceId, 'recent');
  assert.equal(devices[1].deviceId, 'old');
});

test('aggregateDevices skips files with unparseable names', () => {
  const now = Date.now();
  const snapshots = [
    { name: 'sync/u1/snapshots/dev-A.json', size: 1, lastModified: new Date(now).toISOString() },
    { name: 'sync/u1/snapshots/garbage',    size: 1, lastModified: new Date(now).toISOString() },
  ];
  const devices = aggregateDevices(snapshots, [], now, 'sync/u1');
  assert.equal(devices.length, 1);
  assert.equal(devices[0].deviceId, 'dev-A');
});

test('aggregateDevices returns empty for empty inputs', () => {
  assert.deepEqual(aggregateDevices([], [], Date.now(), 'sync/u1'), []);
});

test('aggregateDevices last-wins on duplicate snapshot for same device', () => {
  const now = Date.now();
  const snapshots = [
    { name: 'sync/u1/snapshots/dev-A.json', size: 100, lastModified: new Date(now - 2 * 86_400_000).toISOString() },
    { name: 'sync/u1/snapshots/dev-A.json', size: 999, lastModified: new Date(now - 1 * 86_400_000).toISOString() },
  ];
  const devices = aggregateDevices(snapshots, [], now, 'sync/u1');
  assert.equal(devices.length, 1);
  // last-iteration snapshot wins for snapshotBytes (current implementation contract)
  assert.equal(devices[0].snapshotBytes, 999);
});
