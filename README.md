# AI Mystery Room

The existing project, completed locally against the supplied guide. Read [SPEC.md](./SPEC.md) for the final blueprint and [deployment instructions](./docs/DEPLOYMENT.md) for Vercel, Render and MongoDB Atlas.

## Start locally

Requires Node.js 22.12+, pnpm 10+, Docker Desktop (or your own MongoDB), and a Gemini key for custom mysteries.

```powershell
# Fresh installations only; preserve any existing private .env.
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm dev:local
```

Open http://localhost:5173 . `dev:local` starts Docker MongoDB and overrides its connection for this run, preserving saved Atlas configuration. Docker Desktop must already be running. With your own configured MongoDB, use `pnpm dev` instead.

For AI generation, edit only the private `.env`: set `GEMINI_API_KEY`, `GENERATION_PROVIDER=gemini`, `GEMINI_TEXT_MODEL=gemini-3.5-flash-lite`, and deliberately set `AI_GENERATION_ENABLED=true`. The current local environment already has Gemini enabled. Real generation was verified at every difficulty; future provider availability and quota are not guaranteed. The labeled fixed demo and ordinary tests need no API key.

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

| Command                 | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `pnpm dev:local`        | Start Docker MongoDB and both applications                        |
| `pnpm dev`              | Run both applications using configured MongoDB                    |
| `pnpm start`            | Persistent production API; runtime TypeScript via installed tsx   |
| `pnpm build`            | Compile/check backend/shared and build frontend                   |
| `pnpm typecheck`        | Workspace TypeScript checks                                       |
| `pnpm lint`             | Formatting, including proxy and verification scripts              |
| `pnpm test`             | Shared, generation, Mongo-backed API and proxy tests; no real AI  |
| `pnpm test:integration` | API ownership, scores, hints, races and quotas                    |
| `pnpm test:e2e`         | Desktop/mobile and generation/error browser flows with mocked API |
| `pnpm check:secrets`    | Scan publishable files against local secrets/excluded env files   |
| `pnpm test:live`        | Opt-in real AI/API flow at all three difficulties                 |
| `pnpm seed:demo`        | Seed a development-only fixed mystery                             |

Opt-in live check (consumes provider quota):

```powershell
$env:RUN_LIVE_AI_TESTS='true'
$env:LIVE_BASE_URL='http://localhost:5173'
pnpm test:live
```

Use the public origin after deployment. The check generates, investigates, requests a hint, accuses and checks results at each difficulty. Scores can be wrong-answer scores because it chooses a suspect without reading the secret solution.

## Deliverables and publication

Included: `SPEC.md`, tested original source, Render blueprint, Vercel API proxy/SPA routing, sanitized env example, deployment instructions, live checker and secret scan. See [submission status](./docs/SUBMISSION.md) and [verification report](./docs/VERIFICATION.md).

Public repository, hosted URL, Atlas connectivity and final submission require signed-in accounts and valid private provider settings. Localhost and local live tests are not presented as public deployment. Private configuration and logs are excluded from Git and the source archive.
