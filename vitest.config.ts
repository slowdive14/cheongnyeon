import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/data/**', 'src/retrieval/**', 'src/ui/**', 'src/llm/**'],
      // 캐시 I/O 구현체·실 Gemini SDK 경로·실 fetch 경로는 fixture/mock으로 미도달.
      // 결정적 게이트(키 0개)에서 커버 불가한 부수효과 경계만 제외.
      exclude: [
        'src/data/cache/localJsonCache.ts',
        'src/data/cache/supabaseCache.ts',
        'src/data/llm/geminiClient.ts',
        'src/data/llm/geminiEmbed.ts',
      ],
      // 계층별 게이트: 도메인 순수함수 ≥90, 데이터 계층(I/O 경계 제외) ≥80.
      thresholds: {
        'src/domain/**': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        'src/data/**': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        // Phase 4: retrieval 코어(degrade 분기 多) ≥80.
        'src/retrieval/**': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        // Phase 5: UI(깔때기) lines/functions/statements ≥85, branches ≥80.
        'src/ui/**': {
          lines: 85,
          functions: 85,
          branches: 80,
          statements: 85,
        },
        // Phase 6: LLM 레이어(안전직결) stmt/lines ≥90, branches ≥85.
        'src/llm/**': {
          lines: 90,
          functions: 90,
          branches: 85,
          statements: 90,
        },
      },
    },
  },
});
