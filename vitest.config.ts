import path from 'node:path'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    // tsconfig 의 paths("@/*")를 테스트에서도 그대로 쓴다
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node', // 컴포넌트 테스트 파일은 개별 @vitest-environment jsdom 지정
    // integration 테스트가 로컬 Supabase·Mailpit 주소를 읽는다 (.env.local)
    env: loadEnv(mode, process.cwd(), ''),
  },
}))
