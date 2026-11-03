import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoCase } from "./demoCase.js";
import {
  authorLocalCanonical,
  validateCanonicalDraft,
} from "./localGeneration.js";

const draftFixture = () => {
  const { mystery, secret } = createDemoCase("owner", "case_test", new Date());
  return {
    title: mystery.title,
    intro: mystery.intro,
    settingTimeZone: mystery.settingTimeZone,
    suspects: mystery.suspects,
    culpritId: secret.culpritId,
    evidence: mystery.evidence,
    proofChain: secret.proofChain,
    redHerrings: secret.redHerrings,
    explanation: secret.explanation,
    hintTexts: secret.hintTexts,
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("local case generation", () => {
  it("rejects a mystery without the minimum distinct proof exhibits", () => {
    const draft = draftFixture();
    expect(() =>
      validateCanonicalDraft({
        ...draft,
        proofChain: draft.proofChain.slice(0, 2),
      }),
    ).toThrow(/at least three distinct evidence items/);
  });

  it("uses only the local Ollama endpoint and validates generated JSON", async () => {
    const draft = draftFixture();
    vi.stubEnv("LOCAL_LLM_ENABLED", "true");
    vi.stubEnv("LOCAL_LLM_MODEL", "qwen3");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("/api/tags")) {
          return new Response(
            JSON.stringify({ models: [{ name: "qwen3:latest" }] }),
            { status: 200 },
          );
        }
        const body = JSON.parse(String(init?.body)) as {
          messages: { role: string; content: string }[];
        };
        const isCritic = body.messages[0]?.content.includes(
          "adversarial validator",
        );
        const content = isCritic
          ? JSON.stringify({ pass: true, issues: [] })
          : JSON.stringify(draft);
        return new Response(JSON.stringify({ message: { content } }), {
          status: 200,
        });
      }),
    );

    const result = await authorLocalCanonical({
      scenario: mysteryScenario,
      difficulty: "medium",
    });
    expect(result.culpritId).toBe("sus_03");
    expect(
      calls.every((url) => url.startsWith("http://127.0.0.1:11434/")),
    ).toBe(true);
    expect(
      calls.some(
        (url) =>
          url.includes("googleapis.com") || url.includes("generativelanguage"),
      ),
    ).toBe(false);
  });

  it("does not allow a non-loopback local model endpoint", async () => {
    vi.stubEnv("LOCAL_LLM_BASE_URL", "http://example.com");
    const { getLocalModelStatus } = await import("./localGeneration.js");
    await expect(getLocalModelStatus()).resolves.toMatchObject({
      available: false,
      reason: "The local model must run on this computer over localhost.",
    });
  });
});

const mysteryScenario =
  "A rare pocket watch disappears from a locked study during a stormy reunion.";
