export interface DeviceRecord {
  deviceId: string;
  lastSeenAt: string;       // ISO
  snapshotBytes: number;
  oplogCount: number;
  oplogBytes: number;
  stale: boolean;
}

export interface NamespaceStorage {
  namespace: string;
  bytes: number;
}

export interface UserDataNamespace {
  id: string;
  prefix: (userId: string) => string;
  listDevices?(userId: string): Promise<DeviceRecord[]>;
  storageBytes(userId: string): Promise<number>;
  purgeAll(userId: string): Promise<void>;
  purgeDevice?(userId: string, deviceId: string): Promise<void>;
}
