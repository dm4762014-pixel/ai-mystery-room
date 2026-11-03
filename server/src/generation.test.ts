import { afterEach, describe, expect, it, vi } from "vitest";
import { DIFFICULTY_RULES, type Difficulty } from "./shared/index.js";
import { createDemoCase } from "./demoCase.js";
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));
import { authorCanonical } from "./generation.js";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  vi.useRealTimers();
});
function setup() {
  vi.stubEnv("GENERATION_PROVIDER", "gemini");
  vi.stubEnv("AI_GENERATION_ENABLED", "true");
  vi.stubEnv("GEMINI_API_KEY", "mock-only");
}
describe("Gemini authoring", () => {
  for (const difficulty of ["easy", "medium", "hard"] as Difficulty[]) {
    it(`validates ${difficulty} counts with an independent critique`, async () => {
      setup();
      const { mystery, secret } = createDemoCase("owner", "test", new Date());
      let suspects = mystery.suspects;
      let evidence = mystery.evidence;
      if (difficulty === "easy") {
        suspects = suspects.slice(0, 3);
        evidence = evidence.filter(
          (e) => !["ev_01", "ev_05"].includes(e.evidenceId),
        );
      }
      if (difficulty === "hard") {
        suspects = [
          ...suspects,
          { ...suspects[0]!, suspectId: "sus_05", name: "Iris Moon" },
        ];
        evidence = [
          ...evidence,
          { ...evidence[0]!, evidenceId: "ev_08" },
          { ...evidence[1]!, evidenceId: "ev_09" },
        ];
      }
      const draft = {
        title: mystery.title,
        intro: mystery.intro,
        settingTimeZone: mystery.settingTimeZone,
        suspects,
        evidence,
        culpritId: secret.culpritId,
        proofChain: secret.proofChain,
        redHerrings: secret.redHerrings.map((r) => ({
          ...r,
          evidenceId:
            r.evidenceId === "ev_01" && difficulty === "easy"
              ? "ev_02"
              : r.evidenceId,
        })),
        explanation: secret.explanation,
        hintTexts: secret.hintTexts.slice(
          0,
          DIFFICULTY_RULES[difficulty].hints,
        ),
      };
      generateContent
        .mockResolvedValueOnce({ text: JSON.stringify(draft) })
        .mockResolvedValueOnce({
          text: JSON.stringify({ pass: true, issues: [] }),
        });
      const result = await authorCanonical({
        scenario: "A fictional watch disappears during a storm at a reunion.",
        difficulty,
      });
      expect(result.suspects).toHaveLength(
        DIFFICULTY_RULES[difficulty].suspects,
      );
      expect(result.evidence).toHaveLength(DIFFICULTY_RULES[difficulty].clues);
      expect(generateContent).toHaveBeenCalledTimes(2);
    });
  }
  it("bounds malformed JSON attempts and never accepts a case", async () => {
    setup();
    generateContent.mockResolvedValue({ text: "not json" });
    await expect(
      authorCanonical({
        scenario: "A fictional watch vanishes in a locked room.",
        difficulty: "easy",
      }),
    ).rejects.toMatchObject({ code: "INVALID_GENERATED_CASE" });
    expect(generateContent).toHaveBeenCalledTimes(3);
  });
  it("does not call the provider when generation is disabled", async () => {
    setup();
    vi.stubEnv("AI_GENERATION_ENABLED", "false");
    await expect(
      authorCanonical({
        scenario: "A fictional watch vanishes in a locked room.",
        difficulty: "easy",
      }),
    ).rejects.toThrow(/disabled/);
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe("Gemini provider failures", () => {
  for (const [status, code] of [
    [503, "GEMINI_BUSY"],
    [429, "GEMINI_QUOTA_EXCEEDED"],
    [404, "GEMINI_MODEL_UNAVAILABLE"],
    [400, "GEMINI_REQUEST_INVALID"],
    [403, "GEMINI_ACCESS_DENIED"],
  ] as const) {
    it(`reports ${status} with bounded transient retries and no leaked details`, async () => {
      setup();
      vi.useFakeTimers();
      generateContent.mockRejectedValue(
        Object.assign(new Error("private provider details"), { status }),
      );
      const assertion = expect(
        authorCanonical({
          scenario: "A fictional lens vanishes from an observatory.",
          difficulty: "easy",
        }),
      ).rejects.toMatchObject({
        code,
        message: "Gemini could not complete generation.",
      });
      await vi.runAllTimersAsync();
      await assertion;
      expect(generateContent).toHaveBeenCalledTimes(status === 503 ? 3 : 1);
    });
  }
});

it("retries the critic after overload without generating another draft", async () => {
  setup();
  vi.useFakeTimers();
  const { mystery, secret } = createDemoCase("owner", "retry_test", new Date());
  const draft = {
    title: mystery.title,
    intro: mystery.intro,
    settingTimeZone: mystery.settingTimeZone,
    suspects: mystery.suspects,
    evidence: mystery.evidence,
    culpritId: secret.culpritId,
    proofChain: secret.proofChain,
    redHerrings: secret.redHerrings,
    explanation: secret.explanation,
    hintTexts: secret.hintTexts,
  };
  generateContent
    .mockResolvedValueOnce({ text: JSON.stringify(draft) })
    .mockRejectedValueOnce(Object.assign(new Error("busy"), { status: 503 }))
    .mockResolvedValueOnce({
      text: JSON.stringify({ pass: true, issues: [] }),
    });
  const promise = authorCanonical({
    scenario: "A fictional watch disappears during a storm.",
    difficulty: "medium",
  });
  await vi.runAllTimersAsync();
  expect((await promise).title).toBe(draft.title);
  expect(generateContent).toHaveBeenCalledTimes(3);
  expect(generateContent.mock.calls[1]?.[0]).toEqual(
    generateContent.mock.calls[2]?.[0],
  );
});
