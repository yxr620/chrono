export interface FeatureFlagConfig {
  allowedSyncEmails: string[];
  allowedAiEmails: string[];
  aiModel?: string;
}

export interface FeatureFlagsResponse {
  sync: boolean;
  ai: boolean;
  aiModel?: string;
}

function includesEmail(emails: string[], email: string): boolean {
  const normalized = email.toLowerCase();
  return emails.map(s => s.toLowerCase()).includes(normalized);
}

export function featureFlagsForEmail(email: string, featureConfig: FeatureFlagConfig): FeatureFlagsResponse {
  const flags: FeatureFlagsResponse = {
    sync: includesEmail(featureConfig.allowedSyncEmails, email),
    ai: includesEmail(featureConfig.allowedAiEmails, email),
  };

  const aiModel = featureConfig.aiModel?.trim();
  if (aiModel) {
    flags.aiModel = aiModel;
  }

  return flags;
}
