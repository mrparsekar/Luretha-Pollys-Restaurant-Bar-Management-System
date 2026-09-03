import { describe, expect, it } from 'vitest'

import {
  businessDate,
  dateRange,
  dateStringLabel,
  formatClock,
  isDateString,
  istDateLabel,
  istDateString,
  istTimeLabel,
  istTimeString,
  isWithinWindow,
  IST_OFFSET_MINUTES,
} from './time.js'

/**
 * Every case here is written as an explicit UTC instant, which is the whole point:
 * the assertions hold no matter what timezone the machine running them is in.
 */
const utc = (iso: string) => new Date(`${iso}Z`)

describe('IST conversion', () => {
  it('is a fixed +05:30, since India has no DST', () => {
    expect(IST_OFFSET_MINUTES).toBe(330)
  })

  it('reads the IST calendar date, not the host one', () => {
    // 20:00 UTC is already the next day in Goa.
    expect(istDateString(utc('2026-09-02T20:00:00'))).toBe('2026-09-03')
    expect(istDateString(utc('2026-09-02T18:29:59'))).toBe('2026-09-02')
    expect(istDateString(utc('2026-09-02T18:30:00'))).toBe('2026-09-03')
  })

  it('reads the IST wall clock', () => {
    expect(istTimeString(utc('2026-09-02T14:00:00'))).toBe('19:30:00')
    expect(istTimeLabel(utc('2026-09-02T14:00:00'))).toBe('7:30 PM')
  })

  it('labels a date the way a bill header should read', () => {
    expect(istDateLabel(utc('2026-09-02T00:29:00'))).toBe('02 Sep 2026')
    expect(istDateLabel(utc('2026-01-31T23:00:00'))).toBe('01 Feb 2026')
  })
})

describe('businessDate', () => {
  it('rolls at the configured hour, so a late close stays on one sheet', () => {
    // 05:59 IST, still the previous night's takings.
    expect(businessDate(utc('2026-09-02T00:29:00'), 6)).toBe('2026-09-01')
    // 06:00 IST, a new day.
    expect(businessDate(utc('2026-09-02T00:30:00'), 6)).toBe('2026-09-02')
  })

  it('defaults to a 6am roll', () => {
    expect(businessDate(utc('2026-09-02T00:29:00'))).toBe('2026-09-01')
  })

  it('rolls back across a month end', () => {
    // 02:00 IST on 1 Sep belongs to 31 Aug.
    expect(businessDate(utc('2026-08-31T20:30:00'), 6)).toBe('2026-08-31')
  })

  it('rolls back across a year end', () => {
    // 01:00 IST on 1 Jan 2027 belongs to 31 Dec 2026.
    expect(businessDate(utc('2026-12-31T19:30:00'), 6)).toBe('2026-12-31')
  })

  it('honours a different start hour', () => {
    const at = utc('2026-09-02T02:00:00') // 07:30 IST
    expect(businessDate(at, 6)).toBe('2026-09-02')
    expect(businessDate(at, 9)).toBe('2026-09-01')
  })

  it('never rolls when the start hour is midnight', () => {
    expect(businessDate(utc('2026-09-01T18:31:00'), 0)).toBe('2026-09-02')
  })

  it('keeps the whole 9am-10pm service on one business date', () => {
    const open = businessDate(utc('2026-09-02T03:30:00'), 6) // 09:00 IST
    const close = businessDate(utc('2026-09-02T16:30:00'), 6) // 22:00 IST
    expect(open).toBe('2026-09-02')
    expect(close).toBe(open)
  })
})

describe('isWithinWindow', () => {
  const inGoa = (hhmm: string) => {
    // Build the UTC instant for a given IST wall clock on 2 Sep 2026.
    const [h, m] = hhmm.split(':').map(Number)
    return new Date(Date.UTC(2026, 8, 2, h!, m!) - IST_OFFSET_MINUTES * 60_000)
  }

  it('is always open when both bounds are null', () => {
    expect(isWithinWindow(null, null, inGoa('03:00'))).toBe(true)
    expect(isWithinWindow(undefined, undefined, inGoa('15:00'))).toBe(true)
  })

  it('gates the 7pm-10pm steak', () => {
    expect(isWithinWindow('19:00:00', '22:00:00', inGoa('18:59'))).toBe(false)
    expect(isWithinWindow('19:00:00', '22:00:00', inGoa('19:00'))).toBe(true)
    expect(isWithinWindow('19:00:00', '22:00:00', inGoa('21:59'))).toBe(true)
    expect(isWithinWindow('19:00:00', '22:00:00', inGoa('22:00'))).toBe(true)
    expect(isWithinWindow('19:00:00', '22:00:00', inGoa('22:01'))).toBe(false)
  })

  it('handles a window that wraps past midnight', () => {
    expect(isWithinWindow('22:00', '02:00', inGoa('23:30'))).toBe(true)
    expect(isWithinWindow('22:00', '02:00', inGoa('01:30'))).toBe(true)
    expect(isWithinWindow('22:00', '02:00', inGoa('12:00'))).toBe(false)
  })

  it('treats one open end as from-then-on or until-then', () => {
    expect(isWithinWindow('19:00', null, inGoa('20:00'))).toBe(true)
    expect(isWithinWindow('19:00', null, inGoa('10:00'))).toBe(false)
    expect(isWithinWindow(null, '11:00', inGoa('10:00'))).toBe(true)
    expect(isWithinWindow(null, '11:00', inGoa('12:00'))).toBe(false)
  })

  it('stays open rather than hiding an item when the stored time is junk', () => {
    expect(isWithinWindow('nonsense', 'also nonsense', inGoa('15:00'))).toBe(true)
    expect(isWithinWindow('99:99', null, inGoa('15:00'))).toBe(true)
  })
})

describe('formatClock', () => {
  it('turns a 24h stored time into what the waiter is shown', () => {
    expect(formatClock('19:00:00')).toBe('7:00 PM')
    expect(formatClock('22:00')).toBe('10:00 PM')
    expect(formatClock('09:30:00')).toBe('9:30 AM')
    expect(formatClock('00:00')).toBe('12:00 AM')
    expect(formatClock('12:05')).toBe('12:05 PM')
  })

  it('returns nothing for an absent or unusable time', () => {
    expect(formatClock(null)).toBe('')
    expect(formatClock('')).toBe('')
    expect(formatClock('later')).toBe('')
  })
})

describe('date helpers', () => {
  it('labels a stored date string', () => {
    expect(dateStringLabel('2026-09-02')).toBe('02 Sep 2026')
    expect(dateStringLabel('2026-12-31')).toBe('31 Dec 2026')
  })

  it('passes anything that is not a date straight through', () => {
    expect(dateStringLabel('all time')).toBe('all time')
    expect(dateStringLabel('2026-13-02')).toBe('2026-13-02')
  })

  it('fills a report range inclusively and in order', () => {
    expect(dateRange('2026-09-01', '2026-09-03')).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
    expect(dateRange('2026-09-02', '2026-09-02')).toEqual(['2026-09-02'])
  })

  it('spans a month boundary', () => {
    expect(dateRange('2026-08-30', '2026-09-01')).toEqual(['2026-08-30', '2026-08-31', '2026-09-01'])
  })

  it('returns nothing for a backwards or unparseable range', () => {
    expect(dateRange('2026-09-03', '2026-09-01')).toEqual([])
    expect(dateRange('not a date', '2026-09-01')).toEqual([])
  })

  it('caps a very long range instead of building forever', () => {
    expect(dateRange('2000-01-01', '2030-01-01')).toHaveLength(400)
  })

  it('validates date strings', () => {
    expect(isDateString('2026-09-02')).toBe(true)
    expect(isDateString('2024-02-29')).toBe(true)
    expect(isDateString('2026-9-2')).toBe(false)
    expect(isDateString('2026-02-30')).toBe(false)
    expect(isDateString('2026-13-01')).toBe(false)
    expect(isDateString('')).toBe(false)
  })
})
