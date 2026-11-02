import { createDemoCase } from "../../api/src/demoCase.js";
import { expect, test } from "@playwright/test";

test("home page explains and offers the seeded demo", async ({ page }) => {
  await page.route("**/api/v1/sessions/guest", (route) =>
    route.fulfill({
      json: {
        csrfToken: "playwright-test-token",
        expiresAt: "2030-01-01T00:00:00.000Z",
      },
    }),
  );
  await page.route("**/api/v1/capabilities", (route) =>
    route.fulfill({
      json: {
        standard: false,
        full: false,
        localText: {
          available: false,
          model: "qwen3",
          reason: "Ollama is not available in this browser smoke test.",
        },
      },
    }),
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /every detail/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /play the seeded demo/i }),
  ).toBeVisible();
});

for (const width of [1280, 375]) {
  test(`investigate and solve the existing demo at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { mystery, secret } = createDemoCase(
      "browser-owner",
      "case_browser",
      new Date(),
    );
    const discovered = new Set<string>();
    let hintCount = 0;
    let submitted = false;
    const dto = () => ({
      caseId: mystery.caseId,
      title: mystery.title,
      intro: mystery.intro,
      difficulty: mystery.difficulty,
      mediaTier: mystery.mediaTier,
      settingTimeZone: mystery.settingTimeZone,
      suspects: mystery.suspects,
      evidence: mystery.evidence,
      generatedMediaDisclosure: "Fictional seeded demo.",
      hintCount,
      hintsRevealed: secret.hintTexts.slice(0, hintCount),
      verdictSubmitted: submitted,
      discoveredEvidenceIds: [...discovered],
    });
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/sessions/guest"))
        return route.fulfill({
          json: {
            csrfToken: "test-token",
            expiresAt: "2030-01-01T00:00:00.000Z",
          },
        });
      if (path.endsWith("/capabilities"))
        return route.fulfill({
          json: {
            standard: false,
            full: false,
            localText: { available: false, model: "test" },
          },
        });
      if (path.endsWith("/demo-case"))
        return route.fulfill({
          json: { caseId: mystery.caseId, status: "ready", demo: true },
        });
      if (path.endsWith("/discover")) {
        discovered.add(path.split("/").at(-2)!);
        return route.fulfill({ json: dto() });
      }
      if (path.endsWith("/hints")) {
        hintCount++;
        return route.fulfill({
          json: {
            hintNumber: hintCount,
            hintCount,
            hintText: secret.hintTexts[hintCount - 1],
          },
        });
      }
      if (path.endsWith("/accusations")) {
        expect(route.request().postDataJSON().suspectId).toBe(secret.culpritId);
        submitted = true;
        return route.fulfill({
          json: {
            isCorrect: true,
            score: 175,
            correctSuspectId: secret.culpritId,
            resultPath: `/result/${mystery.caseId}`,
          },
        });
      }
      if (path.endsWith("/result"))
        return route.fulfill({
          json: {
            chosenSuspectId: secret.culpritId,
            correctSuspectId: secret.culpritId,
            isCorrect: true,
            score: 175,
            hintsUsed: 1,
            citedEvidenceIds: [],
            proofChain: secret.proofChain,
            redHerrings: secret.redHerrings,
            explanation: secret.explanation,
          },
        });
      return route.fulfill({ json: dto() });
    });
    await page.goto("/");
    await page.getByRole("button", { name: /play the seeded demo/i }).click();
    for (let index = 0; index < mystery.evidence.length; index++)
      await page.locator(".evidence-row").nth(index).click();
    await expect(
      page.locator(".evidence-panel .count-badge").first(),
    ).toHaveText("7/7");
    await page.getByRole("button", { name: /reveal next hint/i }).click();
    await expect(page.locator(".hint-card")).toHaveCount(1);
    await page.getByRole("button", { name: /Nia Bell/i }).click();
    await page.getByRole("button", { name: /make accusation/i }).click();
    await page.getByRole("button", { name: /submit final verdict/i }).click();
    await expect(
      page.getByRole("heading", { name: "Well observed." }),
    ).toBeVisible();
    await expect(page.locator(".score-card b")).toHaveText("175");
    await page.getByRole("button", { name: /start a new mystery/i }).click();
    await expect(
      page.getByRole("heading", { name: /every detail/i }),
    ).toBeVisible();
  });
}
