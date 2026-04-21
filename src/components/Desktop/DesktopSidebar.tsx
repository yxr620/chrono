import { useEffect, useMemo, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import { SyncIndicator } from '../common/SyncIndicator';
import {
  DESKTOP_NAV_ITEMS,
  getActiveDesktopNavItem,
  getDesktopShellTheme,
  isDesktopNavItemActive,
} from './desktopNavigation';
import type { DesktopPrimaryTab, DesktopTab } from './desktopNavigation';
import './DesktopSidebar.css';

const COLLAPSED_STORAGE_KEY = 'chrono.desktop-sidebar-collapsed';

interface DesktopSidebarProps {
  activeTab: DesktopTab;
  onTabChange: (tab: DesktopTab) => void;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({ activeTab, onTabChange }) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  const themeKey = useMemo(() => getDesktopShellTheme(activeTab), [activeTab]);
  const activeItem = useMemo(() => getActiveDesktopNavItem(activeTab), [activeTab]);

  const handleNavigate = (tab: DesktopPrimaryTab) => {
    onTabChange(tab);
  };

  const toggleLabel = collapsed ? '展开侧边栏' : '收起侧边栏';

  return (
    <aside
      className={`desktop-sidebar${collapsed ? ' is-collapsed' : ' is-expanded'}`}
      data-desktop-theme={themeKey}
      data-collapsed={collapsed ? 'true' : 'false'}
      aria-label="桌面导航"
    >
      <div className="desktop-sidebar-header">
        <button
          type="button"
          className="desktop-sidebar-brand-button"
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((prev) => !prev)}
        >
          {collapsed ? (
            <span className="desktop-sidebar-brand-mark" aria-hidden="true">Ch</span>
          ) : (
            <span className="desktop-sidebar-brand-copy">
              <span className="desktop-sidebar-brand-name">Chrono</span>
              <span className="desktop-sidebar-brand-context">当前 · {activeItem.label}</span>
            </span>
          )}
          {!collapsed && (
            <span className="desktop-sidebar-brand-chevron" aria-hidden="true">
              <IonIcon icon={chevronBackOutline} />
            </span>
          )}
          {collapsed && (
            <span className="desktop-sidebar-brand-chevron is-collapsed" aria-hidden="true">
              <IonIcon icon={chevronForwardOutline} />
            </span>
          )}
        </button>
      </div>

      <nav className="desktop-sidebar-nav" aria-label="主导航">
        {DESKTOP_NAV_ITEMS.map((item) => {
          const isActive = isDesktopNavItemActive(item, activeTab);
          const tooltip = isActive ? `${item.label}（当前）` : item.label;

          return (
            <button
              key={item.key}
              type="button"
              className={`desktop-sidebar-item${isActive ? ' is-active' : ''}`}
              title={collapsed ? tooltip : undefined}
              aria-current={isActive ? 'page' : undefined}
              aria-label={collapsed ? tooltip : undefined}
              onClick={() => handleNavigate(item.key)}
            >
              <span className="desktop-sidebar-item-icon" aria-hidden="true">
                {item.isImage ? (
                  <img src={item.icon} alt="" />
                ) : (
                  <IonIcon icon={item.icon} />
                )}
              </span>
              {!collapsed && (
                <span className="desktop-sidebar-item-label">{item.label}</span>
              )}
              {collapsed && (
                <span className="desktop-sidebar-tooltip" role="tooltip">{tooltip}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="desktop-sidebar-footer">
        {collapsed ? (
          <div className="desktop-sidebar-footer-collapsed" title="同步状态">
            <SyncIndicator />
          </div>
        ) : (
          <div className="desktop-sidebar-footer-expanded">
            <span className="desktop-sidebar-kicker">同步状态</span>
            <SyncIndicator />
          </div>
        )}
      </div>
    </aside>
  );
};
