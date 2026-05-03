import StsModule, * as $Sts from '@alicloud/sts20150401';
import * as $OpenApi from '@alicloud/openapi-client';
import { register as registerRoute } from '../shared/router.js';
import { findUserById } from '../auth/users.js';
import { config } from '../config.js';
import { forbidden, internal } from '../shared/errors.js';

// `@alicloud/sts20150401` is published as CommonJS. Under module=ESNext +
// Node ESM interop, the default-import binding is the whole module.exports
// object (`{ default: StsClass, AssumeRoleRequest: ..., ... }`) rather than
// the class itself, so `new StsModule(...)` throws "is not a constructor".
// Reach through `.default` (with a fallback in case a future release fixes
// the export shape).
const StsCtor = ((StsModule as unknown as { default?: typeof StsModule }).default ?? StsModule) as typeof StsModule;
type StsInstance = InstanceType<typeof StsCtor>;

let stsClient: StsInstance | null = null;
function getStsClient(): StsInstance {
  if (!stsClient) {
    if (!config.stsRoleArn) throw internal('sts_not_configured');
    stsClient = new StsCtor(new $OpenApi.Config({
      accessKeyId: config.oss.accessKeyId,
      accessKeySecret: config.oss.accessKeySecret,
      endpoint: 'sts.aliyuncs.com',
    }));
  }
  return stsClient;
}

function buildSessionPolicy(userId: string): string {
  const bucket = config.oss.bucket;
  const userPrefix = `sync/${userId}/`;
  // Two statements:
  //   1. Object-level ops (Get/Put/Delete/AbortMpu) on objects under
  //      sync/{userId}/* — no Condition; the Resource ARN already
  //      restricts paths.
  //   2. ListObjects on the bucket itself, gated by an oss:Prefix
  //      Condition so the session can only list its own prefix.
  // Combining both in one statement (with the Condition applied to all
  // actions) breaks Put/Get because those operations do not provide an
  // `oss:Prefix` request-context key, so StringLike never matches and
  // OSS denies them with "Access denied by authorizer's policy".
  return JSON.stringify({
    Version: '1',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['oss:GetObject', 'oss:PutObject', 'oss:DeleteObject', 'oss:AbortMultipartUpload'],
        Resource: [`acs:oss:*:*:${bucket}/${userPrefix}*`],
      },
      {
        Effect: 'Allow',
        Action: ['oss:ListObjects'],
        Resource: [`acs:oss:*:*:${bucket}`],
        Condition: {
          StringLike: {
            'oss:Prefix': [userPrefix, `${userPrefix}*`],
          },
        },
      },
    ],
  });
}

registerRoute('POST', /^\/auth\/sts$/, true, async (_req, _body, userId) => {
  const user = await findUserById(userId!);
  const allowed = config.allowedSyncEmails.map(s => s.toLowerCase()).includes(user.email.toLowerCase());
  if (!allowed) throw forbidden('sync_not_enabled');

  const req = new $Sts.AssumeRoleRequest({
    roleArn: config.stsRoleArn!,
    roleSessionName: `${config.stsRoleSessionName}-${userId!.slice(0, 8)}`,
    durationSeconds: 3600,
    policy: buildSessionPolicy(userId!),
  });

  const resp = await getStsClient().assumeRole(req);
  const c = resp.body?.credentials;
  if (!c) throw internal('sts_empty_response');

  return {
    region: config.oss.region,
    bucket: config.oss.bucket,
    accessKeyId: c.accessKeyId!,
    accessKeySecret: c.accessKeySecret!,
    securityToken: c.securityToken!,
    expiration: c.expiration!,
  };
});
