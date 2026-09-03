import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler, intParam, parseBody } from '../lib/http.js'
import { requireAuth, requireOwner } from '../middleware/auth.js'
import { createTable, getFloor, listTables, listWaiters, updateTable } from '../services/tables.js'

export const tableRouter = Router()

tableRouter.use(requireAuth)

/** The waiter's home screen: every table tinted by what is running on it. */
tableRouter.get(
  '/floor',
  asyncHandler(async (_req, res) => {
    res.json({ tables: await getFloor() })
  }),
)

tableRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.all === '1' && req.session?.role === 'owner'
    res.json({ tables: await listTables(includeInactive) })
  }),
)

tableRouter.get(
  '/waiters',
  requireOwner,
  asyncHandler(async (_req, res) => {
    res.json({ waiters: await listWaiters() })
  }),
)

const tableBody = z.object({
  label: z.string().trim().min(1).max(30),
  section: z.enum(['indoor', 'garden', 'beach']).optional(),
  seats: z.number().int().min(1).max(40).optional(),
  sort: z.number().int().min(0).max(9999).optional(),
})

tableRouter.post(
  '/',
  requireOwner,
  asyncHandler(async (req, res) => {
    res.status(201).json({ table: await createTable(parseBody(tableBody, req.body)) })
  }),
)

tableRouter.patch(
  '/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(tableBody.partial().extend({ isActive: z.boolean().optional() }), req.body)
    res.json({ table: await updateTable(intParam(req.params.id), body) })
  }),
)
