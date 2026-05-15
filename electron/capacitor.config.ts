import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yxr.timetracker',
  appName: 'Chrono',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  plugins: {
    StatusBar: {
      style: 'light',
      backgroundColor: '#EEEEF2',
      overlay: false,
    },
    Keyboard: {
      resize: 'ionic',
      style: 'dark',
      resizeOnFullScreen: false,
    },
  },
};

export default config;
