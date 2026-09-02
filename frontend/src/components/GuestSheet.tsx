import { useState } from 'react'
import type { ReactNode } from 'react'

import { Button, ErrorNote, Field, Input, Sheet } from './ui'
import { api } from '../lib/api'
import { useAction } from '../lib/hooks'

export type GuestFields = { guestName: string; guestPhone: string; guestEmail: string }

/**
 * Name, phone and email on the tab. The phone is what the WhatsApp bill goes to,
 * so it is worth asking for while the guest is still at the table rather than at
 * the counter with a queue behind them.
 */
export function GuestSheet({
  open,
  onClose,
  orderId,
  initial,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  orderId: number
  initial: GuestFields
  onSaved: () => void
}): ReactNode {
  const [fields, setFields] = useState<GuestFields>(initial)
  const action = useAction()

  const save = async () => {
    const result = await action.run(() =>
      api.orders.updateGuest(orderId, {
        guestName: fields.guestName.trim() || null,
        guestPhone: fields.guestPhone.trim() || null,
        guestEmail: fields.guestEmail.trim() || null,
      }),
    )
    if (result) onSaved()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Guest details">
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      <div className="space-y-3">
        <Field label="Name">
          <Input
            value={fields.guestName}
            onChange={(event) => setFields({ ...fields, guestName: event.target.value })}
            maxLength={80}
          />
        </Field>
        <Field label="Phone" hint="For the WhatsApp bill. A 10 digit number is enough.">
          <Input
            value={fields.guestPhone}
            onChange={(event) => setFields({ ...fields, guestPhone: event.target.value })}
            inputMode="tel"
            maxLength={20}
            placeholder="9309245800"
          />
        </Field>
        <Field label="Email" hint="Optional. Used only to send this bill.">
          <Input
            type="email"
            value={fields.guestEmail}
            onChange={(event) => setFields({ ...fields, guestEmail: event.target.value })}
            maxLength={254}
          />
        </Field>
      </div>

      <Button size="lg" block className="mt-4" disabled={action.busy} onClick={save}>
        {action.busy ? 'Saving…' : 'Save'}
      </Button>
    </Sheet>
  )
}
