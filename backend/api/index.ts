import app from '../src/app.js'

// Vercel invokes the Express app as a serverless function for /api/* requests.
// Local development continues to use src/index.ts and app.listen().
export default app

// vercel.json's builds[].config.maxDuration was silently ignored - exporting
// it here is the form Vercel's Node runtime actually honors. Without this a
// stuck request runs for the platform's full default (300s) instead of
// failing fast, holding up the one DB connection (max:1) for everything else
// queued behind it on the same warm instance.
export const config = { maxDuration: 20 }
