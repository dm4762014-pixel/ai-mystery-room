# Implementation decisions

## Current submission implementation

- The supplied build guide and final SPEC.md supersede the original multimedia proposal. Gemini mystery text is implemented and verified at all three difficulties; generated photographs/video are outside the guide's requirements.
- Retain the original monorepo and interface. Add Tailwind through its Vite plugin alongside existing custom CSS.
- Use Gemini JSON mode with the full author contract in the prompt, strict server Zod validation, deterministic checks and an independent critic. The tested provider rejects the large nested native evidence schema.
- Run one persistent API instance. MongoDB persists queued/running jobs; an in-process runner handles them and serializes admission. Per-case mutation serialization keeps progress and final scores consistent. Horizontal scaling requires a distributed replacement.
- Production starts TypeScript through the installed tsx runtime because the shared package exports TypeScript. Builds still compile/type-check backend/shared and produce the frontend bundle. The production entry point was tested locally.
- Vercel serves the frontend and a same-origin API proxy; a separate persistent Node service runs generation. Render configuration is supplied. Public deployment and submission remain pending signed-in accounts and valid Atlas configuration.

## Historical initial slice

The entries below describe the earlier starting state, not current Gemini capability.

- The initial implementation is the deterministic, guest-owned demo slice; paid Gemini integration and full-media behavior are explicitly unavailable until implemented and tested.
- Dev-only `POST /api/v1/demo-case` creates an isolated fixture per guest session. This keeps the demo playable without copying the fixed answer into a public shared case.
- Demo image areas are UI placeholders and the CCTV exhibit is text-only. They are disclosed as not AI-generated; they do not satisfy generated-media acceptance criteria.
- Redis is included in local Compose for the next durable-worker phase but is not yet connected to a job pipeline.
- Guest-session cookies contain a random opaque token; MongoDB stores its SHA-256 hash. CSRF tokens are per guest session and state-changing routes also check the configured same-origin `Origin`.
