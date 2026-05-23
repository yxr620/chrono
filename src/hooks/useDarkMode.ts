import { useEffect } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { create } from 'zustand';

interface DarkModeState {
  isDark: boolean;
  toggle: () => void;
  setDark: (dark: boolean) => void;
}

const getInitialDark = () => {
  const saved = localStorage.getItem('darkMode');
  if (saved !== null) {
    return saved === 'true';
  }
  // 暂停跟随系统：默认浅色，等深色模式稳定后恢复 window.matchMedia('(prefers-color-scheme: dark)').matches
  return false;
};

const useDarkModeStore = create<DarkModeState>((set, get) => ({
  isDark: getInitialDark(),
  toggle: () => set({ isDark: !get().isDark }),
  setDark: (dark: boolean) => set({ isDark: dark }),
}));

export function useDarkMode() {
  const isDark = useDarkModeStore(state => state.isDark);
  const toggle = useDarkModeStore(state => state.toggle);
  const setDark = useDarkModeStore(state => state.setDark);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    if (isDark) {
      root.classList.add('dark');
      body.classList.add('dark');
    } else {
      root.classList.remove('dark');
      body.classList.remove('dark');
    }

    // 保存偏好到 localStorage
    localStorage.setItem('darkMode', String(isDark));

    // 更新状态栏样式（仅在原生平台）
    if (Capacitor.isNativePlatform()) {
      try {
        StatusBar.setStyle({
          style: isDark ? Style.Dark : Style.Light
        });
        StatusBar.setBackgroundColor({
          color: isDark ? '#020817' : '#EEEEF2'
        });
      } catch (error) {
        console.error('[DarkMode] 状态栏更新失败:', error);
      }
    }
  }, [isDark]);

  return { isDark, toggle, setDark };
}
