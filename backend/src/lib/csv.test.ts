import { describe, expect, it } from 'vitest'

import { csvCell, csvRupees, toCsv } from './csv.js'

describe('csvCell', () => {
  it('renders plain values as-is', () => {
    expect(csvCell('Chicken Cafreal')).toBe('Chicken Cafreal')
    expect(csvCell(42)).toBe('42')
    expect(csvCell(0)).toBe('0')
    expect(csvCell(false)).toBe('false')
  })

  it('blanks null and undefined instead of printing the word', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('quotes and doubles up embedded quotes', () => {
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""')
  })

  it('quotes anything containing a comma or a line break', () => {
    expect(csvCell('Prawns, butter garlic')).toBe('"Prawns, butter garlic"')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('defuses values Excel would read as a formula', () => {
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('+91 9309245800')).toBe("'+91 9309245800")
    expect(csvCell('-5')).toBe("'-5")
    expect(csvCell('@handle')).toBe("'@handle")
  })

  it('writes a date as an ISO timestamp', () => {
    expect(csvCell(new Date('2026-09-02T14:00:00.000Z'))).toBe('2026-09-02T14:00:00.000Z')
  })
})

describe('toCsv', () => {
  const csv = toCsv(['Item', 'Qty', 'Amount'], [
    ['Old Monk (60ml)', 2, '260.00'],
    ['Prawns, fried', 1, '450.00'],
  ])

  it('opens with a UTF-8 BOM so Excel gets the encoding right', () => {
    expect(csv.startsWith('\ufeff')).toBe(true)
  })

  it('uses CRLF endings and ends with one', () => {
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(3)
  })

  it('writes the header row first', () => {
    expect(csv.slice(1).split('\r\n')[0]).toBe('Item,Qty,Amount')
  })

  it('escapes cells inside rows', () => {
    expect(csv).toContain('"Prawns, fried",1,450.00')
  })

  it('still produces a header-only file for an empty report', () => {
    expect(toCsv(['Date', 'Total'], [])).toBe('\ufeffDate,Total\r\n')
  })
})

describe('csvRupees', () => {
  it('writes paise as plain rupees with two decimals and no separators', () => {
    expect(csvRupees(62_100)).toBe('621.00')
    expect(csvRupees(123_456)).toBe('1234.56')
    expect(csvRupees(0)).toBe('0.00')
    expect(csvRupees(-6_900)).toBe('-69.00')
  })
})
