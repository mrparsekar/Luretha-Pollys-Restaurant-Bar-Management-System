import type {
  AuditRow,
  BillView,
  DeliveryOutcome,
  DeliveryRow,
  DiningTable,
  FloorTable,
  KitchenTicket,
  LoginStaff,
  MailStatus,
  MenuCategory,
  OrderDetail,
  OrderSummary,
  PaymentMode,
  ReportSummary,
  Settings,
  StaffMember,
  User,
  VerificationSection,
} from './types'

const BASE = import.meta.env.VITE_API_BASE || '/api'

/**
 * The API answers every failure as { error: { code, message } } where `message`
 * is already written for staff to read, so the UI can show it as-is instead of
 * inventing its own wording.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** Set by the auth provider so any 401 anywhere drops straight back to login. */
let onUnauthorised: (() => void) | null = null
export function setUnauthorisedHandler(handler: (() => void) | null): void {
  onUnauthorised = handler
}

type Options = { signal?: AbortSignal; raw?: boolean }

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: Options = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      // The session is an httpOnly cookie; without this it is never sent.
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(options.signal ? { signal: options.signal } : {}),
    })
  } catch (cause) {
    // Beach Wi-Fi drops. Say so plainly rather than showing "Failed to fetch".
    throw new ApiError(0, 'offline', 'No connection. Check the Wi-Fi and try again.', cause)
  }

  if (response.status === 401 && !path.startsWith('/auth/')) onUnauthorised?.()

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'error',
      error?.message ?? `Request failed (${response.status}).`,
      error?.details,
    )
  }

  return payload as T
}

const get = <T>(path: string, options?: Options) => request<T>('GET', path, undefined, options)
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body)
const patch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, body)
const del = <T>(path: string) => request<T>('DELETE', path)

export type NewLine = {
  menuItemId: number
  variantId?: number | null
  qty: number
  note?: string | null
  /** Only for ask-for-price items: what the waiter keyed in, in paise. */
  unitPricePaise?: number | null
}

export const api = {
  auth: {
    me: () => get<{ user: User | null }>('/auth/me'),
    loginStaff: () => get<{ staff: LoginStaff[] }>('/auth/staff'),
    pin: (staffId: number, pin: string) => post<{ user: User }>('/auth/pin', { staffId, pin }),
    owner: (email: string, password: string) =>
      post<{ user: User }>('/auth/owner', { email, password }),
    logout: () => post<{ ok: true }>('/auth/logout'),
  },

  settings: {
    get: () => get<{ settings: Settings; mail?: MailStatus }>('/settings'),
    update: (patchBody: Partial<Settings>) =>
      patch<{ settings: Settings }>('/settings', patchBody),
  },

  menu: {
    get: () => get<{ menu: MenuCategory[] }>('/menu'),
    verificationSheet: () => get<{ sections: VerificationSection[] }>('/menu/verification-sheet'),
    updateItem: (id: number, body: Record<string, unknown>) =>
      patch<{ item: unknown }>(`/menu/items/${id}`, body),
    createItem: (body: Record<string, unknown>) => post<{ item: unknown }>('/menu/items', body),
    deleteItem: (id: number) => del<{ ok: true }>(`/menu/items/${id}`),
    addVariant: (itemId: number, body: Record<string, unknown>) =>
      post<{ variant: unknown }>(`/menu/items/${itemId}/variants`, body),
    updateVariant: (id: number, body: Record<string, unknown>) =>
      patch<{ variant: unknown }>(`/menu/variants/${id}`, body),
    deleteVariant: (id: number) => del<{ ok: true }>(`/menu/variants/${id}`),
    categories: () => get<{ categories: unknown[] }>('/menu/categories'),
  },

  tables: {
    floor: (options?: Options) => get<{ tables: FloorTable[] }>('/tables/floor', options),
    list: (all = false) => get<{ tables: DiningTable[] }>(`/tables${all ? '?all=1' : ''}`),
    waiters: () => get<{ waiters: { id: number; name: string }[] }>('/tables/waiters'),
    create: (body: Record<string, unknown>) => post<{ table: DiningTable }>('/tables', body),
    update: (id: number, body: Record<string, unknown>) =>
      patch<{ table: DiningTable }>(`/tables/${id}`, body),
  },

  orders: {
    running: (options?: Options) => get<{ orders: OrderSummary[] }>('/orders/running', options),
    list: (query: { status?: string; date?: string; waiterId?: number } = {}) => {
      const params = new URLSearchParams()
      if (query.status) params.set('status', query.status)
      if (query.date) params.set('date', query.date)
      if (query.waiterId) params.set('waiterId', String(query.waiterId))
      const suffix = params.toString()
      return get<{ orders: OrderSummary[] }>(`/orders${suffix ? `?${suffix}` : ''}`)
    },
    kitchen: (group?: 'bar' | 'kitchen', options?: Options) =>
      get<{ tickets: KitchenTicket[] }>(`/orders/kitchen${group ? `?group=${group}` : ''}`, options),
    detail: (id: number, options?: Options) => get<OrderDetail>(`/orders/${id}`, options),
    open: (body: {
      orderType?: 'dine_in' | 'takeaway'
      diningTableId?: number | null
      guests?: number
      guestName?: string | null
    }) => post<{ order: OrderSummary }>('/orders', body),
    addItems: (id: number, items: NewLine[]) =>
      post<{ order: OrderSummary; roundNo: number }>(`/orders/${id}/items`, { items }),
    voidItem: (id: number, itemId: number, reason: string) =>
      post<{ order: OrderSummary }>(`/orders/${id}/items/${itemId}/void`, { reason }),
    serveItem: (id: number, itemId: number) =>
      post<{ ok: true }>(`/orders/${id}/items/${itemId}/served`),
    updateGuest: (
      id: number,
      body: {
        guestName?: string | null
        guestPhone?: string | null
        guestEmail?: string | null
        guests?: number
        notes?: string | null
      },
    ) => patch<{ order: OrderSummary }>(`/orders/${id}/guest`, body),
    setDiscount: (id: number, discountType: 'none' | 'amount' | 'percent', discountValue: number) =>
      post<{ order: OrderSummary }>(`/orders/${id}/discount`, { discountType, discountValue }),
    markBilled: (id: number) =>
      post<{ order: OrderSummary; bill: BillView }>(`/orders/${id}/bill`),
    settle: (
      id: number,
      body: {
        paymentMode: PaymentMode
        guestName?: string | null
        guestPhone?: string | null
        guestEmail?: string | null
      },
    ) => post<{ order: OrderSummary; bill: BillView }>(`/orders/${id}/settle`, body),
    voidOrder: (id: number, reason: string) =>
      post<{ order: OrderSummary }>(`/orders/${id}/void`, { reason }),
    changeTable: (id: number, diningTableId: number) =>
      post<{ order: OrderSummary }>(`/orders/${id}/table`, { diningTableId }),
  },

  bills: {
    public: (token: string, options?: Options) =>
      get<{ bill: BillView }>(`/bills/public/${token}`, options),
    whatsapp: (id: number, phone: string) =>
      post<{ delivery: DeliveryOutcome }>(`/bills/${id}/whatsapp`, { phone }),
    email: (id: number, email: string) =>
      post<{ delivery: DeliveryOutcome }>(`/bills/${id}/email`, { email }),
    deliveries: (id: number, options?: Options) =>
      get<{ deliveries: DeliveryRow[] }>(`/bills/${id}/deliveries`, options),
    upiQr: (id: number) => get<{ dataUrl: string; payUrl: string }>(`/bills/${id}/upi-qr`),
  },

  reports: {
    summary: (range: { from?: string; to?: string } = {}) =>
      get<ReportSummary>(`/reports/summary${rangeQuery(range)}`),
    audit: (query: { limit?: number; action?: string } = {}) => {
      const params = new URLSearchParams()
      if (query.limit) params.set('limit', String(query.limit))
      if (query.action) params.set('action', query.action)
      const suffix = params.toString()
      return get<{ entries: AuditRow[] }>(`/reports/audit${suffix ? `?${suffix}` : ''}`)
    },
    /** CSV is a file download, so it goes through the browser, not fetch. */
    exportUrl: (
      type: 'orders' | 'items' | 'daily' | 'categories' | 'waiters' | 'hours',
      range: { from?: string; to?: string },
    ) => {
      const params = new URLSearchParams({ type })
      if (range.from) params.set('from', range.from)
      if (range.to) params.set('to', range.to)
      return `${BASE}/reports/export?${params.toString()}`
    },
  },

  staff: {
    list: () => get<{ staff: StaffMember[] }>('/staff'),
    create: (body: {
      name: string
      role: 'owner' | 'waiter'
      email?: string | null
      password?: string | null
      pin?: string | null
    }) => post<{ member: StaffMember }>('/staff', body),
    update: (
      id: number,
      body: { name?: string; email?: string | null; isActive?: boolean; role?: 'owner' | 'waiter' },
    ) => patch<{ member: StaffMember }>(`/staff/${id}`, body),
    setPin: (id: number, pin: string) => post<{ ok: true }>(`/staff/${id}/pin`, { pin }),
    setPassword: (id: number, password: string) =>
      post<{ ok: true }>(`/staff/${id}/password`, { password }),
    unlock: (id: number) => post<{ ok: true }>(`/staff/${id}/unlock`),
  },
}

function rangeQuery(range: { from?: string; to?: string }): string {
  const params = new URLSearchParams()
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  const suffix = params.toString()
  return suffix ? `?${suffix}` : ''
}
