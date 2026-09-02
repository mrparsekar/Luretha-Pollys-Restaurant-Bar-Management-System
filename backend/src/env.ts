import fs from 'node:fs'

// Scripts and the server both start here, so load env files before anything reads
// process.env. .env.local (if present) overrides .env.
for (const file of ['.env', '.env.local']) {
  if (fs.existsSync(file)) {
    try {
      process.loadEnvFile(file)
    } catch {
      // Malformed file: fall back to the real environment.
    }
  }
}

const nodeEnv = process.env.NODE_ENV ?? 'development'
const isProd = nodeEnv === 'production'

function str(name: string, fallback = ''): string {
  return (process.env[name] ?? '').trim() || fallback
}

function int(name: string, fallback: number): number {
  const raw = str(name)
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function bool(name: string, fallback = false): boolean {
  const raw = str(name).toLowerCase()
  if (!raw) return fallback
  return raw === '1' || raw === 'true' || raw === 'yes'
}

function sessionSecret(): string {
  const secret = str('SESSION_SECRET')
  if (secret.length >= 32) return secret
  if (isProd) {
    throw new Error(
      'SESSION_SECRET must be set to at least 32 characters in production. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    )
  }
  console.warn('[env] SESSION_SECRET missing or too short - using an insecure development secret.')
  return 'development-only-insecure-session-secret-do-not-ship'
}

export const env = {
  nodeEnv,
  isProd,
  port: int('PORT', 4000),
  sessionSecret: sessionSecret(),
  databaseUrl: str('DATABASE_URL'),
  corsOrigin: str('CORS_ORIGIN', 'http://localhost:5173'),
  publicAppUrl: str('PUBLIC_APP_URL', 'http://localhost:5173').replace(/\/+$/, ''),
  /** True only when the browser talks to this API on a different domain. */
  cookieCrossSite: bool('COOKIE_CROSS_SITE', false),
  /** Extra safety net for PIN brute force; the DB lockout is the real guard. */
  loginRateLimit: int('LOGIN_RATE_LIMIT', 20),
  smtp: {
    host: str('SMTP_HOST'),
    port: int('SMTP_PORT', 587),
    user: str('SMTP_USER'),
    pass: str('SMTP_PASS'),
    from: str('SMTP_FROM', 'Luretha & Pollys <no-reply@example.com>'),
  },
  seed: {
    ownerName: str('SEED_OWNER_NAME', 'Owner'),
    ownerEmail: str('SEED_OWNER_EMAIL', 'owner@lurethaandpollys.local').toLowerCase(),
    ownerPassword: str('SEED_OWNER_PASSWORD', 'changeme123'),
    waiterName: str('SEED_WAITER_NAME', 'Waiter One'),
    waiterPin: str('SEED_WAITER_PIN', '1234'),
  },
} as const

export const mailEnabled = env.smtp.host.length > 0
