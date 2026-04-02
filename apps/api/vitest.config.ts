import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/services/**'],
      thresholds: {
        lines: 30,
        functions: 40,
        statements: 30,
        branches: 75,
      },
    },
    setupFiles: ['./tests/setup.ts'],
  },
})
