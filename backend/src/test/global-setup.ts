import fs from 'node:fs'

/**
 * The embedded test database is disposable. Wiping it before the run keeps every
 * suite starting from the same empty schema, so order numbers and ids are
 * predictable and a crashed run cannot poison the next one.
 */
export default function setup(): void {
  const dir = process.env.PGLITE_DIR ?? './.data/test-pg'
  fs.rmSync(dir, { recursive: true, force: true })
}
