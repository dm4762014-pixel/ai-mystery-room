import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import {
  Attempt,
  CaseSecret,
  GenerationJob,
  GuestSession,
  HintProgress,
  MysteryCase,
} from "../src/models.js";

let mongo: MongoMemoryServer | undefined;
let server: ReturnType<typeof app.listen> | undefined;
let baseUrl = "";

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    GuestSession.init(),
    MysteryCase.init(),
    CaseSecret.init(),
    HintProgress.init(),
    Attempt.init(),
    GenerationJob.init(),
  ]);
  server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not start.");
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 120_000);

beforeEach(async () => {
  await Promise.all([
    GuestSession.deleteMany({}),
    MysteryCase.deleteMany({}),
    CaseSecret.deleteMany({}),
    HintProgress.deleteMany({}),
    Attempt.deleteMany({}),
    GenerationJob.deleteMany({}),
  ]);
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

const startSession = async () => {
  const response = await fetch(`${baseUrl}/api/v1/sessions/guest`, {
    method: "POST",
    headers: { Origin: "http://localhost:5173" },
  });
  const setCookie = response.headers.get("set-cookie");
  const body = (await response.json()) as { csrfToken: string };
  if (!setCookie) throw new Error("Guest cookie was not set.");
  return { cookie: setCookie.split(";")[0] ?? "", csrfToken: body.csrfToken };
};

describe("guest demo case", () => {
  it("rejects state changes without the session CSRF token", async () => {
    const owner = await startSession();
    const response = await fetch(`${baseUrl}/api/v1/demo-case`, {
      method: "POST",
      headers: { Cookie: owner.cookie, Origin: "http://localhost:5173" },
    });
    expect(response.status).toBe(403);
  });

  it("isolates cases and withholds results until one final verdict", async () => {
    const owner = await startSession();
    const other = await startSession();
    const create = await fetch(`${baseUrl}/api/v1/demo-case`, {
      method: "POST",
      headers: {
        Cookie: owner.cookie,
        Origin: "http://localhost:5173",
        "X-CSRF-Token": owner.csrfToken,
      },
    });
    expect(create.status).toBe(201);
    const { caseId } = (await create.json()) as { caseId: string };

    const privateRead = await fetch(`${baseUrl}/api/v1/cases/${caseId}`, {
      headers: { Cookie: other.cookie },
    });
    expect(privateRead.status).toBe(404);
    const publicResponse = await fetch(`${baseUrl}/api/v1/cases/${caseId}`, {
      headers: { Cookie: owner.cookie },
    });
    const publicCase = (await publicResponse.json()) as Record<string, unknown>;
    expect(publicResponse.status).toBe(200);
    expect(publicCase).not.toHaveProperty("culpritId");
    expect(publicCase).not.toHaveProperty("proofChain");
    const prematureResult = await fetch(
      `${baseUrl}/api/v1/cases/${caseId}/result`,
      { headers: { Cookie: owner.cookie } },
    );
    expect(prematureResult.status).toBe(403);

    const accusation = await fetch(
      `${baseUrl}/api/v1/cases/${caseId}/accusations`,
      {
        method: "POST",
        headers: {
          Cookie: owner.cookie,
          Origin: "http://localhost:5173",
          "X-CSRF-Token": owner.csrfToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          suspectId: "sus_03",
          citedEvidenceIds: ["ev_02", "ev_06", "ev_07"],
        }),
      },
    );
    expect(accusation.status).toBe(201);
    expect(await accusation.json()).toMatchObject({
      isCorrect: true,
      score: 150,
    });
    const result = await fetch(`${baseUrl}/api/v1/cases/${caseId}/result`, {
      headers: { Cookie: owner.cookie },
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      correctSuspectId: "sus_03",
      isCorrect: true,
    });

    const secondAccusation = await fetch(
      `${baseUrl}/api/v1/cases/${caseId}/accusations`,
      {
        method: "POST",
        headers: {
          Cookie: owner.cookie,
          Origin: "http://localhost:5173",
          "X-CSRF-Token": owner.csrfToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ suspectId: "sus_01" }),
      },
    );
    expect(secondAccusation.status).toBe(409);
  });

  it("increments hints sequentially and applies the deterministic score", async () => {
    const owner = await startSession();
    const create = await fetch(`${baseUrl}/api/v1/demo-case`, {
      method: "POST",
      headers: {
        Cookie: owner.cookie,
        Origin: "http://localhost:5173",
        "X-CSRF-Token": owner.csrfToken,
      },
    });
    const { caseId } = (await create.json()) as { caseId: string };
    for (let hintNumber = 1; hintNumber <= 3; hintNumber += 1) {
      const hint = await fetch(`${baseUrl}/api/v1/cases/${caseId}/hints`, {
        method: "POST",
        headers: {
          Cookie: owner.cookie,
          Origin: "http://localhost:5173",
          "X-CSRF-Token": owner.csrfToken,
          "Content-Type": "application/json",
          "Idempotency-Key": `hint-${hintNumber}`,
        },
        body: "{}",
      });
      expect(hint.status).toBe(200);
      expect(await hint.json()).toMatchObject({
        hintNumber,
        hintCount: hintNumber,
      });
      if (hintNumber === 1) {
        const duplicate = await fetch(
          `${baseUrl}/api/v1/cases/${caseId}/hints`,
          {
            method: "POST",
            headers: {
              Cookie: owner.cookie,
              Origin: "http://localhost:5173",
              "X-CSRF-Token": owner.csrfToken,
              "Content-Type": "application/json",
              "Idempotency-Key": "hint-1",
            },
            body: "{}",
          },
        );
        expect(await duplicate.json()).toMatchObject({
          hintNumber: 1,
          hintCount: 1,
        });
      }
    }
    const fourth = await fetch(`${baseUrl}/api/v1/cases/${caseId}/hints`, {
      method: "POST",
      headers: {
        Cookie: owner.cookie,
        Origin: "http://localhost:5173",
        "X-CSRF-Token": owner.csrfToken,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(fourth.status).toBe(409);
    const accusation = await fetch(
      `${baseUrl}/api/v1/cases/${caseId}/accusations`,
      {
        method: "POST",
        headers: {
          Cookie: owner.cookie,
          Origin: "http://localhost:5173",
          "X-CSRF-Token": owner.csrfToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ suspectId: "sus_03" }),
      },
    );
    expect(await accusation.json()).toMatchObject({
      isCorrect: true,
      score: 120,
    });
  });

  it("grades a wrong suspect once and returns zero points", async () => {
    const owner = await startSession();
    const create = await fetch(`${baseUrl}/api/v1/demo-case`, {
      method: "POST",
      headers: {
        Cookie: owner.cookie,
        Origin: "http://localhost:5173",
        "X-CSRF-Token": owner.csrfToken,
      },
    });
    const { caseId } = (await create.json()) as { caseId: string };
    const accusation = await fetch(
      `${baseUrl}/api/v1/cases/${caseId}/accusations`,
      {
        method: "POST",
        headers: {
          Cookie: owner.cookie,
          Origin: "http://localhost:5173",
          "X-CSRF-Token": owner.csrfToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ suspectId: "sus_01" }),
      },
    );
    expect(await accusation.json()).toMatchObject({
      isCorrect: false,
      score: 0,
    });
  });

  it("persists exactly one result when conflicting accusations race", async () => {
    const owner = await startSession();
    const create = await fetch(`${baseUrl}/api/v1/demo-case`, {
      method: "POST",
      headers: {
        Cookie: owner.cookie,
        Origin: "http://localhost:5173",
        "X-CSRF-Token": owner.csrfToken,
      },
    });
    const { caseId } = (await create.json()) as { caseId: string };
    const post = (suspectId: string) =>
      fetch(`${baseUrl}/api/v1/cases/${caseId}/accusations`, {
        method: "POST",
        headers: {
          Cookie: owner.cookie,
          Origin: "http://localhost:5173",
          "X-CSRF-Token": owner.csrfToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ suspectId }),
      });
    const responses = await Promise.all([post("sus_01"), post("sus_03")]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const session = await GuestSession.findOne({
      csrfToken: owner.csrfToken,
    }).lean();
    if (!session) throw new Error("Guest session was not persisted.");
    expect(
      await Attempt.countDocuments({
        caseId,
        ownerSessionHash: session.sessionHash,
      }),
    ).toBe(1);
  });

  it("limits simultaneous hint requests to three", async () => {
    const owner = await startSession();
    const create = await fetch(`${baseUrl}/api/v1/demo-case`, {
      method: "POST",
      headers: {
        Cookie: owner.cookie,
        Origin: "http://localhost:5173",
        "X-CSRF-Token": owner.csrfToken,
      },
    });
    const { caseId } = (await create.json()) as { caseId: string };
    const requests = Array.from({ length: 5 }, (_, index) =>
      fetch(`${baseUrl}/api/v1/cases/${caseId}/hints`, {
        method: "POST",
        headers: {
          Cookie: owner.cookie,
          Origin: "http://localhost:5173",
          "X-CSRF-Token": owner.csrfToken,
          "Content-Type": "application/json",
          "Idempotency-Key": `racing-hint-${index}`,
        },
        body: "{}",
      }),
    );
    const responses = await Promise.all(requests);
    expect(
      responses.filter((response) => response.status === 200),
    ).toHaveLength(3);
    expect(
      responses.filter((response) => response.status === 409),
    ).toHaveLength(2);
    expect(await HintProgress.findOne({ caseId }).lean()).toMatchObject({
      count: 3,
    });
  });
});

it("persists unique discoveries, enforces ownership, and scores server-side", async () => {
  const owner = await startSession();
  const other = await startSession();
  const headers = {
    Cookie: owner.cookie,
    Origin: "http://localhost:5173",
    "X-CSRF-Token": owner.csrfToken,
    "Content-Type": "application/json",
  };
  const created = await fetch(`${baseUrl}/api/v1/demo-case`, {
    method: "POST",
    headers,
    body: "{}",
  });
  const { caseId } = (await created.json()) as { caseId: string };
  const url = `${baseUrl}/api/v1/cases/${caseId}/clues/ev_02/discover`;
  for (let i = 0; i < 2; i++) {
    const discovered = await fetch(url, {
      method: "POST",
      headers,
      body: "{}",
    });
    expect(discovered.status).toBe(200);
    expect((await discovered.json()).discoveredEvidenceIds).toEqual(["ev_02"]);
  }
  const denied = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      Cookie: other.cookie,
      "X-CSRF-Token": other.csrfToken,
    },
    body: "{}",
  });
  expect(denied.status).toBe(404);
  const verdict = await fetch(`${baseUrl}/api/v1/cases/${caseId}/accusations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ suspectId: "sus_03" }),
  });
  expect((await verdict.json()).score).toBe(155);
  expect(
    (await fetch(url, { method: "POST", headers, body: "{}" })).status,
  ).toBe(409);
});
