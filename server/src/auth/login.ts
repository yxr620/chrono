import bcrypt from 'bcryptjs';
import { register as registerRoute } from '../index.js';
import { findUserByEmail } from './users.js';
import { signJwt } from './jwt.js';
import { badRequest, unauthorized } from '../shared/errors.js';

registerRoute('POST', /^\/auth\/login$/, false, async (_req, body) => {
  const { email, password } = body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') throw badRequest('invalid_body');

  const user = await findUserByEmail(email);
  if (!user) throw unauthorized('invalid_credentials');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw unauthorized('invalid_credentials');

  const token = signJwt(user.id, user.email);
  return { token, user: { id: user.id, email: user.email } };
});
