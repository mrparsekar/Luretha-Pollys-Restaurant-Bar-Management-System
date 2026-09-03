import { createApp } from '../src/app'

// Vercel invokes the Express app as a serverless function for /api/* requests.
// Local development continues to use src/index.ts and app.listen().
export default createApp()
