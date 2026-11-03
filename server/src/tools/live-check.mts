import "../env.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  DIFFICULTY_RULES,
  PublicCaseSchema,
  type Difficulty,
} from "../shared/index.js";

if (process.env.RUN_LIVE_AI_TESTS !== "true")
  throw new Error(
    "Opt in with RUN_LIVE_AI_TESTS=true; this check calls the configured AI provider.",
  );
const base = (process.env.LIVE_BASE_URL ?? "http://localhost:5173").replace(
  /\/$/,
  "",
);
const origin = new URL(base).origin;
let cookie = "";
let token = "";
async function request(path: string, body?: unknown) {
  const headers: Record<string, string> = {
    Origin: origin,
    "Content-Type": "application/json",
    "Idempotency-Key": randomUUID(),
  };
  if (cookie) headers.Cookie = cookie;
  if (token) headers["X-CSRF-Token"] = token;
  const response = await fetch(`${base}/api/v1${path}`, {
    headers,
    ...(body === undefined
      ? {}
      : { method: "POST", body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const setCookie = response.headers.getSetCookie()[0];
  if (setCookie) cookie = setCookie.split(";")[0]!;
  const payload = await response.json();
  if (!response.ok)
    throw new Error(
      `HTTP ${response.status}: ${payload.error?.code ?? "REQUEST_FAILED"}`,
    );
  return payload;
}
token = (await request("/sessions/guest", {})).csrfToken;
const difficulties = (
  process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["easy", "medium", "hard"]
) as Difficulty[];
for (const difficulty of difficulties) {
  assert.ok(difficulty in DIFFICULTY_RULES);
  const job = await request("/cases", {
    scenario: `At a fictional village theatre, a brass stage key disappears during a rainy evening rehearsal. Build a ${difficulty} mystery with invented people.`,
    difficulty,
    mediaTier: "standard",
  });
  console.log(`${difficulty}: generation accepted`);
  let caseId: string | undefined;
  for (let poll = 0; poll < 120; poll++) {
    const status = await request(`/jobs/${job.jobId}`);
    if (status.status === "failed")
      throw new Error(`${difficulty}: ${status.errorCode}`);
    if (status.status === "ready") {
      caseId = status.caseId;
      break;
    }
    await delay(3000);
  }
  assert.ok(caseId, "Generation did not finish before the test deadline.");
  const raw = await request(`/cases/${caseId}`);
  const mystery = PublicCaseSchema.parse(raw);
  const rules = DIFFICULTY_RULES[difficulty];
  assert.equal(mystery.suspects.length, rules.suspects);
  assert.equal(mystery.evidence.length, rules.clues);
  for (const secret of [
    "culpritId",
    "proofChain",
    "explanation",
    "correctSuspectId",
  ])
    assert.ok(!(secret in raw));
  for (const evidence of mystery.evidence)
    await request(
      `/cases/${caseId}/clues/${encodeURIComponent(evidence.evidenceId)}/discover`,
      {},
    );
  const hint = await request(`/cases/${caseId}/hints`, {});
  assert.equal(hint.hintCount, 1);
  const refreshed = await request(`/cases/${caseId}`);
  assert.equal(refreshed.discoveredEvidenceIds.length, rules.clues);
  assert.equal(refreshed.hintsRevealed.length, 1);
  const verdict = await request(`/cases/${caseId}/accusations`, {
    suspectId: mystery.suspects[0]!.suspectId,
  });
  const result = await request(`/cases/${caseId}/result`);
  assert.equal(
    result.score,
    Math.max(0, (verdict.isCorrect ? rules.bonus : 0) + 5 * rules.clues - 10),
  );
  assert.ok(result.explanation);
  assert.equal(result.score, verdict.score);
  console.log(
    `${difficulty}: PASS; ${rules.suspects} suspects, ${rules.clues} clues; investigation/hint/verdict/result verified; score=${result.score}`,
  );
}
