# Verification report - 2026-11-03

This report distinguishes verified local behavior from account-dependent publication.

The project was reorganized on 2026-11-03 into client/ and server/ with independent npm package-lock.json files. The npm build, all 31 unit/API/proxy checks and five browser checks were rerun successfully from the new layout. Original Gemini live checks below were performed before the reorganization; paid generation was not repeated for a folder-only change.

| Check                   | Actual result                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`              | PASS: 4 shared tests, 24 API/generation tests, 3 deployment-proxy tests; 31 total                                                        |
| `npm run test:e2e`      | PASS: 5 Chromium tests; desktop/mobile complete playthroughs, custom generation navigation and provider-error recovery                   |
| `npm run build`         | PASS: shared/backend TypeScript compilation and frontend production build                                                                |
| `npm run lint`          | PASS: workspace, proxy, test and helper-script formatting                                                                                |
| `npm run check:secrets` | PASS before packaging; private configuration and logs excluded                                                                           |
| Production entry point  | PASS locally with NODE_ENV=production and host-supplied PORT; MongoDB readiness and Secure/HttpOnly/SameSite=Lax session cookie verified |
| Real Gemini Easy        | PASS: 3 suspects, 5 clues, investigation, hint, accusation, result; observed score 15                                                    |
| Real Gemini Medium      | PASS: 4 suspects, 7 clues, investigation, hint, accusation, result; observed score 25                                                    |
| Real Gemini Hard        | PASS: 5 suspects, 9 clues, investigation, hint, accusation, result; observed score 35                                                    |

Live checks used the running local application with `gemini-3.5-flash-lite`, not mocked model output. The test chooses a suspect without consulting the private solution; these observed scores are wrong-answer discovery points less one hint. Backend tests separately verify correct answers, all hint limits, idempotency, ownership, premature-result protection, concurrent hint/discovery/verdict behavior and daily quota rejection. Malformed AI and transient/quota/access/model errors are covered without real provider calls in ordinary tests.

Desktop (1280px) and mobile (375px) result screenshots were inspected. The browser checks also verified no horizontal overflow at those widths. Screenshots are generated under `media/screenshots` and excluded from the source repository.

## Guide completion

- Detailed final specification: complete in spec.md.
- Required application stack and existing project: complete; Tailwind added without replacing the UI.
- Gemini generation, clue discovery, hints, accusations, result and backend score: verified locally.
- Invalid responses/provider failure handling and solution privacy: covered by tests.
- Deployment preparation: Render service blueprint, Vercel same-origin API proxy, SPA fallback, production startup and documented private environment settings supplied.
- GitHub source publication: complete at https://github.com/dm4762014-pixel/ai-mystery-room . Local main was pushed and its remote commit verified.
- MongoDB Atlas: authentication and ping now pass after correcting a typo in the saved private connection URI. Local automated tests still use isolated test MongoDB.
- Public hosting: pending account sign-in and private configuration. No public deployment URL has been fabricated.
- Public create-and-solve demonstration: pending a deployed URL.
- Submission form: not submitted; requires actual repository/live URLs and any requested student identity details.

The earlier `gemini-3.8-flash` model returned real 503 high-demand errors. A live model check found the working configured model. Generation now uses JSON mode plus strict server validation to avoid the provider's rejection of the nested native evidence schema. Temporary transport failures have bounded retries; permanent failures are not retried indefinitely.

The backend intentionally runs as one persistent instance with a MongoDB-backed in-process job runner. No physical-device, other-browser, production load, generated-media or public-deployment claims are made by these local checks. Vite reported non-blocking third-party Zod comment-annotation warnings; compilation and output generation completed successfully.
