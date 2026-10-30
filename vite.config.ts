import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// base './'：构建产物可放在任意子路径 / 直接静态托管（路由用 hash，不依赖服务端重写）
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // three.js 本身就比较大；播放器已按需加载，这里只是避免无意义的警告
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
