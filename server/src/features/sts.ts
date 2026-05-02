import Sts, * as $Sts from '@alicloud/sts20150401';
import * as $OpenApi from '@alicloud/openapi-client';
import { register as registerRoute } from '../shared/router.js';
import { findUserById } from '../auth/users.js';
import { config } from '../config.js';
import { forbidden, internal } from '../shared/errors.js';

let stsClient: Sts | null = null;
function getStsClient(): Sts {
  if (!stsClient) {
    if (!config.stsRoleArn) throw internal('sts_not_configured');
    stsClient = new Sts(new $OpenApi.Config({
      accessKeyId: config.oss.accessKeyId,
      accessKeySecret: config.oss.accessKeySecret,
      endpoint: 'sts.aliyuncs.com',
    }));
  }
  return stsClient;
}

function buildSessionPolicy(userId: string): string {
  return JSON.stringify({
    Version: '1',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['oss:GetObject', 'oss:PutObject', 'oss:DeleteObject', 'oss:ListObjects', 'oss:AbortMultipartUpload'],
        Resource: [
          `acs:oss:*:*:${config.oss.bucket}`,
          `acs:oss:*:*:${config.oss.bucket}/sync/${userId}/*`,
        ],
        Condition: {
          StringLike: {
            'oss:Prefix': [`sync/${userId}/`, `sync/${userId}/*`],
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
