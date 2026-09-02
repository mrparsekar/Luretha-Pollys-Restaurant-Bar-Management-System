import { useState } from 'react'
import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'

import { BillPaper, usePrintMode } from '../components/BillPaper'
import { Button, ErrorNote, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'

/**
 * The page the WhatsApp link opens. No login: the 128-bit token is the credential
 * and it shows one bill and nothing else. Guests open this on their own phone, so
 * it has to stand on its own without the app's chrome.
 */
export default function PublicBill(): ReactNode {
  const { token } = useParams()
  const state = useAsync(
    (signal) => api.bills.public(token ?? '', { signal }),
    [token],
  )
  const [mode, setMode] = useState<'receipt' | 'a4'>('a4')
  usePrintMode(mode)

  return (
    <div className="min-h-dvh bg-cream px-3 py-5">
      {state.loading ? <Spinner label="Loading bill" /> : null}
      {state.error ? (
        <div className="mx-auto max-w-md">
          <ErrorNote
            message={
              state.error.status === 404
                ? 'This bill link is not valid any more. Ask the restaurant to send it again.'
                : state.error.message
            }
            onRetry={state.reload}
          />
        </div>
      ) : null}

      {state.data ? (
        <div className="space-y-4">
          <BillPaper bill={state.data.bill} />
          <div className="no-print mx-auto flex max-w-md gap-2">
            <Button variant="secondary" block onClick={() => window.print()}>
              Print or save as PDF
            </Button>
            <Button
              variant="ghost"
              onClick={() => setMode(mode === 'a4' ? 'receipt' : 'a4')}
              className="shrink-0"
            >
              {mode === 'a4' ? 'Roll' : 'A4'}
            </Button>
          </div>
          {state.data.bill.reviewUrl ? (
            <p className="no-print text-center text-sm">
              <a
                href={state.data.bill.reviewUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold underline"
              >
                Leave us a review
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
