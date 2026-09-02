import { defineConfig } from 'vitest/config'

/**
 * Tests never touch the real database. Forcing DATABASE_URL empty makes src/db
 * fall back to PGlite, and PGLITE_DIR sends that copy to a throwaway folder, so a
 * developer with a live Postgres in .env can still run `npm test` safely.
 *
 * process.loadEnvFile (see src/env.ts) does not overwrite variables that are
 * already set, so these win over .env.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: '',
      PGLITE_DIR: './.data/test-pg',
      SESSION_SECRET: 'test-only-session-secret-at-least-32-chars-long',
      PUBLIC_APP_URL: 'http://localhost:5173',
      SMTP_HOST: '',
    },
    // One PGlite data directory cannot be shared by parallel workers.
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    restoreMocks: true,
  },
})
