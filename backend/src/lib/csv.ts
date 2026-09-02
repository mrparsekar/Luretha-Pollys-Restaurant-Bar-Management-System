/**
 * Excel on Windows is the only consumer that matters here, so: CRLF endings, a
 * UTF-8 BOM, and anything that could be read as a formula gets defused.
 */
export function csvCell(value: unknown): string {
  if (value == null) return ''
  const raw = value instanceof Date ? value.toISOString() : String(value)
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(headers: readonly string[], rows: readonly unknown[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))]
  return `﻿${lines.join('\r\n')}\r\n`
}

/** Paise -> plain rupees with two decimals, no separators: spreadsheet friendly. */
export function csvRupees(paise: number): string {
  return (paise / 100).toFixed(2)
}
