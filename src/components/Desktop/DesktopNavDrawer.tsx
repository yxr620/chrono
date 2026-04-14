import { IonIcon } from '@ionic/react';
import { chevronBackOutline, pinOutline, pinSharp } from 'ionicons/icons';
import { SyncIndicator } from '../common/SyncIndicator';
import {
  DESKTOP_NAV_ITEMS,
  getActiveDesktopNavItem,
  isDesktopNavItemActive,
} from './desktopNavigation';
import type { DesktopPrimaryTab, DesktopTab } from './desktopNavigation';
import './DesktopNavDrawer.css';

interface DesktopNavDrawerProps {
  activeTab: DesktopTab;
  open: boolean;
  pinned: boolean;
  canPin: boolean;
  onNavigate: (tab: DesktopPrimaryTab) => void;
  onClose: () => void;
  onTogglePinned: () => void;
}

export const DesktopNavDrawer: React.FC<DesktopNavDrawerProps> = ({
  activeTab,
  open,
  pinned,
  canPin,
  onNavigate,
  onClose,
  onTogglePinned,
}) => {
  const activeItem = getActiveDesktopNavItem(activeTab);

  return (
    <>
      {open && !pinned && (
        <button
          type="button"
          className="desktop-nav-backdrop"
          aria-label="关闭导航抽屉"
          tabIndex={-1}
          onClick={onClose}
        />
      )}

      <aside
        id="desktop-navigation-drawer"
        className={`desktop-nav-drawer${open ? ' is-open' : ''}${pinned ? ' is-pinned' : ''}`}
        aria-hidden={!open}
      >
        <div className="desktop-nav-drawer-header">
          <div>
            <p className="desktop-nav-drawer-kicker">Current Space</p>
            <h2>{activeItem.label}</h2>
            <p className="desktop-nav-drawer-description">{activeItem.description}</p>
          </div>

          <div className="desktop-nav-drawer-actions">
            {canPin && (
              <button
                type="button"
                className="desktop-nav-drawer-action"
                onClick={onTogglePinned}
              >
                <IonIcon icon={pinned ? pinSharp : pinOutline} />
                <span>{pinned ? '取消固定' : '固定侧边栏'}</span>
              </button>
            )}

            <button
              type="button"
              className="desktop-nav-drawer-action"
              onClick={onClose}
            >
              <IonIcon icon={chevronBackOutline} />
              <span>收起</span>
            </button>
          </div>
        </div>

        <nav className="desktop-nav-drawer-nav" aria-label="展开导航">
          {DESKTOP_NAV_ITEMS.map((item) => {
            const isActive = isDesktopNavItemActive(item, activeTab);

            return (
              <button
                key={item.key}
                type="button"
                className={`desktop-nav-drawer-item${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNavigate(item.key)}
              >
                <div className="desktop-nav-drawer-item-main">
                  <span className="desktop-nav-drawer-item-label">{item.label}</span>
                  <span className="desktop-nav-drawer-item-copy">{item.description}</span>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="desktop-nav-drawer-footer">
          <div className="desktop-nav-drawer-footer-copy">
            <span className="desktop-nav-drawer-footer-label">同步状态</span>
            <p>同步进度不再占据独立桌面 header，而是回到导航系统内部。</p>
          </div>
          <SyncIndicator />
        </div>
      </aside>
    </>
  );
};