import { useEffect, useState } from 'react';
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/authStore';

export function useManagedAiModel(active: boolean): string | null {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const token = useAuthStore((state) => state.token);
  const [model, setModel] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !isAuthenticated || !token || !import.meta.env.VITE_AUTH_API_URL) {
      setModel(null);
      return;
    }

    let cancelled = false;
    void authService.getFeatureFlags(token)
      .then((flags) => {
        if (!cancelled) {
          setModel(flags.aiModel?.trim() || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setModel(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [active, isAuthenticated, token]);

  return model;
}
