import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
} satisfies Config
