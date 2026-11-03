# Implementation decisions

## Current submission implementation

- The supplied build guide and final spec.md supersede the original multimedia proposal. Gemini mystery text is implemented and verified at all three difficulties; generated photographs/video are outside the guide's requirements.
- Retain the original monorepo and interface. Add Tailwind through its Vite plugin alongside existing custom CSS.
- Use Gemini JSON mode with the full author contract in the prompt, strict server Zod validation, deterministic checks and an independent critic. The tested provider rejects the large nested native evidence schema.
- Run one persistent API instance. MongoDB persists queued/running jobs; an in-process runner handles them and serializes admission. Per-case mutation serialization keeps progress and final scores consistent. Horizontal scaling requires a distributed replacement.
- Production starts TypeScript through the installed tsx runtime because the shared package exports TypeScript. Builds still compile/type-check backend/shared and produce the frontend bundle. The production entry point was tested locally.
- Vercel serves the frontend and a same-origin API proxy; a separate persistent Node service runs generation. Render configuration is supplied. Public deployment and submission remain pending signed-in accounts and valid Atlas configuration.

## Folder organization (2026-11-03)

- Replace apps/web and apps/api with client/ and server/, and replace pnpm workspaces with independent npm packages and lockfiles at root, client and server.
- Keep one public schema module in server/src/shared; the frontend imports it directly. There is no duplicate shared package.
- Keep existing root private settings as a fallback, with server/.env for overrides and a separate browser-safe client/.env.
- Remove obsolete apps/, packages/, pnpm configuration, stale artifacts, old logs and unused shared-package metadata.
- Retain tests, scripts, documentation and the Vercel API proxy because they support the application and deployment.
