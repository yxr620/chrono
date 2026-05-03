function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}
function optional(name: string): string | undefined {
  return process.env[name];
}

export const config = {
  jwtSecret: required('JWT_SECRET'),
  oss: {
    region: required('OSS_REGION'),
    bucket: required('OSS_BUCKET'),
    accessKeyId: required('OSS_ACCESS_KEY_ID'),
    accessKeySecret: required('OSS_ACCESS_KEY_SECRET'),
  },
  // STS used in plan 4
  stsRoleArn: optional('STS_ROLE_ARN'),
  stsRoleSessionName: optional('STS_ROLE_SESSION_NAME') ?? 'chrono',
  // AI used in plan 6
  ai: {
    apiKey: optional('AI_API_KEY'),
    baseURL: optional('AI_BASE_URL') ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: optional('AI_MODEL') ?? 'qwen3.6-max-preview',
  },
  allowedSyncEmails: (optional('ALLOWED_SYNC_EMAILS') ?? '').split(',').map(s => s.trim()).filter(Boolean),
  allowedAiEmails: (optional('ALLOWED_AI_EMAILS') ?? '').split(',').map(s => s.trim()).filter(Boolean),
  corsAllowedOrigins: (optional('CORS_ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean),
};
