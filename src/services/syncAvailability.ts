import { gateway } from './gateway';
import { isAutoSyncEnabled } from './syncConfig';
import type { FeatureMode } from './gateway/types';

export interface SyncAvailability {
  mode: FeatureMode;
  configured: boolean;
  reason: string | null;
}

export function getSyncAvailability(): SyncAvailability {
  const status = gateway.getStatus('sync');

  if (status.mode === 'disabled') {
    return {
      mode: status.mode,
      configured: false,
      reason: '同步功能已关闭',
    };
  }

  if (status.configured) {
    return {
      mode: status.mode,
      configured: true,
      reason: null,
    };
  }

  return {
    mode: status.mode,
    configured: false,
    reason: status.mode === 'managed'
      ? '托管同步未就绪，请先登录 Chrono 账号'
      : 'BYO 同步未就绪，请先配置 OSS 凭据',
  };
}

export function isSyncConfigured(): boolean {
  return getSyncAvailability().configured;
}

export function isSyncReady(): boolean {
  return isAutoSyncEnabled() && isSyncConfigured();
}

export function getSyncUnavailableReason(): string {
  return getSyncAvailability().reason ?? '';
}
