import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type Express } from 'express'

import { env, mailEnabled } from './env.js'
import { errorHandler, notFoundHandler } from './lib/http.js'
import { attachSession } from './middleware/auth.js'
import { authRouter } from './routes/auth.js'
import { billRouter } from './routes/bills.js'
import { menuRouter } from './routes/menu.js'
import { orderRouter } from './routes/orders.js'
import { reportRouter } from './routes/reports.js'
import { settingsRouter } from './routes/settings.js'
import { staffRouter } from './routes/staff.js'
import { tableRouter } from './routes/tables.js'

export function createApp(): Express {
  const app = express()

  // Behind Vercel/Render/Nginx the client IP and the https flag arrive in headers;
  // without this the rate limiter would see one proxy IP for the whole restaurant.
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  // The frontend is a separate origin in development (Vite on 5173) and may be one
  // in production too, so credentials must be allowed explicitly - a wildcard
  // origin silently drops the session cookie.
  const allowed = env.corsOrigin
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean)

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header: same-origin, curl, or a server-side call.
        if (!origin) return callback(null, true)
        callback(null, allowed.includes(origin.replace(/\/+$/, '')))
      },
      credentials: true,
    }),
  )

  app.use(express.json({ limit: '256kb' }))
  app.use(cookieParser())
  app.use(attachSession)

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      env: env.nodeEnv,
      database: env.databaseUrl ? 'postgres' : 'pglite',
      mail: mailEnabled,
      time: new Date().toISOString(),
    })
  })

  app.use('/api/auth', authRouter)
  app.use('/api/menu', menuRouter)
  app.use('/api/tables', tableRouter)
  app.use('/api/orders', orderRouter)
  app.use('/api/bills', billRouter)
  app.use('/api/reports', reportRouter)
  app.use('/api/staff', staffRouter)
  app.use('/api/settings', settingsRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

// Vercel may auto-detect this module as the Express function entry.
export const app = createApp()
export default app
