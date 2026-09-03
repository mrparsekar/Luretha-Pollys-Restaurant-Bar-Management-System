import { sql } from 'drizzle-orm'

import { app } from './app.js'
import { db, isEmbedded } from './db/index.js'
import { env } from './env.js'
import { getSettings } from './services/settings.js'

async function main(): Promise<void> {
  // Fail loudly at boot rather than on the first waiter's tap.
  await db.execute(sql`select 1`)
  if (env.databaseUrl) {
    const database = new URL(env.databaseUrl)
    const databaseName = database.pathname.replace(/^\//, '') || 'postgres'
    console.log(
      `[api] PostgreSQL connected: ${database.hostname}:${database.port || '5432'}/${databaseName}`,
    )
  } else {
    console.log('[api] embedded PGlite connected: ./.data/pg')
  }
  const settings = await getSettings()

  const server = app.listen({ port: env.port, exclusive: true }, () => {
    console.log(`[api] ${settings.restaurantName}`)
    console.log(`[api] listening on http://localhost:${env.port}  (${env.nodeEnv})`)
    console.log(`[api] database: ${isEmbedded() ? 'embedded PGlite (./.data/pg)' : 'postgres'}`)
    console.log(`[api] cors origin: ${env.corsOrigin}`)
  })

  // exclusive:true matters on Windows: without it libuv sets SO_REUSEADDR, a
  // second process binds the same port without complaint, and requests
  // disappear into whichever process the OS picks. Fail loudly instead.
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[api] port ${env.port} is already in use. Set PORT to a free port.`)
    } else {
      console.error('[api] server error:', error)
    }
    process.exit(1)
  })

  // The floor staff should not lose an in-flight round to a deploy.
  const stop = (signal: string) => () => {
    console.log(`[api] ${signal} received, closing`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5_000).unref()
  }
  process.on('SIGINT', stop('SIGINT'))
  process.on('SIGTERM', stop('SIGTERM'))
}

main().catch((error) => {
  console.error('[api] failed to start:', error)
  process.exit(1)
})
