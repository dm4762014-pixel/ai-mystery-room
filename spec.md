# AI Mystery Room - Final Project Specification

Status: Implementation contract for the supplied Step-by-Step Build Guide.
Date: 2026-11-02. This replaces the earlier multimedia proposal; no replacement project is created.

## Objective and audience

A single-player web game lets casual mystery players enter a fictional premise, receive an original Gemini-authored case, investigate clues, request progressive hints, accuse one suspect, and see an explained verdict and backend-calculated score. The problem is providing a complete, coherent detective puzzle without requiring the player to author one.

## Scope and stack

Required: React, TypeScript, Vite, Tailwind CSS, Node.js, Express, MongoDB/Mongoose, official @google/genai SDK, Zod validation. Retain the existing client/server project: client frontend, server backend, shared schemas under server/src/shared. The existing detective interface and custom CSS remain, with Tailwind utilities integrated using its Vite plugin.

Core: premise entry, three difficulties, async generation, suspect statements, clue discovery/progress, hints, final accusation, results, restart, persistence, mobile layout and clear failures. Optional existing notes/bookmarks and demo remain. Excluded: accounts, payments, multiplayer, real-person accusations and generated image/video assets. Exhibit illustrations are explicitly schematic and CCTV observations are text; the supplied guide does not require generated media.

## User flow and screens

1. Home (/): introduce the game, provide start/premise form, optional sample premise, provider availability, difficulty choices, generation button and labeled fixed demo.
2. Create Mystery (same home form): validate trimmed fictional premise (30-600 characters). Easy/medium/hard are mandatory enum values. Standard text evidence is the supported mode.
3. Progress (/creating/:jobId): show actual generation/saving stage, poll the job every two seconds, navigate to the room when ready, show safe provider/schema errors and a route back on failure. Never invent completion estimates.
4. Investigation (/room/:caseId): show story, 3-5 suspect cards, statements, clue list/viewer, discovered/total counter, hint history and remaining hints, notes/bookmarks, suspect selection and accusation button. Opening a clue records one unique discovery. Reload restores server progress and hints.
5. Accusation (confirmation dialog in the room): show selected suspect and explain finality. Submission contains suspect ID and optional evidence citations; score/correctness are never accepted from the browser.
6. Results (/result/:caseId): show correct/incorrect verdict, server score, actual culprit, explanation, proof chain, red herring explanations and start-new button. No results before a final accusation.

Loading: disable duplicate form actions and show polite status. Errors: readable inline messages, no keys/provider payloads. Responsive: desktop and 375px mobile, keyboard-operable controls, labeled inputs, readable text alternatives. Keep direct room/result routes reloadable on the deployed SPA.

## Difficulty and scoring

| Difficulty | Suspects | Clues | Hints | Correct bonus |
| ---------- | -------: | ----: | ----: | ------------: |
| Easy       |        3 |     5 |     2 |           100 |
| Medium     |        4 |     7 |     3 |           150 |
| Hard       |        5 |     9 |     3 |           200 |

Score = max(0, (correct ? difficulty bonus : 0) + 5 * unique discovered clues - 10 * hints used). An incorrect accusation retains discovery points, with no correct bonus. No speed/prose grading. Maximum possible score: 245. Discovery and hint mutations are serialized with final grading by the single-instance API to prevent concurrent requests changing the scoring snapshot. Repeated discoveries and repeated hint idempotency keys earn/consume nothing extra. Exactly one final verdict is stored; identical retries return the original result and conflicting retries return 409.

## Backend API

Versioned implementation equivalents of the guide's suggested endpoints:

| Method/path                                       | Input and response                                                                                | Validation/authorization                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| POST /api/v1/sessions/guest                       | empty body -> csrfToken, expiresAt; HttpOnly guest cookie                                         | rate limited; 30-day sliding session, 90-day max lifetime                                       |
| GET /api/v1/capabilities                          | standard, full=false, configured provider status                                                  | no secrets; availability means configured, not a quota guarantee                                |
| POST /api/v1/cases                                | {scenario, difficulty, mediaTier:"standard"} -> 202 {jobId,status}                                | valid guest, allowed Origin, CSRF and Idempotency-Key; validated length/enums; generation quota |
| GET /api/v1/jobs/:jobId                           | status, stage, progressPercent, caseId or safe errorCode                                          | owning guest only                                                                               |
| GET /api/v1/cases/:caseId                         | public story/suspects/evidence, discoveredEvidenceIds, hintsRevealed, hintCount, verdictSubmitted | owning guest; no culprit/solution fields                                                        |
| POST /api/v1/cases/:caseId/clues/:clueId/discover | empty body -> updated public case                                                                 | owning guest, CSRF, valid clue; set semantics; closed investigations reject                     |
| GET/POST /api/v1/cases/:caseId/hints              | history / next hint {hintNumber,hintText,hintCount}                                               | owning guest, CSRF for POST; bounded by difficulty; repeat-key safe                             |
| POST /api/v1/cases/:caseId/accusations            | {suspectId,citedEvidenceIds?,reason?} -> isCorrect,score,correctSuspectId,resultPath              | valid case references, one final verdict                                                        |
| GET /api/v1/cases/:caseId/result                  | verdict, culprit, explanation, proof, score                                                       | owning guest and prior verdict required                                                         |
| GET /api/v1/health/live or /ready                 | process/DB health                                                                                 | readiness requires connected MongoDB                                                            |

All errors: {error:{code,message,requestId}}. 400 invalid input/reference; 401 session missing/expired; 403 Origin/CSRF or premature result; 404 unknown/unowned case/job; 409 finished case, consumed hints, in-progress generation or conflicting idempotency; 429 quota/rate limit; 503 unavailable provider. Never disclose another session's existence or credentials.

## Database and persistence

GuestSession: hashed random session ID, CSRF token, creation/activity/expiry dates.
MysteryCase: caseId, hashed owner, title, intro/story, original scenario, difficulty, timezone, suspects, typed clues/evidence, discovered IDs, ready status, fixture flag and expiry.
CaseSecret (separate private collection): caseId, culpritId, explanation, proof chain, red herrings, hint texts and expiry. Only allowlisted fields reach the frontend.
HintProgress: unique case/owner, sequential count, idempotency-key-to-hint mapping and expiry.
Attempt: unique case/owner, chosen suspect, citations, reason, correctness, immutable server score, hintsUsed and expiry.
GenerationJob: durable ID, hashed owner, request/idempotency digests, input, queued/generating/ready/failed status, actual stage/progress, case reference or safe error, dates.

MongoDB TTL indexes expire cases/jobs/solutions/progress after 30 days. The API runs one persistent instance and serializes generation admission and case mutations. Jobs survive a process restart in MongoDB and resume via the in-process runner. Horizontal scaling and serverless generation workers are outside this submission architecture.

## Gemini contract and validation

Gemini is server-only. Default configured tested model: gemini-3.5-flash-lite. Treat user text as fictional story inspiration, not instructions. Require one coherent culprit, difficulty counts, explicit evidence references and readable clues that uniquely support the solution. Do not expose a direct solution in public fields or hints.

Expected JSON: {title,intro,settingTimeZone,suspects:[{suspectId,name,role,relationshipToCase,visibleStatement}],culpritId,evidence:[typed chat/photo/cctv/document/witness records],proofChain:[{evidenceId,inference}],redHerrings:[{evidenceId,explanation}],explanation,hintTexts:[string]}.

Use JSON response mode with the full output contract in the author prompt; native provider schemas reject this deeply nested union on the tested model. Parse strictly with the shared Zod schema before use; retain all runtime constraints. Validate counts, unique IDs/names, culprit membership, timestamps/timezone, chronological chats, evidence-type diversity, proof references (at least three distinct clues across two types), red herring references, and hint privacy. A separate Gemini critic must pass coherence, unique answer and no public spoilers. Up to two semantic repairs; each provider request retries transient 502/503/504 twice with bounded backoff. Quota/access/schema rejection is terminal rather than an uncontrolled retry loop. Invalid cases never enter ready. Local Ollama remains an explicit optional provider, not an automatic fallback or substitute for verified Gemini generation.

## Security and operations

Keep .env, all credentials, cookies and logs outside Git/source archives; .env.example contains placeholders only. Frontend never receives API keys or private DB connection strings. Require owning guest and CSRF for mutations. Use HTTPS and Secure/HttpOnly/SameSite=Lax cookies in production. Use same-origin /api proxy from Vercel to a persistent Node backend; forward only required headers and never allow a client-selected upstream origin. Log safe error classes and request IDs only. Apply IP API/session limits, a per-guest daily generation cap and a global daily cap before queueing. One generation runs at a time. Failed jobs count toward quota because they can consume provider work.

## Deployment and final deliverables

Backend: persistent Node service (Render configuration supplied), production PORT, MongoDB Atlas connection, Gemini key/model, exact public WEB_ORIGIN and generation limits. Frontend: Vercel build of client, BACKEND_URL server-only proxy setting and SPA fallback. Provision no paid plan or billing automatically. The account owner signs in and enters secrets directly where required.

Deliver: one complete spec.md, original project source on GitHub, public live website URL, accurate README/env example, passing tests/build, and one demonstrated create-investigate-hint-accuse-result flow on the public website. Submission form from the supplied guide: https://bit.ly/ai-mystery-room-sub-form . Repository and live URLs must be real, accessible, and verified before marking deployment/submission complete.

## Acceptance criteria and verification

- All three difficulties produce exact suspect/clue/hint counts.
- Invalid input/AI output and provider failures are safe and actionable.
- Clue discovery persists once; hint limits/history persist across reload.
- Culprit/proof/solution absent before final accusation; unowned resources inaccessible.
- Scoring is server-only and follows the table, including wrong answers and zero floor.
- One final verdict remains correct under concurrent requests.
- Desktop/mobile flow, refresh/direct routes and restart work.
- Workspace typecheck, build, formatting, unit/API and browser tests pass without paid calls.
- Opt-in live Gemini checks establish actual generation separately from mocked tests.
- Production URL completes a real Gemini game with Atlas persistence; no local-only/tunnel URL is presented as a permanent deployment.
- GitHub URL and website URL are supplied and the submission is performed only with the user's required identity/form details available.
