import { IonIcon } from '@ionic/react';
import { chevronForwardOutline, closeOutline } from 'ionicons/icons';
import {
  DESKTOP_NAV_ITEMS,
  isDesktopNavItemActive,
} from './desktopNavigation';
import type { DesktopPrimaryTab, DesktopTab } from './desktopNavigation';
import './DesktopNavRail.css';

type DesktopNavState = 'rail' | 'drawer' | 'pinned';

const DESKTOP_NAV_DRAWER_ID = 'desktop-navigation-drawer';

const getRailTriggerLabel = (navState: DesktopNavState): string => {
  if (navState === 'pinned') {
    return '收起已固定导航，返回图标轨道';
  }

  return navState === 'drawer' ? '收起导航抽屉' : '展开导航抽屉';
};

const getActiveItemAriaLabel = (label: string, navState: DesktopNavState): string => {
  if (navState === 'pinned') {
    return `${label}，当前页面，收起已固定导航并返回图标轨道`;
  }

  return navState === 'drawer'
    ? `${label}，当前页面，收起导航详情`
    : `${label}，当前页面，展开导航详情`;
};

const getActiveItemTooltip = (label: string, navState: DesktopNavState): string => {
  if (navState === 'pinned') {
    return `${label}：收起固定导航`;
  }

  return navState === 'drawer' ? `${label}：收起详情` : `${label}：展开详情`;
};

interface DesktopNavRailProps {
  activeTab: DesktopTab;
  drawerOpen: boolean;
  pinned: boolean;
  onNavigate: (tab: DesktopPrimaryTab) => void;
  onToggleDrawer: () => void;
}

export const DesktopNavRail: React.FC<DesktopNavRailProps> = ({
  activeTab,
  drawerOpen,
  pinned,
  onNavigate,
  onToggleDrawer,
}) => {
  const navState: DesktopNavState = pinned ? 'pinned' : drawerOpen ? 'drawer' : 'rail';
  const isExpanded = navState !== 'rail';
  const triggerLabel = getRailTriggerLabel(navState);

  return (
    <aside className="desktop-nav-rail" data-nav-state={navState} aria-label="桌面导航轨道">
      <div className="desktop-nav-rail-top">
        <div className="desktop-rail-brand" aria-hidden="true">Ch</div>
        <button
          type="button"
          className="desktop-rail-trigger"
          data-nav-state={navState}
          title={triggerLabel}
          aria-label={triggerLabel}
          aria-controls={DESKTOP_NAV_DRAWER_ID}
          aria-expanded={isExpanded}
          onClick={onToggleDrawer}
        >
          <IonIcon icon={isExpanded ? closeOutline : chevronForwardOutline} />
        </button>
      </div>

      <nav className="desktop-rail-items" aria-label="桌面主导航">
        {DESKTOP_NAV_ITEMS.map((item) => {
          const isActive = isDesktopNavItemActive(item, activeTab);
          const itemTooltip = isActive
            ? getActiveItemTooltip(item.label, navState)
            : `前往${item.label}`;
          const itemAriaLabel = isActive
            ? getActiveItemAriaLabel(item.label, navState)
            : `前往${item.label}`;

          return (
            <button
              key={item.key}
              type="button"
              className={`desktop-rail-item${isActive ? ' is-active' : ''}`}
              data-nav-state={isActive ? navState : undefined}
              title={itemTooltip}
              aria-current={isActive ? 'page' : undefined}
              aria-label={itemAriaLabel}
              aria-controls={isActive ? DESKTOP_NAV_DRAWER_ID : undefined}
              aria-expanded={isActive ? isExpanded : undefined}
              onClick={() => {
                if (!isActive) {
                  onNavigate(item.key);
                  return;
                }

                onToggleDrawer();
              }}
            >
              {item.isImage ? (
                <img src={item.icon} alt="" className="desktop-rail-icon desktop-rail-icon-image" />
              ) : (
                <IonIcon icon={item.icon} className="desktop-rail-icon" />
              )}
              <span className="desktop-rail-tooltip">{itemTooltip}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};