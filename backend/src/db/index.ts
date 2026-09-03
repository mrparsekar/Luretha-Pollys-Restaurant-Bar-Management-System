import fs from 'node:fs'

import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '../env.js'
import * as schema from './schema.js'

/**
 * One schema, two drivers:
 *
 *  - DATABASE_URL set   -> postgres.js, i.e. Supabase in production.
 *  - DATABASE_URL empty -> PGlite, a real Postgres compiled to WASM, persisted
 *                          in ./.data/pg. Local dev and tests need no install.
 *
 * Both expose the same Drizzle query builders, so the app is written against one
 * type and the PGlite instance is cast to it in a single place, right here.
 */
export type AppDb = PostgresJsDatabase<typeof schema>

const PGLITE_DIR = process.env.PGLITE_DIR ?? './.data/pg'

type DbGlobal = {
  __appDb?: AppDb
  __pglite?: PGlite
  __pgSql?: ReturnType<typeof postgres>
}

// Survives Next.js dev-server hot reloads, which would otherwise open a second
// PGlite handle on the same data directory.
const globalForDb = globalThis as unknown as DbGlobal

function create(): AppDb {
  const url = env.databaseUrl

  if (url) {
    // prepare:false is required behind Supabase's transaction pooler.
    const sql = postgres(url, { max: 5, prepare: false })
    globalForDb.__pgSql = sql
    return drizzlePostgres(sql, { schema })
  }

  // PGlite's own mkdir is not recursive, so ensure the parent exists first.
  fs.mkdirSync(PGLITE_DIR, { recursive: true })
  const client = new PGlite(PGLITE_DIR)
  globalForDb.__pglite = client
  return drizzlePglite(client, { schema }) as unknown as AppDb
}

export const db: AppDb = globalForDb.__appDb ?? create()
if (!env.isProd) globalForDb.__appDb = db

export function isEmbedded(): boolean {
  return !env.databaseUrl
}

/** Only needed by scripts and tests; the app itself keeps the pool open. */
export async function closeDb(): Promise<void> {
  await globalForDb.__pgSql?.end({ timeout: 5 })
  await globalForDb.__pglite?.close()
  globalForDb.__pgSql = undefined
  globalForDb.__pglite = undefined
  globalForDb.__appDb = undefined
}

export { schema }
