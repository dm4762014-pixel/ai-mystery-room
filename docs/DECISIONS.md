# Implementation decisions

- The initial implementation is the deterministic, guest-owned demo slice; paid Gemini integration and full-media behavior are explicitly unavailable until implemented and tested.
- Dev-only `POST /api/v1/demo-case` creates an isolated fixture per guest session. This keeps the demo playable without copying the fixed answer into a public shared case.
- Demo image areas are UI placeholders and the CCTV exhibit is text-only. They are disclosed as not AI-generated; they do not satisfy generated-media acceptance criteria.
- Redis is included in local Compose for the next durable-worker phase but is not yet connected to a job pipeline.
- Guest-session cookies contain a random opaque token; MongoDB stores its SHA-256 hash. CSRF tokens are per guest session and state-changing routes also check the configured same-origin `Origin`.
