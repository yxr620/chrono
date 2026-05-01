/**
 * ManagedGateway — Chrono 后端代理实现
 * Plan 1 仅占位，所有方法抛出 ManagedNotYetImplementedError。
 * 实际实现在 plan 3（managed sync）和 plan 5（managed AI）中加入。
 */

import type {
  PaidFeatureGateway,
  PaidFeatureId,
  FeatureStatus,
  SyncCredentials,
  AiClientConfig,
} from './types';
import { ManagedNotYetImplementedError } from './types';
import { useFeatureModeStore } from '../../stores/featureModeStore';

export class ManagedGateway implements PaidFeatureGateway {
  getStatus(id: PaidFeatureId): FeatureStatus {
    const mode = useFeatureModeStore.getState().modes[id];
    return {
      id,
      mode,
      configured: false,
      lastError: { code: 'not_implemented', message: 'managed mode not built yet' },
    };
  }

  async getSyncCredentials(): Promise<SyncCredentials> {
    throw new ManagedNotYetImplementedError('sync');
  }

  async getAiClientConfig(): Promise<AiClientConfig> {
    throw new ManagedNotYetImplementedError('ai');
  }
}
