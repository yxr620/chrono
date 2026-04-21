import { useState, useEffect, useLayoutEffect } from 'react';
import {
  IonApp,
  IonIcon,
  IonTabBar,
  IonTabButton,
} from '@ionic/react';
import { checkmarkDoneOutline, settingsOutline } from 'ionicons/icons';
import { RecordsPage } from './components/RecordsPage/RecordsPage';
import { Dashboard } from './components/Dashboard/Dashboard';
import { TrendPage } from './components/TrendPage/TrendPage';
import { GoalAnalysisPage } from './components/GoalAnalysisPage/GoalAnalysisPage';
import { ExportPage } from './components/ExportPage/ExportPage';
import { MaintenancePage } from './components/MaintenancePage/MaintenancePage';
import { AIAssistant } from './components/AIAssistant/AIAssistant';
import recordsIcon from './assets/recordsIcon.png';
import { GoalManager } from './components/GoalManager/GoalManager';
import { useSyncStore } from './stores/syncStore';
import { isSyncReady } from './services/syncConfig';
import { syncEngine } from './services/syncEngine';
import { emitSyncToast, emitSyncStatus } from './services/syncToast';
import { DesktopSidebar } from './components/Desktop/DesktopSidebar';
import { getDesktopShellTheme } from './components/Desktop/desktopNavigation';
import { SyncToastListener } from './components/common/SyncToastListener';
import { SyncIndicator } from './components/common/SyncIndicator';
import { getDefaultDateRange } from './services/analysis/processor';
import type { DesktopShellTheme, DesktopTab } from './components/Desktop/desktopNavigation';
import type { DateRange } from './types/analysis';
import './App.css';

// ─── Layout Components ─────────────────────────────────────────────

interface LayoutProps {
  activeTab: DesktopTab;
  onTabChange: (tab: DesktopTab) => void;
  children: React.ReactNode;
  immersive?: boolean;
  themeKey?: DesktopShellTheme;
}

const mobileTabConfigs = [
  {
    tab: 'records',
    icon: <img src={recordsIcon} alt="" />,
  },
  {
    tab: 'goals',
    icon: <IonIcon icon={checkmarkDoneOutline} />,
  },
  {
    tab: 'export',
    icon: <IonIcon icon={settingsOutline} />,
  },
] as const;

const MobileLayout: React.FC<LayoutProps> = ({ activeTab, onTabChange, children }) => (
  <div className="app mobile-layout">
    <div className="app-header" data-app-header>
      <h1 data-app-brand>Chrono</h1>
      <SyncIndicator />
    </div>
    <div className="app-body">
      {children}
    </div>
    <div className="app-footer">
      <IonTabBar
        className="mobile-tab-bar"
        selectedTab={activeTab}
        onIonTabsDidChange={(e) => onTabChange(e.detail.tab as DesktopTab)}
      >
        {mobileTabConfigs.map(({ tab, icon }) => (
          <IonTabButton
            key={tab}
            tab={tab}
            className={`mobile-tab-button${tab === activeTab ? ' mobile-tab-button-active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {icon}
          </IonTabButton>
        ))}
      </IonTabBar>
    </div>
  </div>
);

const DesktopLayout: React.FC<LayoutProps> = ({ activeTab, onTabChange, children, immersive = false, themeKey = 'utility' }) => (
  <div className="app desktop-layout" data-desktop-theme={themeKey}>
    <DesktopSidebar activeTab={activeTab} onTabChange={onTabChange} />
    <div className="desktop-main">
      <div
        className={`desktop-content${immersive ? ' desktop-content-immersive' : ''}`}
        data-app-shell-content
      >
        {children}
      </div>
    </div>
  </div>
);

// ─── App Component ──────────────────────────────────────────────────

function App() {
  const [activeTab, setActiveTab] = useState<DesktopTab>('records');
  const { checkConfig } = useSyncStore();
  const [analysisDateRange, setAnalysisDateRange] = useState<DateRange>(getDefaultDateRange());
  const [analysisSelectedRange, setAnalysisSelectedRange] = useState(30);
  const isAnalysisTab = activeTab === 'dashboard' || activeTab === 'trend' || activeTab === 'goalAnalysis';
  const desktopTheme = getDesktopShellTheme(activeTab);

  // 屏幕宽度检测
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    let frameId = 0;
    let observedIndicator: HTMLElement | null = null;

    const clearToastVars = () => {
      root.style.removeProperty('--app-top-toast-start');
      root.style.removeProperty('--app-top-toast-min-width');
      root.style.removeProperty('--app-top-toast-max-width');
      root.style.removeProperty('--app-top-toast-y-offset');
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        syncToastAnchor();
      })
      : null;

    const observeIndicator = () => {
      const nextIndicator = document.querySelector<HTMLElement>('[data-app-sync-indicator]');

      if (observedIndicator === nextIndicator) {
        return;
      }

      if (observedIndicator) {
        resizeObserver?.unobserve(observedIndicator);
      }

      observedIndicator = nextIndicator;
      if (observedIndicator) {
        resizeObserver?.observe(observedIndicator);
      }
    };

    const syncToastAnchor = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        if (window.innerWidth >= 1024) {
          const shellContent = document.querySelector<HTMLElement>('[data-app-shell-content]');

          if (!shellContent) {
            clearToastVars();
            return;
          }

          const contentRect = shellContent.getBoundingClientRect();

          root.style.setProperty('--app-top-toast-start', `${Math.round(contentRect.left + 24)}px`);
          root.style.setProperty('--app-top-toast-min-width', '180px');
          root.style.setProperty('--app-top-toast-max-width', '280px');
          root.style.setProperty('--app-top-toast-y-offset', '12px');
          return;
        }

        observeIndicator();

        const header = document.querySelector<HTMLElement>('[data-app-header]');
        const brand = document.querySelector<HTMLElement>('[data-app-brand]');

        if (!header || !brand) {
          clearToastVars();
          return;
        }

        const indicator = document.querySelector<HTMLElement>('[data-app-sync-indicator]');
        const headerRect = header.getBoundingClientRect();
        const brandRect = brand.getBoundingClientRect();
        const indicatorRect = indicator?.getBoundingClientRect();
        const anchorGap = 10;
        const sidePadding = 12;
        const preferredStart = Math.round(brandRect.right + anchorGap);
        const preferredEnd = Math.round((indicatorRect?.left ?? headerRect.right) - anchorGap);
        const fallbackStart = Math.round(headerRect.left + sidePadding);
        const fallbackEnd = Math.round(headerRect.right - sidePadding);
        const preferredWidth = preferredEnd - preferredStart;
        const fallbackWidth = fallbackEnd - fallbackStart;
        const minimumInlineWidth = 140;
        const desiredMaxWidth = 280;
        const useInlinePlacement = preferredWidth >= minimumInlineWidth;
        const resolvedStart = useInlinePlacement ? preferredStart : fallbackStart;
        const resolvedWidth = Math.max(useInlinePlacement ? preferredWidth : fallbackWidth, 120);
        const resolvedMaxWidth = Math.min(resolvedWidth, desiredMaxWidth);
        const resolvedMinWidth = Math.min(resolvedMaxWidth, useInlinePlacement ? minimumInlineWidth : 120);
        const resolvedYOffset = useInlinePlacement ? 0 : Math.round(headerRect.height + 6);

        root.style.setProperty('--app-top-toast-start', `${resolvedStart}px`);
        root.style.setProperty('--app-top-toast-min-width', `${resolvedMinWidth}px`);
        root.style.setProperty('--app-top-toast-max-width', `${resolvedMaxWidth}px`);
        root.style.setProperty('--app-top-toast-y-offset', `${resolvedYOffset}px`);
      });
    };

    syncToastAnchor();

    const mutationObserver = new MutationObserver(() => {
      observeIndicator();
      syncToastAnchor();
    });
    const header = document.querySelector<HTMLElement>('[data-app-header]');
    if (header) {
      mutationObserver.observe(header, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });
    }

    document
      .querySelectorAll<HTMLElement>('[data-app-header], [data-app-brand], [data-app-shell-content]')
      .forEach((element) => resizeObserver?.observe(element));
    observeIndicator();

    window.addEventListener('resize', syncToastAnchor);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', syncToastAnchor);
      mutationObserver.disconnect();
      if (observedIndicator) {
        resizeObserver?.unobserve(observedIndicator);
      }
      resizeObserver?.disconnect();
    };
  }, [isDesktop]);

  // 检查 OSS 配置
  useEffect(() => {
    try {
      checkConfig();
    } catch (error) {
      console.error('[App] 检查配置失败:', error);
    }
  }, [checkConfig]);

  // 应用启动时自动 Pull
  useEffect(() => {
    if (!isSyncReady()) return;

    emitSyncStatus({ phase: 'syncing', direction: 'pull' });

    syncEngine.incrementalPull().then(result => {
      if (result.status === 'success') {
        emitSyncStatus({
          phase: 'done',
          direction: 'pull',
          pulledCount: result.pulledCount || 0,
        });
      } else if (result.message !== '正在同步中，请稍候') {
        emitSyncStatus({ phase: 'error', direction: 'pull' });
        emitSyncToast({ message: '自动拉取失败', color: 'danger', duration: 2200 });
      }
    }).catch(err => {
      console.error('[AutoSync] 启动时 Pull 失败:', err);
      emitSyncStatus({ phase: 'error', direction: 'pull' });
      emitSyncToast({ message: '自动拉取失败', color: 'danger', duration: 2200 });
    });
  }, []);

  // 分析页面日期范围变更回调
  const handleDateRangeChange = (range: DateRange, selected: number) => {
    setAnalysisDateRange(range);
    setAnalysisSelectedRange(selected);
  };

  // 渲染页面内容
  const renderPageContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            dateRange={analysisDateRange}
            selectedRange={analysisSelectedRange}
            onDateRangeChange={handleDateRangeChange}
            onOpenTrend={() => setActiveTab('trend')}
            onOpenGoalAnalysis={() => setActiveTab('goalAnalysis')}
          />
        );
      case 'trend':
        return (
          <TrendPage
            dateRange={analysisDateRange}
            selectedRange={analysisSelectedRange}
            onDateRangeChange={handleDateRangeChange}
            onBack={() => setActiveTab('dashboard')}
          />
        );
      case 'goalAnalysis':
        return (
          <GoalAnalysisPage
            dateRange={analysisDateRange}
            selectedRange={analysisSelectedRange}
            onDateRangeChange={handleDateRangeChange}
            onBack={() => setActiveTab('dashboard')}
          />
        );
      case 'records':
        return <RecordsPage />;
      case 'goals':
        return <GoalManager />;
      case 'ai':
        return <AIAssistant />;
      case 'maintenance':
        return <MaintenancePage />;
      case 'export':
        return <ExportPage />;
      default:
        return null;
    }
  };

  const Layout = isDesktop ? DesktopLayout : MobileLayout;

  return (
    <IonApp>
      <SyncToastListener />
      <Layout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        immersive={isDesktop && isAnalysisTab}
        themeKey={desktopTheme}
      >
        {renderPageContent()}
      </Layout>
    </IonApp>
  );
}

export default App;
