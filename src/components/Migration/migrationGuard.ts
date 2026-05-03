/**
 * Decides whether to show the one-time managed-migration prompt.
 * Returns true only when:
 *   - VITE_AUTH_API_URL is configured (managed mode is offered at all)
 *   - the user hasn't already acted on or dismissed the prompt
 *   - a non-empty BYO secret actually exists somewhere in localStorage
 */
const SEEN_KEY = 'chrono_migration_seen';

export const shouldShowMigration = (): boolean => {
  if (!import.meta.env.VITE_AUTH_API_URL) return false;
  if (localStorage.getItem(SEEN_KEY) === 'true') return false;
  const ossSaved = localStorage.getItem('ossConfig');
  const aiSaved = localStorage.getItem('ai-config');
  if (!ossSaved && !aiSaved) return false;
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

export const MIGRATION_SEEN_KEY = SEEN_KEY;
