import { register as registerRoute } from '../shared/router.js';
import { findUserById } from '../auth/users.js';
import { config } from '../config.js';
import { featureFlagsForEmail } from './featureFlags.js';

registerRoute('GET', /^\/me\/features$/, true, async (_req, _body, userId) => {
  const user = await findUserById(userId!);
  return featureFlagsForEmail(user.email, {
    allowedSyncEmails: config.allowedSyncEmails,
    allowedAiEmails: config.allowedAiEmails,
    aiModel: config.ai.model,
  });
});
