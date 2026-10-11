import app from '../../backend/src/app.js'

// Keep the API in the same Vercel project as the frontend. A hard-coded proxy
// to a deployment URL is brittle: preview deployments can be removed and the
// browser then waits until its client-side timeout for every request.
export default app
