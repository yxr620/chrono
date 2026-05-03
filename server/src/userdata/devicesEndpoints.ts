import { register as registerRoute } from '../shared/router.js';
import { listNamespaces } from './registry.js';
import { badRequest } from '../shared/errors.js';

registerRoute('GET', /^\/me\/devices$/, true, async (_req, _body, userId) => {
  const all: Array<Record<string, unknown>> = [];
  for (const ns of listNamespaces()) {
    if (!ns.listDevices) continue;
    const devices = await ns.listDevices(userId!);
    all.push(...devices.map(d => ({ ...d, namespace: ns.id })));
  }
  return { devices: all };
});

registerRoute('DELETE', /^\/me\/devices\/[^/]+$/, true, async (req, _body, userId) => {
  const m = req.path.match(/^\/me\/devices\/([^/]+)$/);
  const deviceId = m?.[1];
  if (!deviceId) throw badRequest('missing_device_id');

  for (const ns of listNamespaces()) {
    if (ns.purgeDevice) await ns.purgeDevice(userId!, deviceId);
  }
  return { ok: true, deviceId };
});
