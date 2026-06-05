import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // ⚠️ 請改成這樣，明確指定專案名稱資料夾
  base: '/anime-tracker/', 
  plugins: [react()],
})