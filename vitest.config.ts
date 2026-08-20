import path from 'node:path'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const shared = {
    plugins: [react()],
    resolve: {
      // tsconfig 의 paths("@/*")를 테스트에서도 그대로 쓴다
      alias: { '@': path.resolve(process.cwd(), 'src') },
    },
  }

  return {
    ...shared,
    test: {
      // 통합 테스트끼리는 **직렬로** 돈다 (2026-08-20 원인 확정).
      // 파일을 병렬로 돌리면 여러 통합 테스트가 로컬 Supabase 하나를 동시에 두드려
      // 5초 타임아웃으로 매번 다른 한 건이 깨진다 — 코드 문제가 아닌데 푸시 훅까지 막았다.
      // 유닛은 그대로 병렬로 둔다: 느려지는 값을 통합에만 치른다.
      projects: [
        {
          ...shared,
          test: {
            name: 'unit',
            include: ['src/**/*.test.{ts,tsx}'],
            exclude: ['src/**/*.integration.test.ts'],
            environment: 'node', // 컴포넌트 테스트 파일은 개별 @vitest-environment jsdom 지정
            env,
          },
        },
        {
          ...shared,
          test: {
            name: 'integration',
            include: ['src/**/*.integration.test.ts'],
            fileParallelism: false,
            environment: 'node',
            // 로컬 Supabase·Mailpit 주소를 읽는다 (.env.local)
            env,
          },
        },
      ],
    },
  }
})
