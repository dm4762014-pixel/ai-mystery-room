# AI Mystery Room

The existing project, organized into client/ and server/ as requested. Read [spec.md](./spec.md) for the final blueprint and the deployment settings below for Vercel, Render and MongoDB Atlas.

## Folder layout

```text
AI Mystery Room/
  client/                React/Vite frontend, its npm lockfile and public-only .env
    src/
    e2e/
    dist/                Generated frontend build
    node_modules/        Generated frontend dependencies
  server/                Express API, its npm lockfile and private overrides
    src/
      shared/            One copy of shared validation contracts
    test/
    node_modules/        Generated backend dependencies
  media/                 Project media (generated captures are ignored)
  .env                   Existing private configuration, retained as fallback
  package.json           npm commands for both applications
  package-lock.json
  README.md
  spec.md
```

Each application has its own npm package and lockfile. The frontend proxy is in `client/api`; backend tools and checks are in `server/src/tools` and `server/test`. Hosting configuration stays inside the application it deploys. Dependencies and builds are generated, not committed.

## Start locally

Requires Node.js 22.12+, npm, Docker Desktop (or your own MongoDB), and a Gemini key for custom mysteries.

```powershell
# Fresh installations only; preserve any existing private .env.
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
npm install
npm run setup
npm run dev:local
```

Open http://localhost:5173 . `dev:local` starts Docker MongoDB and overrides its connection for this run, preserving saved Atlas configuration. Docker Desktop must already be running. With your own configured MongoDB, use `npm run dev` instead.

For AI generation, edit the private `server/.env` (existing root `.env` settings remain a fallback): set `GEMINI_API_KEY`, `GENERATION_PROVIDER=gemini`, `GEMINI_TEXT_MODEL=gemini-3.5-flash-lite`, and deliberately set `AI_GENERATION_ENABLED=true`. The current local environment already has Gemini enabled. Real generation was verified at every difficulty; future provider availability and quota are not guaranteed. The labeled fixed demo and ordinary tests need no API key.

## Play and scoring

Enter a fictional premise of 30-600 characters, select difficulty, and create a case. Actual job progress leads into the investigation room. Opening a clue records one unique discovery. Hint history and progress survive reload. Select a suspect, confirm the final accusation, then see the culprit, proof, explanation and backend score. Start another mystery from the results.

| Difficulty | Suspects | Clues | Hints | Correct bonus |
| ---------- | -------: | ----: | ----: | ------------: |
| Easy       |        3 |     5 |     2 |           100 |
| Medium     |        4 |     7 |     3 |           150 |
| Hard       |        5 |     9 |     3 |           200 |

Score = `max(0, correct bonus + 5 * unique discoveries - 10 * hints used)`. Wrong accusations have no correct bonus but retain discovery points. Repeated discoveries/hint keys are idempotent. Final grading and progress mutations are serialized; later investigation cannot change the result.

## Architecture and safeguards

React/TypeScript/Vite/Tailwind frontend, Express/Node backend, MongoDB/Mongoose persistence, shared Zod contracts, official Gemini SDK. Existing custom styling is retained alongside Tailwind.

The author uses JSON response mode with the full contract in its prompt because the provider rejects the deeply nested native evidence schema. Strict local Zod parsing, deterministic references/counts and an independent Gemini critic remain mandatory before saving. Up to two semantic repairs are allowed; temporary 502/503/504 responses retry twice with bounded backoff. Successful drafts survive critic retries. Quota/access/schema failures do not cause unbounded calls.

The solution stays in a private collection until the final accusation. Resources belong to a random server-issued guest session; mutations require its cookie, exact allowed Origin and CSRF token. Production cookies are Secure/HttpOnly/SameSite=Lax. API/session limits and persisted daily caps protect generation: three cases per guest and thirty globally per UTC day by default, including failed attempts. One persistent API instance runs one generation at a time. Jobs persist in MongoDB and resume on restart. Multiple instances require a separate distributed queue/lock design.

Photo exhibits are schematic illustrations and CCTV is text observation. No generated photos/video are claimed or required by the supplied guide. Ollama is an explicit optional provider, never an automatic Gemini substitute.

## Commands

| Command                    | Purpose                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| `npm run dev:local`        | Start Docker MongoDB and both applications                        |
| `npm run dev`              | Run both applications using configured MongoDB                    |
| `npm start`                | Persistent production API; runtime TypeScript via installed tsx   |
| `npm run build`            | Type-check server/shared and build frontend                       |
| `npm run typecheck`        | Workspace TypeScript checks                                       |
| `npm run lint`             | Formatting, including proxy and verification scripts              |
| `npm test`                 | Shared, generation, Mongo-backed API and proxy tests; no real AI  |
| `npm run test:integration` | API ownership, scores, hints, races and quotas                    |
| `npm run test:e2e`         | Desktop/mobile and generation/error browser flows with mocked API |
| `npm run check:secrets`    | Scan publishable files against local secrets/excluded env files   |
| `npm run test:live`        | Opt-in real AI/API flow at all three difficulties                 |
| `npm run seed:demo`        | Seed a development-only fixed mystery                             |

Opt-in live check (consumes provider quota):

```powershell
$env:RUN_LIVE_AI_TESTS='true'
$env:LIVE_BASE_URL='http://localhost:5173'
npm run test:live
```

Use the public origin after deployment. The check generates, investigates, requests a hint, accuses and checks results at each difficulty. Scores can be wrong-answer scores because it chooses a suspect without reading the secret solution.

## Deployment and submission status

Existing repository: https://github.com/dm4762014-pixel/ai-mystery-room . Public deployment and final submission remain pending.

For Render, use root directory `server`, build command `npm ci --include=dev && npm run build`, and start command `npm start`. The blueprint is `server/render.yaml`. Set the private MongoDB URI and Gemini key in the hosting environment, along with the exact frontend `WEB_ORIGIN`. Keep a single persistent instance. Local private configuration is excluded from Git.

For Vercel, use root directory `client` and its `vercel.json`. Enable access to source files outside that directory so the frontend can import `server/src/shared`. Set server-only `BACKEND_URL` to the actual Render origin. Never prefix secrets with `VITE_`.

After deployment, verify a complete real create-investigate-hint-accuse-result flow and submit the verified repository and public website URLs through the guide's form: https://bit.ly/ai-mystery-room-sub-form . Localhost checks do not establish public deployment.
