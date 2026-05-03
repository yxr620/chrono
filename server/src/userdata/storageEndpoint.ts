import { register as registerRoute } from '../shared/router.js';
import { listNamespaces } from './registry.js';

registerRoute('GET', /^\/me\/storage$/, true, async (_req, _body, userId) => {
  const breakdown: Array<{ namespace: string; bytes: number }> = [];
  let total = 0;
  for (const ns of listNamespaces()) {
    const bytes = await ns.storageBytes(userId!);
    breakdown.push({ namespace: ns.id, bytes });
    total += bytes;
  }
  return { totalBytes: total, breakdown };
});
