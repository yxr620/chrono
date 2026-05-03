import { register as registerRoute } from '../shared/router.js';
import { findUserById } from '../auth/users.js';
import { config } from '../config.js';

registerRoute('GET', /^\/me\/features$/, true, async (_req, _body, userId) => {
  const user = await findUserById(userId!);
  const e = user.email.toLowerCase();
  return {
    sync: config.allowedSyncEmails.map(s => s.toLowerCase()).includes(e),
    ai: config.allowedAiEmails.map(s => s.toLowerCase()).includes(e),
  };
});
