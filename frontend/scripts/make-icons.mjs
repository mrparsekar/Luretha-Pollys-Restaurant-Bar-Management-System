/**
 * Generates the app icons. Kept as a script rather than committing only the PNGs
 * so the shape can be changed in one place and regenerated:
 *
 *   node scripts/make-icons.mjs
 *
 * Pure Node - no image library. A PNG is a signature plus three chunks, and the
 * pixel data is a zlib deflate of one filter byte per row followed by RGB
 * triples, so an icon this simple is cheaper to draw by hand than to depend on.
 */
import { deflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'

const NAVY = [15, 23, 42] // slate-900, the app's header colour
const SAND = [245, 185, 66] // the amber the floor board uses for an open tab
const CREAM = [248, 246, 240]

/** 4x4 supersampling: enough to keep the curves clean at 180px. */
const SAMPLES = 4

function roundedSquare(x, y, size, radius) {
  const min = radius
  const max = size - radius
  const cx = x < min ? min : x > max ? max : x
  const cy = y < min ? min : y > max ? max : y
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
}

function mix(under, over, alpha) {
  return under.map((channel, i) => Math.round(channel * (1 - alpha) + over[i] * alpha))
}

/**
 * A sun low over the sea: an amber disc with two cream sandbars across it. Reads
 * at 48px on a home screen, which is the only size that really matters.
 */
function draw(size, pad) {
  const inner = size - pad * 2
  const sun = { cx: size / 2, cy: size * 0.44, r: inner * 0.26 }
  const rows = []

  for (let py = 0; py < size; py++) {
    const row = []
    for (let px = 0; px < size; px++) {
      let bg = 0
      let disc = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = px + (sx + 0.5) / SAMPLES
          const y = py + (sy + 0.5) / SAMPLES
          if (roundedSquare(x - pad, y - pad, inner, inner * 0.22)) bg++
          if ((x - sun.cx) ** 2 + (y - sun.cy) ** 2 <= sun.r ** 2) disc++
        }
      }
      const total = SAMPLES * SAMPLES
      let pixel = mix(CREAM, NAVY, bg / total)
      if (disc > 0) pixel = mix(pixel, SAND, disc / total)

      // Two horizontal bands cut through the lower half of the disc.
      const band = (top, height) =>
        py >= size * top && py < size * top + Math.max(2, size * height)
      if (disc > 0 && (band(0.47, 0.028) || band(0.53, 0.028))) {
        pixel = mix(pixel, NAVY, 0.92)
      }
      row.push(...pixel)
    }
    rows.push(row)
  }
  return rows
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

let table = null
function crc32(buf) {
  if (!table) {
    table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = -1
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function png(size, pad) {
  const rows = draw(size, pad)
  const raw = Buffer.concat(rows.map((row) => Buffer.from([0, ...row])))

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })

// Maskable icons are cropped to a circle by Android, so they get 12% padding.
const targets = [
  ['public/icon-180.png', 180, 0],
  ['public/icon-192.png', 192, 0],
  ['public/icon-512.png', 512, 0],
  ['public/icon-maskable-512.png', 512, 62],
]

for (const [file, size, pad] of targets) {
  const buf = png(size, pad)
  writeFileSync(file, buf)
  const sum = createHash('sha256').update(buf).digest('hex').slice(0, 8)
  console.log(`${file.padEnd(32)} ${size}x${size}  ${String(buf.length).padStart(6)} bytes  ${sum}`)
}
