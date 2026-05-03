/**
 * PaidFeatureGateway 类型定义
 * 所有付费功能（同步、AI）通过统一抽象访问凭据/客户端，
 * 由 BYO（用户自带）或 Managed（Chrono 后端代理）实现。
 */

export type PaidFeatureId = 'sync' | 'ai';
export type FeatureMode = 'disabled' | 'byo' | 'managed';

export interface FeatureStatus {
  id: PaidFeatureId;
  mode: FeatureMode;
  /** BYO: 凭据是否齐全；Managed: 是否登录且在白名单 */
  configured: boolean;
  lastError?: { code: string; message: string };
}

export interface SyncCredentials {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  /**
   * 用户 ID — 决定 OSS 路径前缀 sync/{userId}/...
   * BYO: localStorage.userId 或 'default-user'。
   * Managed: 必须等于 JWT 里的 user id（STS session policy 会强制此前缀）。
   */
  userId: string;
  /** Managed 模式下由 STS 返回 */
  securityToken?: string;
  /** ISO 时间戳，仅 Managed 模式 */
  expiration?: string;
}

export interface AiClientConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface PaidFeatureGateway {
  getStatus(id: PaidFeatureId): FeatureStatus;
  getSyncCredentials(): Promise<SyncCredentials>;
  getAiClientConfig(): Promise<AiClientConfig>;
}

export class FeatureNotConfiguredError extends Error {
  featureId: PaidFeatureId;
  mode: FeatureMode;

  constructor(featureId: PaidFeatureId, mode: FeatureMode) {
    super(`Feature "${featureId}" is not configured (mode: ${mode})`);
    this.name = 'FeatureNotConfiguredError';
    this.featureId = featureId;
    this.mode = mode;
  }
}

export class ManagedNotYetImplementedError extends Error {
  featureId: PaidFeatureId;

  constructor(featureId: PaidFeatureId) {
    super(`Managed mode for "${featureId}" is not yet implemented`);
    this.name = 'ManagedNotYetImplementedError';
    this.featureId = featureId;
  }
}
