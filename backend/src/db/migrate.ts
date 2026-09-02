import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'

import { closeDb, db, isEmbedded } from './index'

const MIGRATIONS_FOLDER = './db/migrations'

async function main() {
  const target = isEmbedded() ? 'embedded Postgres (.data/pg)' : 'DATABASE_URL'
  console.log(`Applying migrations to ${target} ...`)

  // Same folder, same SQL; only the driver-specific runner differs.
  if (isEmbedded()) {
    await migratePglite(db as never, { migrationsFolder: MIGRATIONS_FOLDER })
  } else {
    await migratePostgres(db, { migrationsFolder: MIGRATIONS_FOLDER })
  }

  console.log('Migrations applied.')
}

main()
  .then(async () => {
    await closeDb()
    process.exit(0)
  })
  .catch(async (error) => {
    console.error(error)
    await closeDb()
    process.exit(1)
  })
