# AI Mystery Room

This is the existing React/Vite + Express/Mongoose project, updated against the supplied submission guide. The existing interface and monorepo are retained. See [spec.md](./spec.md) for the guide amendment and historical architecture.

## Run locally

Requires Node 20.19+ or 22.12+, pnpm 10+, and MongoDB.

```powershell
# Only copy this for a fresh setup; preserve an existing private .env.
Copy-Item .env.example .env
pnpm install
docker compose up -d mongo
pnpm dev
```

Open http://localhost:5173. Use the labeled seeded demo without AI credentials. The demo is a fixed medium mystery, not freshly generated AI output.

For Gemini, edit the private root `.env`: set `GENERATION_PROVIDER=gemini`, a valid `GEMINI_API_KEY`, `GEMINI_TEXT_MODEL=gemini-3.5-flash-lite` (or another accessible structured-output model), and deliberately set `AI_GENERATION_ENABLED=true`. The official SDK runs exclusively on the backend. Calls may consume provider quota; automated tests mock Gemini and never require a key. The author uses Gemini JSON mode with the complete output contract in its prompt, avoiding rejection of the deeply nested evidence schema by the provider. Every output still passes strict server-side Zod validation, cross-reference checks and an independent critic; malformed cases receive at most two repair attempts. Provider failures are sanitized. Temporary 502/503/504 errors retry twice with bounded backoff; successful drafts are retained while retrying the independent critic. Quota and permission failures do not retry.

For an explicit local alternative set `GENERATION_PROVIDER=ollama`, install Ollama and `ollama pull qwen3`; configure `LOCAL_LLM_MODEL` if needed. Local generation uses a loopback endpoint only. The current private environment is preserved; copying the example is not required for existing installations.

## Play

Enter a fictional premise of 30?600 characters, select difficulty, and create a case. Generation progress leads into the existing investigation room. Opening a clue records a unique discovery on the backend; the counter shows discovered/total. Hints persist across refresh. Choose a suspect and confirm a final accusation to reveal the culprit, proof, explanation and backend score. Start another mystery from the result screen.

| Difficulty | Suspects | Clues | Available hints | Correct bonus |
|---|---:|---:|---:|---:|
| Easy | 3 | 5 | 2 | 100 |
| Medium | 4 | 7 | 3 | 150 |
| Hard | 5 | 9 | 3 | 200 |

Score is `max(0, correct bonus + 5 ? discovered clues ? 10 ? used hints)`. An incorrect accusation has no correct bonus but retains discovery points. Duplicate discoveries earn nothing extra. The hidden solution stays in a separate backend collection until the final accusation.

Photo exhibits are schematic illustrations; CCTV is a text observation, not generated video. The submission guide requires Gemini mysteries, not photo/video generation. Existing custom CSS is retained rather than replacing the interface with Tailwind. Historical full-media requirements remain outside this guide update.

## Validation

- `pnpm build`: compile backend/shared and build frontend.
- `pnpm typecheck`: workspace TypeScript checks.
- `pnpm lint`: formatting checks.
- `pnpm test`: shared rules, mocked generation, real Express routes with isolated MongoDB.
- `pnpm test:integration`: backend ownership, clues, hints, accusations and result checks.
- `pnpm test:e2e`: Playwright browser checks.
- `pnpm seed:demo`: seed a development mystery.

## API and deployment

Existing `/api/v1` endpoints are retained: guest session, capabilities, case creation/job polling, case retrieval, hints, accusations and results. Clue discovery is `POST /api/v1/cases/:caseId/clues/:clueId/discover`. Mutations require the guest cookie, matching `Origin` and CSRF token. Case/job/result access is scoped to its owning guest.

Deployment is pending. Use a persistent Node host for the API/job loop and MongoDB Atlas; ephemeral serverless functions are unsuitable for this in-process queue. Deploy the frontend with a same-origin `/api` reverse proxy to the backend (required for cookies), configure `WEB_ORIGIN` to the public site origin, and use HTTPS. Production requires additional abuse/rate and spend controls before exposing generation publicly. Do not expose `.env` or enable paid generation as part of a default build.

Submission still needs a GitHub repository URL, public website URL and a verified live Gemini playthrough. No production deployment, publication or form submission is performed by the tests.
