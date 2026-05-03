/**
 * ByoGateway — 用户自带凭据实现
 * 同步：从 syncConfig（localStorage）或 .env 读取 OSS 凭据
 * AI：从 aiStore 读取当前 provider 的 baseURL + apiKey + model
 */

import type {
  PaidFeatureGateway,
  PaidFeatureId,
  FeatureStatus,
  SyncCredentials,
  AiClientConfig,
} from './types';
import { FeatureNotConfiguredError } from './types';
import { getOSSConfig, isOSSConfigured } from '../oss';
import { useAIStore } from '../../stores/aiStore';
import { useFeatureModeStore } from '../../stores/featureModeStore';

export class ByoGateway implements PaidFeatureGateway {
  getStatus(id: PaidFeatureId): FeatureStatus {
    const mode = useFeatureModeStore.getState().modes[id];
    let configured = false;
    if (id === 'sync') configured = isOSSConfigured();
    if (id === 'ai') configured = useAIStore.getState().isConfigured();
    return { id, mode, configured };
  }

  async getSyncCredentials(): Promise<SyncCredentials> {
    if (!isOSSConfigured()) {
      throw new FeatureNotConfiguredError('sync', 'byo');
    }
    const c = getOSSConfig();
    return {
      region: c.region,
      bucket: c.bucket,
      accessKeyId: c.accessKeyId,
      accessKeySecret: c.accessKeySecret,
      userId: localStorage.getItem('userId') || 'default-user',
    };
  }

  async getAiClientConfig(): Promise<AiClientConfig> {
    const ai = useAIStore.getState();
    if (!ai.isConfigured()) {
      throw new FeatureNotConfiguredError('ai', 'byo');
    }
    return {
      baseURL: ai.config.baseURL,
      apiKey: ai.config.apiKey,
      model: ai.config.model,
    };
  }
}
