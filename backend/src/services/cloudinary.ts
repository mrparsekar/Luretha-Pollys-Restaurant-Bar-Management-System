import { createHash } from 'node:crypto'

import { env } from '../env.js'

type CloudinaryConfig = { cloudName: string; apiKey: string; apiSecret: string }

function config(): CloudinaryConfig {
  if (!env.cloudinaryUrl) throw new Error('CLOUDINARY_URL is not configured.')
  const parsed = new URL(env.cloudinaryUrl)
  const apiKey = decodeURIComponent(parsed.username)
  const apiSecret = decodeURIComponent(parsed.password)
  if (!apiKey || !apiSecret || !parsed.hostname) throw new Error('CLOUDINARY_URL is invalid.')
  return { cloudName: parsed.hostname, apiKey, apiSecret }
}

function signature(params: Record<string, string>, apiSecret: string): string {
  const canonical = Object.entries(params)
    .filter(([, value]) => value.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
  return createHash('sha1').update(`${canonical}${apiSecret}`).digest('hex')
}

export type CloudinaryImage = { secureUrl: string; publicId: string }

export async function uploadSpecialImage(dataUrl: string, index: number): Promise<CloudinaryImage> {
  const { cloudName, apiKey, apiSecret } = config()
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const publicId = `${Date.now()}-${index}`
  const params = { folder: 'todays-special', public_id: publicId, timestamp }
  const form = new FormData()
  form.append('file', dataUrl)
  form.append('api_key', apiKey)
  form.append('timestamp', timestamp)
  form.append('folder', params.folder)
  form.append('public_id', publicId)
  form.append('signature', signature(params, apiSecret))

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  })
  const payload = (await response.json()) as { secure_url?: string; public_id?: string; error?: { message?: string } }
  if (!response.ok || !payload.secure_url || !payload.public_id) {
    throw new Error(payload.error?.message ?? 'Cloudinary image upload failed.')
  }
  return { secureUrl: payload.secure_url, publicId: payload.public_id }
}

export async function deleteSpecialImage(publicId: string): Promise<void> {
  const { cloudName, apiKey, apiSecret } = config()
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const params = { public_id: publicId, timestamp }
  const form = new FormData()
  form.append('public_id', publicId)
  form.append('timestamp', timestamp)
  form.append('api_key', apiKey)
  form.append('invalidate', 'true')
  form.append('signature', signature(params, apiSecret))
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, { method: 'POST', body: form })
  if (!response.ok) throw new Error(`Cloudinary image deletion failed (${response.status}).`)
}
