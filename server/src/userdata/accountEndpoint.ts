import { register as registerRoute } from '../shared/router.js';
import { listNamespaces } from './registry.js';
import { findUserById, withUsersLocked } from '../auth/users.js';
import { badRequest } from '../shared/errors.js';

registerRoute('DELETE', /^\/me\/account$/, true, async (_req, body, userId) => {
  const user = await findUserById(userId!);
  if (typeof body?.confirm !== 'string' || body.confirm.toLowerCase() !== user.email.toLowerCase()) {
    throw badRequest('confirm_mismatch', '需要在请求体中提供与账号匹配的 email 作为确认');
  }

  for (const ns of listNamespaces()) {
    await ns.purgeAll(userId!);
  }

  await withUsersLocked(async (file) => {
    file.users = file.users.filter(u => u.id !== userId);
    file.version += 1;
    return file;
  });

  return { ok: true };
});
