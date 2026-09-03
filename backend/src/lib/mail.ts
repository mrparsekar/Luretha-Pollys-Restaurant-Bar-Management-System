import nodemailer, { type Transporter } from 'nodemailer'

import { env, mailEnabled } from '../env.js'

let transporter: Transporter | null = null

function get(): Transporter | null {
  if (!mailEnabled) return null
  transporter ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  })
  return transporter
}

export type MailInput = {
  to: string
  subject: string
  html: string
  text: string
}

export type MailResult = { ok: true; id: string } | { ok: false; error: string }

/**
 * Email is optional: with SMTP_HOST empty the bill still goes out on WhatsApp and
 * the public link, so a missing mail account must never break settling a bill.
 */
export async function sendMail(input: MailInput): Promise<MailResult> {
  const mailer = get()
  if (!mailer) return { ok: false, error: 'Email is not configured (SMTP_HOST is empty).' }

  try {
    const info = await mailer.sendMail({
      from: env.smtp.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    })
    return { ok: true, id: info.messageId }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[mail] send failed:', message)
    return { ok: false, error: message }
  }
}

export function mailStatus(): { enabled: boolean; host: string; from: string } {
  return { enabled: mailEnabled, host: env.smtp.host, from: env.smtp.from }
}
