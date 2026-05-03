import bcrypt from 'bcryptjs';
import { register as registerRoute } from '../shared/router.js';
import { withUsersLocked, findUserByEmail } from './users.js';
import { signJwt } from './jwt.js';
import { badRequest, conflict } from '../shared/errors.js';
import crypto from 'node:crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

registerRoute('POST', /^\/auth\/register$/, false, async (_req, body) => {
  const { email, password } = body ?? {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) throw badRequest('invalid_email');
  if (typeof password !== 'string' || password.length < 8) throw badRequest('weak_password', 'password must be ≥ 8 chars');

  const existing = await findUserByEmail(email);
  if (existing) throw conflict('email_taken');

  const passwordHash = await bcrypt.hash(password, 12);
  const id = crypto.randomUUID();
  const created = await withUsersLocked(async (file) => {
    if (file.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw conflict('email_taken');
    }
    file.users.push({ id, email, passwordHash, createdAt: new Date().toISOString() });
    file.version += 1;
    return file;
  });
  void created;

  const token = signJwt(id, email);
  return { token, user: { id, email } };
});
