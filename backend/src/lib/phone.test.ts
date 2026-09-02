import { describe, expect, it } from 'vitest'

import { formatPhone, parseEmail, parsePhone } from './phone'

describe('parsePhone', () => {
  it('accepts a bare 10-digit number and assumes +91', () => {
    expect(parsePhone('9309245800')).toEqual({ digits: '919309245800', e164: '+919309245800' })
  })

  it('drops the leading zero people dial locally', () => {
    expect(parsePhone('09309245800')?.digits).toBe('919309245800')
  })

  it('ignores spaces, dashes and brackets', () => {
    expect(parsePhone('093092 45800')?.digits).toBe('919309245800')
    expect(parsePhone('+91 93092-45800')?.digits).toBe('919309245800')
    expect(parsePhone('(0)93092 45800')?.digits).toBe('919309245800')
  })

  it('leaves a number that already carries 91 alone', () => {
    expect(parsePhone('919309245800')?.digits).toBe('919309245800')
    expect(parsePhone('+919309245800')?.digits).toBe('919309245800')
  })

  it('keeps a foreign number as typed when it came with a plus', () => {
    expect(parsePhone('+44 7911 123456')?.digits).toBe('447911123456')
  })

  it('rejects anything too short or too long to dial', () => {
    expect(parsePhone('12345')).toBeNull()
    expect(parsePhone('9309245800000000')).toBeNull()
    expect(parsePhone('')).toBeNull()
    expect(parsePhone(null)).toBeNull()
    expect(parsePhone('no digits here')).toBeNull()
  })
})

describe('formatPhone', () => {
  it('groups an Indian number for display', () => {
    expect(formatPhone('9309245800')).toBe('+91 93092 45800')
  })

  it('falls back to E.164 for everything else', () => {
    expect(formatPhone('+44 7911 123456')).toBe('+447911123456')
  })

  it('echoes an unparseable value rather than blanking the bill header', () => {
    expect(formatPhone('call the beach shack')).toBe('call the beach shack')
    expect(formatPhone(null)).toBe('')
  })
})

describe('parseEmail', () => {
  it('lowercases and trims a usable address', () => {
    expect(parseEmail('  Guest@Example.COM ')).toBe('guest@example.com')
  })

  it('rejects addresses a bill could never reach', () => {
    for (const bad of ['', 'guest', 'guest@', '@example.com', 'a b@example.com', 'guest@example']) {
      expect(parseEmail(bad)).toBeNull()
    }
    expect(parseEmail(null)).toBeNull()
  })

  it('rejects an absurdly long address', () => {
    expect(parseEmail(`${'a'.repeat(250)}@example.com`)).toBeNull()
  })
})
