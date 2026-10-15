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

const QUERY_TIMEOUT_MS = 12_000

/**
 * Vercel can freeze a warm instance between requests and resume it later; if
 * the pooler or the network path drops the TCP connection while frozen, the
 * instance wakes up holding a socket that looks open but will never answer -
 * Postgres never sees it, so statement_timeout can't help, and the OS can
 * take a very long time to notice a dead peer on its own. With max:1, every
 * other request on that instance then queues behind the one hung query.
 *
 * Drizzle's postgres-js driver only ever reaches the database through
 * sql.unsafe() (every select/insert/update/delete) and sql.begin()
 * (transactions) - see node_modules/drizzle-orm/postgres-js/session.js.
 * Wrapping just those two race every real query against our own timeout and,
 * on expiry, throw the connection away and build a fresh one so the next
 * request isn't handed the same wedged socket.
 */
function buildPostgresDb(url: string): AppDb {
  let current: AppDb

  const build = (): void => {
    const sql = postgres(url, {
      // Keep one connection per instance and use Supabase's transaction
      // pooler (port 6543) so the database's connection limit can't be
      // exhausted by a burst of concurrent serverless instances.
      max: 1,
      prepare: false,
      // Force a reconnect before a long-lived or merely-idle socket can be
      // silently dropped out from under us.
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      connect_timeout: 10,
      // Belt-and-suspenders: Supabase's pooler caps this at 2min regardless
      // and may not forward it at all, but it costs nothing to ask.
      connection: {
        statement_timeout: 15_000,
        lock_timeout: 8_000,
        idle_in_transaction_session_timeout: 10_000,
      },
    })

    const originalUnsafe = sql.unsafe.bind(sql)
    sql.unsafe = ((...args: Parameters<typeof originalUnsafe>) => {
      const query = originalUnsafe(...args)
      const originalThen = query.then.bind(query)
      query.then = ((onFulfilled?: unknown, onRejected?: unknown) =>
        guard(new Promise((resolve, reject) => originalThen(resolve, reject))).then(
          onFulfilled as never,
          onRejected as never,
        )) as typeof query.then
      return query
    }) as typeof sql.unsafe

    const originalBegin = sql.begin.bind(sql)
    sql.begin = ((...args: Parameters<typeof originalBegin>) =>
      guard(originalBegin(...args))) as typeof sql.begin

    globalForDb.__pgSql = sql
    current = drizzlePostgres(sql, { schema })
  }

  const guard = <T>(promise: Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        recreate()
        reject(new Error('Database is not responding. Please try again.'))
      }, QUERY_TIMEOUT_MS)
      promise.then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error: unknown) => {
          clearTimeout(timer)
          reject(error)
        },
      )
    })

  const recreate = (): void => {
    try {
      globalForDb.__pgSql?.end({ timeout: 0 })
    } catch {
      // Already broken - nothing left to clean up.
    }
    build()
  }

  build()

  // `db` is imported by name across the app; this proxy keeps that binding
  // stable while letting recreate() swap the live connection underneath it.
  return new Proxy({} as AppDb, {
    get(_target, prop, _receiver) {
      return Reflect.get(current as object, prop, current)
    },
  })
}

function create(): AppDb {
  const url = env.databaseUrl

  if (url) return buildPostgresDb(url)

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
