import {
  barChartOutline,
  checkmarkDoneOutline,
  constructOutline,
  serverOutline,
  settingsOutline,
  sparklesOutline,
} from 'ionicons/icons';
import recordsIcon from '../../assets/recordsIcon.png';

export type DesktopPrimaryTab = 'dashboard' | 'records' | 'goals' | 'ai' | 'maintenance' | 'services' | 'export';
export type DesktopTab = DesktopPrimaryTab | 'trend' | 'goalAnalysis';
export type DesktopShellTheme = 'analysis' | 'records' | 'goals' | 'utility';

export interface DesktopNavItem {
  key: DesktopPrimaryTab;
  label: string;
  icon: string;
  isImage?: boolean;
  tabs: readonly DesktopTab[];
  description: string;
  theme: DesktopShellTheme;
}

export const DESKTOP_NAV_ITEMS: DesktopNavItem[] = [
  {
    key: 'dashboard',
    label: '分析',
    icon: barChartOutline,
    tabs: ['dashboard', 'trend', 'goalAnalysis'],
    description: '查看分析封面、趋势章节和目标章节。',
    theme: 'analysis',
  },
  {
    key: 'records',
    label: '记录',
    icon: recordsIcon,
    isImage: true,
    tabs: ['records'],
    description: '高频录入、时间轴浏览和当日记录整理。',
    theme: 'records',
  },
  {
    key: 'goals',
    label: '目标',
    icon: checkmarkDoneOutline,
    tabs: ['goals'],
    description: '管理目标、查看完成进度和时间投入。',
    theme: 'goals',
  },
  {
    key: 'ai',
    label: 'AI',
    icon: sparklesOutline,
    tabs: ['ai'],
    description: '使用桌面端 AI 助手读取并分析记录数据。',
    theme: 'utility',
  },
  {
    key: 'maintenance',
    label: '维护',
    icon: constructOutline,
    tabs: ['maintenance'],
    description: '处理类别、同步和维护工具。',
    theme: 'utility',
  },
  {
    key: 'services',
    label: '服务',
    icon: serverOutline,
    tabs: ['services'],
    description: '管理同步、AI 助手等服务的开关与凭据。',
    theme: 'utility',
  },
  {
    key: 'export',
    label: '设置',
    icon: settingsOutline,
    tabs: ['export'],
    description: '导出数据和桌面设置入口。',
    theme: 'utility',
  },
];

export const isDesktopNavItemActive = (item: DesktopNavItem, activeTab: DesktopTab): boolean => {
  return item.tabs.includes(activeTab);
};

export const getActiveDesktopNavItem = (activeTab: DesktopTab): DesktopNavItem => {
  return DESKTOP_NAV_ITEMS.find((item) => item.tabs.includes(activeTab)) ?? DESKTOP_NAV_ITEMS[0];
};

export const getDesktopShellTheme = (activeTab: DesktopTab): DesktopShellTheme => {
  return getActiveDesktopNavItem(activeTab).theme;
};