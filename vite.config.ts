import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: './', // 修复 Capacitor 打包后白屏问题
  plugins: [
    react(),
    VitePWA({
      disable: mode === 'development', // 开发模式禁用 PWA
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
      },
      manifest: {
        name: 'Chrono',
        short_name: 'Chrono',
        description: '个人时间追踪与管理工具',
        theme_color: '#1677ff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/icons/icon-192.webp',
            sizes: '192x192',
            type: 'image/webp'
          },
          {
            src: '/icons/icon-512.webp',
            sizes: '512x512',
            type: 'image/webp'
          }
        ]
      }
    })
  ]
}))
