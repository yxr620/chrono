/**
 * ManagedGateway — Chrono 后端代理实现
 * Sync 由 plan 4 启用：通过 /auth/sts 拉取临时凭据，缓存至到期前 5 分钟。
 * AI 仍未实现（plan 6）。
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
import { useAuthStore } from '../../stores/authStore';
import { authService } from '../authService';

const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;

export class ManagedGateway implements PaidFeatureGateway {
  private cachedSync: SyncCredentials | null = null;
  private cachedSyncExpiresAt = 0;
  /** Auth token at the time cachedSync was issued; used to invalidate on user switch. */
  private cachedForToken: string | null = null;

  getStatus(id: PaidFeatureId): FeatureStatus {
    const mode = useFeatureModeStore.getState().modes[id];
    const auth = useAuthStore.getState();
    return {
      id,
      mode,
      configured: auth.isAuthenticated,
    };
  }

  async getSyncCredentials(): Promise<SyncCredentials> {
    const auth = useAuthStore.getState();
    if (!auth.isAuthenticated || !auth.user || !auth.token) {
      throw new Error('not_authenticated');
    }

    // Different user logged in since cache was filled → drop cache.
    if (this.cachedForToken !== auth.token) {
      this.cachedSync = null;
      this.cachedForToken = auth.token;
    }

    if (this.cachedSync && Date.now() < this.cachedSyncExpiresAt - REFRESH_BEFORE_EXPIRY_MS) {
      return this.cachedSync;
    }

    const r = await authService.getStsToken(auth.token);
    this.cachedSync = {
      region: r.region,
      bucket: r.bucket,
      accessKeyId: r.accessKeyId,
      accessKeySecret: r.accessKeySecret,
      securityToken: r.securityToken,
      expiration: r.expiration,
      userId: auth.user.id,
    };
    this.cachedSyncExpiresAt = new Date(r.expiration).getTime();
    return this.cachedSync;
  }

  async getAiClientConfig(): Promise<AiClientConfig> {
    throw new ManagedNotYetImplementedError('ai');
  }
}
