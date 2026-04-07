import { useCallback } from 'react';
import { useIonToast } from '@ionic/react';
import type { OverlayEventDetail, ToastOptions } from '@ionic/core/components';
import { decorateToastOptions } from '../utils/appToast';

interface AppHookOverlayOptions {
  onDidDismiss?: (event: CustomEvent<OverlayEventDetail>) => void;
  onDidPresent?: (event: CustomEvent<OverlayEventDetail>) => void;
  onWillDismiss?: (event: CustomEvent<OverlayEventDetail>) => void;
  onWillPresent?: (event: CustomEvent<OverlayEventDetail>) => void;
}

type AppToastOptions = ToastOptions & AppHookOverlayOptions;

interface AppToastPresenter {
  (message: string, duration?: number): Promise<void>;
  (options: AppToastOptions): Promise<void>;
}

export const useAppToast = () => {
  const [present, dismiss] = useIonToast();

  const presentAppToast = useCallback<AppToastPresenter>(((messageOrOptions: string | AppToastOptions, duration?: number) => {
    if (typeof messageOrOptions === 'string') {
      return present(messageOrOptions, duration);
    }

    return present(decorateToastOptions(messageOrOptions));
  }) as AppToastPresenter, [present]);

  return [presentAppToast, dismiss] as const;
};