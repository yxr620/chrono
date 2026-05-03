import { ossAdmin } from '../shared/ossAdmin.js';
import { conflict, notFound } from '../shared/errors.js';

const USERS_KEY = 'admin/users.json';
const LOCK_KEY = 'admin/users.lock';

export interface UserRecord {
  id: string;          // uuid
  email: string;
  passwordHash: string;
  createdAt: string;   // ISO
}

interface UsersFile {
  users: UserRecord[];
  version: number;
}

const EMPTY: UsersFile = { users: [], version: 0 };

async function readUsers(): Promise<UsersFile> {
  try {
    const oss = ossAdmin();
    const r = await oss.get(USERS_KEY);
    return JSON.parse(r.content.toString('utf-8')) as UsersFile;
  } catch (err: any) {
    if (err.code === 'NoSuchKey') return EMPTY;
    throw err;
  }
}

async function writeUsers(file: UsersFile): Promise<void> {
  const oss = ossAdmin();
  await oss.put(USERS_KEY, Buffer.from(JSON.stringify(file, null, 2), 'utf-8'), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function acquireLock(): Promise<void> {
  const oss = ossAdmin();
  try {
    await oss.put(LOCK_KEY, Buffer.from(String(Date.now())), {
      headers: { 'x-oss-forbid-overwrite': 'true' },
    });
  } catch (err: any) {
    if (err.status === 409 || err.code === 'FileAlreadyExists') {
      throw conflict('users_locked', '另一个写入正在进行，请重试');
    }
    throw err;
  }
}

async function releaseLock(): Promise<void> {
  try { await ossAdmin().delete(LOCK_KEY); } catch { /* best-effort */ }
}

export async function withUsersLocked<T>(fn: (file: UsersFile) => Promise<T | UsersFile>): Promise<T> {
  await acquireLock();
  try {
    const file = await readUsers();
    const result = await fn(file);
    if ((result as UsersFile)?.users) {
      await writeUsers(result as UsersFile);
    }
    return result as T;
  } finally {
    await releaseLock();
  }
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const file = await readUsers();
  return file.users.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function findUserById(id: string): Promise<UserRecord> {
  const file = await readUsers();
  const u = file.users.find(u => u.id === id);
  if (!u) throw notFound('user_not_found');
  return u;
}
