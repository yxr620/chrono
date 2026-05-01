/**
 * CompositeGateway — 按 featureModeStore 路由到 BYO 或 Managed 实现
 */

import type {
  PaidFeatureGateway,
  PaidFeatureId,
  FeatureStatus,
  SyncCredentials,
  AiClientConfig,
} from './types';
import { FeatureNotConfiguredError } from './types';
import { ByoGateway } from './byoGateway';
import { ManagedGateway } from './managedGateway';
import { useFeatureModeStore } from '../../stores/featureModeStore';

export class CompositeGateway implements PaidFeatureGateway {
  private byo = new ByoGateway();
  private managed = new ManagedGateway();

  private routeFor(id: PaidFeatureId): PaidFeatureGateway {
    const mode = useFeatureModeStore.getState().modes[id];
    if (mode === 'byo') return this.byo;
    if (mode === 'managed') return this.managed;
    throw new FeatureNotConfiguredError(id, mode);
  }

  getStatus(id: PaidFeatureId): FeatureStatus {
    const mode = useFeatureModeStore.getState().modes[id];
    if (mode === 'disabled') {
      return { id, mode, configured: false };
    }
    return this.routeFor(id).getStatus(id);
  }

  async getSyncCredentials(): Promise<SyncCredentials> {
    return this.routeFor('sync').getSyncCredentials();
  }

  async getAiClientConfig(): Promise<AiClientConfig> {
    return this.routeFor('ai').getAiClientConfig();
  }
}
