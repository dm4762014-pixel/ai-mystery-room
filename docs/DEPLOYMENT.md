# Deployment and submission

The application has been completed locally against the supplied guide. Public hosting and final submission still require signed-in accounts and a valid Atlas database configuration. An email address alone is not a sign-in session.

## 1. GitHub

Create an empty `ai-mystery-room` repository in your intended GitHub account. Push this existing workspace's `main` branch. The source archive is also available for upload. Never upload `.env`, log files, `node_modules`, `.vercel`, or database files. Run the secret scan before pushing.

## 2. MongoDB Atlas

Create/select the project and cluster. Use a database user scoped to this application's database, and allow the backend host's outbound addresses through Atlas's network access list. Copy a valid, URL-encoded database connection URI into the backend host's private environment configuration. Enter credentials directly in the provider UI; do not paste them into chat, README, or GitHub. The saved Atlas URI was corrected and has passed authentication and ping. Keep it private; local automated tests use isolated MongoDB.

## 3. Render backend

The root `render.yaml` describes the Node service. Import the GitHub repository as a Blueprint, or create a Node Web Service from the repository root:

- Build: `npm ci --include=dev --prefix server && npm run build --prefix server`
- Start: `npm start`
- Health: `/api/v1/health/ready`
- Keep exactly one instance; the persisted MongoDB jobs are processed in that instance.

Set `NODE_ENV=production`, `GENERATION_PROVIDER=gemini`, `AI_GENERATION_ENABLED=true`, `GEMINI_TEXT_MODEL=gemini-3.5-flash-lite`, and `NODE_OPTIONS=--dns-result-order=ipv4first`. Enter `GEMINI_API_KEY` and `MONGODB_URI` privately. Set `WEB_ORIGIN` to the exact final frontend origin, such as `https://ai-mystery-room.vercel.app`, without a trailing slash. `PORT` is supplied by the host. Daily admission defaults are three cases per guest and thirty cases globally, including failed generation attempts. No paid plan or billing is authorized by this configuration alone.

Verify `/api/v1/health/ready` returns HTTP 200 before proceeding. A process-only health response is not proof that Atlas works. Host sleep/cold-start policies can cause initial requests to take longer; wait for backend readiness and retry rather than presenting an unfinished generation as ready.

## 4. Vercel frontend

Import the same repository, using the repository root as the Root Directory. The root `vercel.json` sets the frontend build/output and SPA/API routes. Add the server-side environment variable `BACKEND_URL=https://<backend-service>.onrender.com`. Redeploy after setting it.

The `api/proxy.js` function forwards only the required session, Origin, CSRF, content-type and idempotency headers. It preserves Set-Cookie, disables caching and fixes the upstream origin. API calls remain same-origin in the browser; no Gemini or database key goes into a Vite environment variable or frontend bundle. The backend's production guest cookie is Secure, HttpOnly and SameSite=Lax.

Direct reloads of `/room/...`, `/creating/...` and `/result/...` must load the SPA. `/api/...` must reach the proxy rather than return index.html. Preview deployments need their own exact WEB_ORIGIN/backend environment; the production backend does not accept arbitrary preview origins.

## 5. Public verification and submission

Run the opt-in live check against the final URL:

```powershell
$env:RUN_LIVE_AI_TESTS='true'
$env:LIVE_BASE_URL='https://your-final-site.vercel.app'
npm run test:live
```

This creates and completes one real AI case at each difficulty. It consumes provider quota; normal tests do not. Also manually create and solve a mystery in the public browser, including a page reload. Record the GitHub repository URL and the public website URL in `docs/SUBMISSION.md`, then submit them through the form linked in the guide. Enter any requested student identity details yourself or provide the non-sensitive fields explicitly. Do not mark the form submitted until its success page is observed.
