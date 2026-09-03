import type { tableSection } from '../schema.js'

type Section = (typeof tableSection)['enumValues'][number]

export type SeedTable = { label: string; section: Section; seats: number }

/**
 * A starting floor plan, not gospel: the owner adds, renames and retires tables
 * from the admin screen. Labels are what the waiters already say out loud, so
 * indoor tables are T-numbers, the garden is G and the sand is B.
 */
export const SEED_TABLES: SeedTable[] = [
  { label: 'T1', section: 'indoor', seats: 4 },
  { label: 'T2', section: 'indoor', seats: 4 },
  { label: 'T3', section: 'indoor', seats: 4 },
  { label: 'T4', section: 'indoor', seats: 6 },
  { label: 'T5', section: 'indoor', seats: 6 },
  { label: 'T6', section: 'indoor', seats: 2 },
  { label: 'G1', section: 'garden', seats: 4 },
  { label: 'G2', section: 'garden', seats: 4 },
  { label: 'G3', section: 'garden', seats: 4 },
  { label: 'G4', section: 'garden', seats: 6 },
  { label: 'Beach 1', section: 'beach', seats: 4 },
  { label: 'Beach 2', section: 'beach', seats: 4 },
  { label: 'Beach 3', section: 'beach', seats: 4 },
  { label: 'Beach 4', section: 'beach', seats: 4 },
  { label: 'Beach 5', section: 'beach', seats: 6 },
  { label: 'Beach 6', section: 'beach', seats: 6 },
]
