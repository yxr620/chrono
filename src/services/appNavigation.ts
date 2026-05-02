import type { DesktopTab } from '../components/Desktop/desktopNavigation';

export const APP_NAVIGATE_EVENT = 'chrono:navigate';

export const navigateToTab = (tab: DesktopTab): void => {
  window.dispatchEvent(new CustomEvent<DesktopTab>(APP_NAVIGATE_EVENT, { detail: tab }));
};