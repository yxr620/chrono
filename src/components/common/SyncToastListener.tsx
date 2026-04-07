import { useEffect } from 'react';
import { addSyncToastListener } from '../../services/syncToast';
import { useAppToast } from '../../hooks/useAppToast';

export const SyncToastListener: React.FC = () => {
  const [present] = useAppToast();

  useEffect(() => {
    const cleanup = addSyncToastListener((payload) => {
      present({
        message: payload.message,
        color: payload.color,
        duration: payload.duration ?? 1500,
        position: 'top'
      });
    });

    return cleanup;
  }, [present]);

  return null;
};
