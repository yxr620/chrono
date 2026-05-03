import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useFeatureModeStore } from '../../stores/featureModeStore';
import { authService } from '../../services/authService';
import { clearOSSConfig } from '../../services/syncConfig';
import { useAIStore } from '../../stores/aiStore';
import { SignInPage } from '../Auth/SignInPage';
import './MigrationPrompt.css';

const SEEN_KEY = 'chrono_migration_seen';

interface Props { onClose: () => void }

/** Clear apiKey on every provider in the AI store + localStorage. */
function scrubAllAiKeys() {
  const state = useAIStore.getState();
  const cleared: Record<string, { apiKey: string; model: string; baseURL: string }> = {};
  for (const [pid, pc] of Object.entries(state.providerConfigs)) {
    cleared[pid] = { ...pc, apiKey: '' };
  }
  // Persist cleared providers, then refresh active config via updateConfig.
  localStorage.setItem('ai-config', JSON.stringify({
    activeProviderId: state.config.providerId,
    providers: cleared,
    customModels: state.customModels,
  }));
  state.updateConfig({ apiKey: '' });
}

export const MigrationPrompt: React.FC<Props> = ({ onClose }) => {
  const auth = useAuthStore();
  const setMode = useFeatureModeStore((s) => s.setMode);
  const [showSignIn, setShowSignIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dismiss = () => {
    localStorage.setItem(SEEN_KEY, 'true');
    onClose();
  };

  const switchToManaged = async () => {
    if (!auth.isAuthenticated || !auth.token) {
      setShowSignIn(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const flags = await authService.getFeatureFlags(auth.token);
      if (flags.sync) {
        setMode('sync', 'managed');
        clearOSSConfig();
      }
      if (flags.ai) {
        setMode('ai', 'managed');
        scrubAllAiKeys();
      }
      if (!flags.sync && !flags.ai) {
        setError('您的账号尚未在 Chrono 托管服务白名单中。');
        setBusy(false);
        return;
      }
      localStorage.setItem(SEEN_KEY, 'true');
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'migration_failed';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="migration-overlay" onClick={dismiss}>
      <div className="migration-modal" onClick={(e) => e.stopPropagation()}>
        <h3>欢迎使用 Chrono 托管服务</h3>
        <p>
          检测到您配置了 BYO 凭据。Chrono 托管模式可以让您不再需要保存敏感的 API Key
          在浏览器本地——服务端代理付费 API。本地优先体验保持不变，您可以随时切回 BYO。
        </p>
        {error && <p className="migration-error">{error}</p>}
        <div className="migration-actions">
          <button onClick={dismiss} disabled={busy}>暂不切换</button>
          <button className="migration-primary" onClick={switchToManaged} disabled={busy}>
            {busy ? '切换中...' : '迁移到托管模式'}
          </button>
        </div>
        {showSignIn && (
          <SignInPage onClose={() => setShowSignIn(false)} onSuccess={() => { void switchToManaged(); }} />
        )}
      </div>
    </div>
  );
};

export const shouldShowMigration = (): boolean => {
  if (!import.meta.env.VITE_AUTH_API_URL) return false;
  if (localStorage.getItem(SEEN_KEY) === 'true') return false;
  const ossSaved = localStorage.getItem('ossConfig');
  const aiSaved = localStorage.getItem('ai-config');
  if (!ossSaved && !aiSaved) return false;
  // Only prompt if the user actually has a non-empty BYO secret somewhere.
  try {
    if (ossSaved) {
      const oss = JSON.parse(ossSaved);
      if (oss?.accessKeyId && oss?.accessKeySecret) return true;
    }
  } catch { /* ignore */ }
  try {
    if (aiSaved) {
      const ai = JSON.parse(aiSaved);
      const providers = ai?.providers ?? {};
      for (const pc of Object.values(providers) as Array<{ apiKey?: string }>) {
        if (pc?.apiKey) return true;
      }
    }
  } catch { /* ignore */ }
  return false;
};
