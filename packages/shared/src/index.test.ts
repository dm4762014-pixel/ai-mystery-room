import { describe, expect, it } from "vitest";
import {
  calculateScore,
  CreateCaseRequestSchema,
  PublicCaseSchema,
} from "./index.js";

describe("shared request schemas", () => {
  it("accepts a normalized scenario within the specified range", () => {
    expect(
      CreateCaseRequestSchema.safeParse({
        scenario:
          "A rare pocket watch disappears from a locked study during a stormy reunion.",
        difficulty: "medium",
        mediaTier: "standard",
      }).success,
    ).toBe(true);
  });

  it("rejects short scenarios, unknown properties and unsupported media choices", () => {
    expect(
      CreateCaseRequestSchema.safeParse({
        scenario: "Too short",
        difficulty: "medium",
        mediaTier: "standard",
      }).success,
    ).toBe(false);
    expect(
      CreateCaseRequestSchema.safeParse({
        scenario:
          "A rare pocket watch disappears from a locked study during a stormy reunion.",
        difficulty: "medium",
        mediaTier: "standard",
        culpritId: "sus_03",
      }).success,
    ).toBe(false);
  });

  it("rejects empty suspects and clues in public cases", () => {
    const result = PublicCaseSchema.safeParse({
      caseId: "case_1",
      title: "Test",
      intro: "Test intro",
      difficulty: "easy",
      mediaTier: "standard",
      settingTimeZone: "UTC",
      suspects: [],
      evidence: [],
      generatedMediaDisclosure: "Fictional demo.",
      hintCount: 0,
      verdictSubmitted: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("submission scoring", () => {
  it("uses difficulty bonuses, unique discoveries and hint penalties", () => {
    expect(calculateScore("easy", true, 5, 2)).toBe(105);
    expect(calculateScore("medium", true, 7, 3)).toBe(155);
    expect(calculateScore("hard", true, 9, 0)).toBe(245);
    expect(calculateScore("easy", false, 5, 0)).toBe(25);
    expect(calculateScore("hard", false, 0, 3)).toBe(0);
  });
});
