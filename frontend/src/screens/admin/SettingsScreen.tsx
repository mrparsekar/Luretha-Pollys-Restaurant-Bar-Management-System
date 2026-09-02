import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { AppShell } from '../../components/AppShell'
import { Button, Card, ErrorNote, Field, Input, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { parseRupees } from '../../lib/format'
import { useAction, useAsync } from '../../lib/hooks'
import type { Settings } from '../../lib/types'
import { useAuth } from '../../state/auth'

type Form = {
  restaurantName: string
  tagline: string
  address: string
  phonePrimary: string
  phoneSecondary: string
  instagram: string
  upiId: string
  upiPayeeName: string
  reviewUrl: string
  billFooter: string
  taxEnabled: boolean
  foodTax: string
  liquorTax: string
  serviceCharge: string
  dayStart: string
}

/** "5" and "2.5" both become basis points, which is how the API stores a rate. */
function toBps(text: string): number | null {
  if (text.trim() === '') return 0
  const bps = parseRupees(text.trim())
  return bps === null || bps > 10_000 ? null : bps
}

function fromSettings(row: Settings): Form {
  return {
    restaurantName: row.restaurantName,
    tagline: row.tagline ?? '',
    address: row.address ?? '',
    phonePrimary: row.phonePrimary ?? '',
    phoneSecondary: row.phoneSecondary ?? '',
    instagram: row.instagram ?? '',
    upiId: row.upiId ?? '',
    upiPayeeName: row.upiPayeeName ?? '',
    reviewUrl: row.reviewUrl ?? '',
    billFooter: row.billFooter ?? '',
    taxEnabled: row.taxEnabled,
    foodTax: String(row.foodTaxBps / 100),
    liquorTax: String(row.liquorTaxBps / 100),
    serviceCharge: String(row.serviceChargeBps / 100),
    dayStart: String(row.businessDayStartHour),
  }
}

/**
 * Everything that prints on a bill, plus the tax switch. Tax is off out of the box
 * because the client bills without it today; turning it on here changes the bill
 * from the next order on, with no rebuild.
 */
export default function SettingsScreen(): ReactNode {
  const { refreshSettings } = useAuth()
  const state = useAsync(() => api.settings.get(), [])
  const action = useAction()
  const [form, setForm] = useState<Form | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (state.data) setForm(fromSettings(state.data.settings))
  }, [state.data])

  const set = (patch: Partial<Form>) => {
    setForm((current) => (current ? { ...current, ...patch } : current))
    setSaved(false)
  }

  const rates = form
    ? {
        foodTaxBps: toBps(form.foodTax),
        liquorTaxBps: toBps(form.liquorTax),
        serviceChargeBps: toBps(form.serviceCharge),
      }
    : null
  const ratesOk = rates
    ? rates.foodTaxBps !== null && rates.liquorTaxBps !== null && rates.serviceChargeBps !== null
    : false

  const save = async () => {
    if (!form || !rates || !ratesOk) return
    const result = await action.run(() =>
      api.settings.update({
        restaurantName: form.restaurantName.trim(),
        tagline: form.tagline.trim() || null,
        address: form.address.trim() || null,
        phonePrimary: form.phonePrimary.trim() || null,
        phoneSecondary: form.phoneSecondary.trim() || null,
        instagram: form.instagram.trim() || null,
        upiId: form.upiId.trim() || null,
        upiPayeeName: form.upiPayeeName.trim() || null,
        reviewUrl: form.reviewUrl.trim() || null,
        billFooter: form.billFooter.trim() || null,
        taxEnabled: form.taxEnabled,
        foodTaxBps: rates.foodTaxBps ?? 0,
        liquorTaxBps: rates.liquorTaxBps ?? 0,
        serviceChargeBps: rates.serviceChargeBps ?? 0,
        businessDayStartHour: Number(form.dayStart) || 0,
      }),
    )
    if (result) {
      setForm(fromSettings(result.settings))
      setSaved(true)
      refreshSettings()
    }
  }
  return (
    <AppShell title="Settings" subtitle="What prints on the bill">
      {state.loading && !form ? <Spinner label="Loading settings" /> : null}
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      {form ? (
        <div className="space-y-4">
          <Card className="grid gap-3">
            <Field label="Restaurant name">
              <Input
                value={form.restaurantName}
                onChange={(event) => set({ restaurantName: event.target.value })}
                maxLength={120}
              />
            </Field>
            <Field label="Tagline">
              <Input
                value={form.tagline}
                onChange={(event) => set({ tagline: event.target.value })}
                maxLength={120}
              />
            </Field>
            <Field label="Address">
              <Input
                value={form.address}
                onChange={(event) => set({ address: event.target.value })}
                maxLength={300}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <Input
                  value={form.phonePrimary}
                  onChange={(event) => set({ phonePrimary: event.target.value })}
                  inputMode="tel"
                  maxLength={20}
                />
              </Field>
              <Field label="Second phone">
                <Input
                  value={form.phoneSecondary}
                  onChange={(event) => set({ phoneSecondary: event.target.value })}
                  inputMode="tel"
                  maxLength={20}
                />
              </Field>
            </div>
            <Field label="Instagram" hint="Handle only, without the @.">
              <Input
                value={form.instagram}
                onChange={(event) => set({ instagram: event.target.value })}
                maxLength={60}
              />
            </Field>
          </Card>
          <Card className="grid gap-3">
            <h2 className="text-sm font-bold">Payment &amp; bill</h2>
            <Field label="UPI id" hint="The QR on the settle screen is built from this.">
              <Input
                value={form.upiId}
                onChange={(event) => set({ upiId: event.target.value })}
                placeholder="name@bank"
                maxLength={120}
              />
            </Field>
            <Field label="UPI payee name">
              <Input
                value={form.upiPayeeName}
                onChange={(event) => set({ upiPayeeName: event.target.value })}
                maxLength={60}
              />
            </Field>
            <Field label="Review link" hint="Added to the WhatsApp bill and the guest page.">
              <Input
                value={form.reviewUrl}
                onChange={(event) => set({ reviewUrl: event.target.value })}
                inputMode="url"
                maxLength={400}
              />
            </Field>
            <Field label="Bill footer">
              <Input
                value={form.billFooter}
                onChange={(event) => set({ billFooter: event.target.value })}
                maxLength={300}
                placeholder="Thank you, come again!"
              />
            </Field>
          </Card>
          <Card className="grid gap-3">
            <h2 className="text-sm font-bold">Tax</h2>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Charge tax on bills</span>
              <input
                type="checkbox"
                checked={form.taxEnabled}
                onChange={(event) => set({ taxEnabled: event.target.checked })}
                className="size-6 accent-ink"
              />
            </label>
            <p className="text-xs text-slate-500">
              Off today, matching how the restaurant bills now. Switch it on and the next bill shows
              tax as its own line.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Food %">
                <Input
                  value={form.foodTax}
                  onChange={(event) => set({ foodTax: event.target.value })}
                  inputMode="decimal"
                />
              </Field>
              <Field label="Liquor %">
                <Input
                  value={form.liquorTax}
                  onChange={(event) => set({ liquorTax: event.target.value })}
                  inputMode="decimal"
                />
              </Field>
              <Field label="Service %">
                <Input
                  value={form.serviceCharge}
                  onChange={(event) => set({ serviceCharge: event.target.value })}
                  inputMode="decimal"
                />
              </Field>
            </div>
            {!ratesOk ? (
              <p className="text-xs font-semibold text-nonveg">
                Rates must be a number between 0 and 100.
              </p>
            ) : null}
            <Field label="Business day starts at" hint="Hour of the clock. 9 means the day rolls over at 9am.">
              <Input
                value={form.dayStart}
                onChange={(event) => set({ dayStart: event.target.value.replace(/\D/g, '') })}
                inputMode="numeric"
                maxLength={2}
              />
            </Field>
          </Card>
          {state.data?.mail ? (
            <p className="text-xs text-slate-500">
              Email:{' '}
              {state.data.mail.configured
                ? `sending as ${state.data.mail.from ?? 'the configured address'}`
                : 'not configured yet, so emailed bills will fail.'}
            </p>
          ) : null}

          <Button size="lg" block disabled={action.busy || !ratesOk} onClick={save}>
            {action.busy ? 'Saving…' : 'Save settings'}
          </Button>
          {saved ? (
            <p className="text-center text-xs font-semibold text-green-700">Saved.</p>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  )
}
