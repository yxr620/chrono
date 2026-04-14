import { useEffect, useMemo, useState } from 'react';
import { DesktopNavDrawer } from './DesktopNavDrawer';
import { DesktopNavRail } from './DesktopNavRail';
import { getDesktopShellTheme } from './desktopNavigation';
import type { DesktopPrimaryTab, DesktopTab } from './desktopNavigation';
import './DesktopSidebar.css';

const PINNED_STORAGE_KEY = 'chrono.desktop-nav-pinned';
const PINNED_MIN_WIDTH = 1280;

interface DesktopSidebarProps {
  activeTab: DesktopTab;
  onTabChange: (tab: DesktopTab) => void;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({ activeTab, onTabChange }) => {
  const [canPin, setCanPin] = useState(() => window.innerWidth >= PINNED_MIN_WIDTH);
  const [isPinned, setIsPinned] = useState(
    () => window.innerWidth >= PINNED_MIN_WIDTH && window.localStorage.getItem(PINNED_STORAGE_KEY) === 'true',
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(
    () => window.innerWidth >= PINNED_MIN_WIDTH && window.localStorage.getItem(PINNED_STORAGE_KEY) === 'true',
  );
  const themeKey = useMemo(() => getDesktopShellTheme(activeTab), [activeTab]);

  useEffect(() => {
    const handleResize = () => {
      const nextCanPin = window.innerWidth >= PINNED_MIN_WIDTH;
      setCanPin(nextCanPin);

      if (!nextCanPin) {
        setIsPinned(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!canPin) {
      window.localStorage.removeItem(PINNED_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(PINNED_STORAGE_KEY, String(isPinned));
  }, [canPin, isPinned]);

  useEffect(() => {
    if (!isPinned) {
      setIsDrawerOpen(false);
    }
  }, [activeTab, isPinned]);

  useEffect(() => {
    if (!isDrawerOpen || isPinned) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDrawerOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, isPinned]);

  const handleNavigate = (tab: DesktopPrimaryTab) => {
    onTabChange(tab);

    if (!isPinned) {
      setIsDrawerOpen(false);
    }
  };

  const handleToggleDrawer = () => {
    if (isPinned) {
      setIsPinned(false);
      setIsDrawerOpen(false);
      return;
    }

    setIsDrawerOpen((prev) => !prev);
  };

  const handleTogglePinned = () => {
    if (!canPin) {
      return;
    }

    setIsPinned((prev) => {
      const next = !prev;
      setIsDrawerOpen(next);
      return next;
    });
  };

  const open = isPinned || isDrawerOpen;

  return (
    <div
      className={`desktop-shell-nav${open ? ' is-open' : ''}${isPinned ? ' is-pinned' : ''}`}
      data-desktop-theme={themeKey}
      data-desktop-nav-state={isPinned ? 'pinned' : open ? 'drawer' : 'rail'}
    >
      <DesktopNavRail
        activeTab={activeTab}
        drawerOpen={open}
        pinned={isPinned}
        onNavigate={handleNavigate}
        onToggleDrawer={handleToggleDrawer}
      />
      <DesktopNavDrawer
        activeTab={activeTab}
        open={open}
        pinned={isPinned}
        canPin={canPin}
        onNavigate={handleNavigate}
        onClose={() => setIsDrawerOpen(false)}
        onTogglePinned={handleTogglePinned}
      />
    </div>
  );
};
