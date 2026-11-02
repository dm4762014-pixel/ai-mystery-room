import { generationStatus, usesGemini } from "./generation.js";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import cookie from "cookie";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import {
  DIFFICULTY_RULES,
  calculateScore,
  AccusationRequestSchema,
  CreateCaseRequestSchema,
  LocalGenerationDisclosure,
  PublicCaseSchema,
  type PublicCaseDTO,
} from "@mystery/shared";
import { createDemoCase } from "./demoCase.js";
import { LocalModelError } from "./localGeneration.js";
import { enqueueLocalGeneration } from "./localGenerationJobs.js";
import {
  Attempt,
  CaseSecret,
  GenerationJob,
  GuestSession,
  HintProgress,
  MysteryCase,
  type GuestSessionDocument,
} from "./models.js";

const COOKIE_NAME = "mystery_guest";
const DAY = 24 * 60 * 60 * 1000;
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const isProduction = process.env.NODE_ENV === "production";

const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const equal = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

interface AuthenticatedRequest extends Request {
  sessionHash?: string;
  requestId?: string;
}

const routeParam = (request: Request, key: string): string => {
  const value = request.params[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
};

const sendError = (
  response: Response,
  request: AuthenticatedRequest,
  status: number,
  code: string,
  message: string,
): void => {
  response.status(status).json({
    error: { code, message, requestId: request.requestId ?? randomUUID() },
  });
};

const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
app.use((request: Request, response: Response, next: NextFunction) => {
  const typed = request as AuthenticatedRequest;
  typed.requestId = randomUUID();
  response.setHeader("X-Request-Id", typed.requestId);
  next();
});
app.use(express.json({ limit: "16kb", strict: true }));

app.get("/api/v1/health/live", (_request, response) =>
  response.json({ status: "ok" }),
);
app.get("/api/v1/health/ready", (_request, response) => {
  const ready = mongoose.connection.readyState === 1;
  response
    .status(ready ? 200 : 503)
    .json({ status: ready ? "ok" : "unavailable" });
});
app.get("/api/v1/capabilities", async (_request, response, next) => {
  try {
    const localText = await generationStatus();
    response.json({ standard: localText.available, full: false, localText });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/sessions/guest", async (request, response, next) => {
  try {
    const parsedCookie = cookie.parse(request.headers.cookie ?? "");
    const existingToken = parsedCookie[COOKIE_NAME];
    const existingHash = existingToken ? hash(existingToken) : undefined;
    let session: GuestSessionDocument | null = existingHash
      ? await GuestSession.findOne({
          sessionHash: existingHash,
          expiresAt: { $gt: new Date() },
        }).lean()
      : null;
    const now = new Date();
    let rawToken = existingToken;
    if (!session) {
      rawToken = randomBytes(32).toString("base64url");
      session = {
        sessionHash: hash(rawToken),
        csrfToken: randomBytes(32).toString("base64url"),
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + 30 * DAY),
      };
      await GuestSession.create(session);
    } else {
      const maxExpiry = new Date(session.createdAt.getTime() + 90 * DAY);
      session.expiresAt = new Date(
        Math.min(now.getTime() + 30 * DAY, maxExpiry.getTime()),
      );
      session.lastSeenAt = now;
      await GuestSession.updateOne(
        { sessionHash: session.sessionHash },
        { $set: { expiresAt: session.expiresAt, lastSeenAt: now } },
      );
    }
    if (!rawToken) throw new Error("Session token could not be established.");
    response.cookie(COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });
    response.status(201).json({
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

const requireSession = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = cookie.parse(request.headers.cookie ?? "")[COOKIE_NAME];
    if (!token) {
      sendError(
        response,
        request,
        401,
        "SESSION_REQUIRED",
        "Start a guest session to continue.",
      );
      return;
    }
    const sessionHash = hash(token);
    const session = await GuestSession.findOne({
      sessionHash,
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!session) {
      sendError(
        response,
        request,
        401,
        "SESSION_EXPIRED",
        "Your guest session has expired. Start a new session.",
      );
      return;
    }
    request.sessionHash = sessionHash;
    const now = new Date();
    const maxExpiry = new Date(session.createdAt.getTime() + 90 * DAY);
    const expiresAt = new Date(
      Math.min(now.getTime() + 30 * DAY, maxExpiry.getTime()),
    );
    await GuestSession.updateOne(
      { sessionHash },
      { $set: { lastSeenAt: now, expiresAt } },
    );
    response.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    next();
  } catch (error) {
    next(error);
  }
};

const requireCsrf = (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): void => {
  const origin = request.get("origin");
  if (origin !== webOrigin) {
    sendError(
      response,
      request,
      403,
      "ORIGIN_REJECTED",
      "This request origin is not allowed.",
    );
    return;
  }
  void GuestSession.findOne({ sessionHash: request.sessionHash })
    .lean()
    .then((session) => {
      const token = request.get("x-csrf-token");
      if (!session || !token || !equal(session.csrfToken, token)) {
        sendError(
          response,
          request,
          403,
          "CSRF_REJECTED",
          "Refresh the page and try again.",
        );
        return;
      }
      next();
    })
    .catch(next);
};

const findOwnedCase = (caseId: string, sessionHash: string) =>
  MysteryCase.findOne({
    caseId,
    ownerSessionHash: sessionHash,
    status: "ready",
    expiresAt: { $gt: new Date() },
  }).lean();

const publicDto = async (
  caseId: string,
  sessionHash: string,
): Promise<PublicCaseDTO | null> => {
  const mystery = await findOwnedCase(caseId, sessionHash);
  if (!mystery) return null;
  const [hint, attempt, secret] = await Promise.all([
    HintProgress.findOne({ caseId, ownerSessionHash: sessionHash }).lean(),
    Attempt.findOne({ caseId, ownerSessionHash: sessionHash }).lean(),
    CaseSecret.findOne({ caseId }).lean(),
  ]);
  return PublicCaseSchema.parse({
    caseId: mystery.caseId,
    title: mystery.title,
    intro: mystery.intro,
    difficulty: mystery.difficulty,
    mediaTier: mystery.mediaTier,
    settingTimeZone: mystery.settingTimeZone,
    suspects: mystery.suspects,
    evidence: mystery.evidence,
    generatedMediaDisclosure: mystery.fixture
      ? "All characters and evidence in this demo are fictional. Demo illustrations are placeholders, not AI-generated media."
      : usesGemini()
        ? "Fictional case text generated by Gemini. Photo exhibits are schematics; CCTV is text-only."
        : LocalGenerationDisclosure,
    hintsRevealed: secret?.hintTexts.slice(0, hint?.count ?? 0) ?? [],
    discoveredEvidenceIds: mystery.discoveredEvidenceIds ?? [],
    hintCount: hint?.count ?? 0,
    verdictSubmitted: Boolean(attempt),
  });
};

app.use(
  "/api/v1",
  (request: Request, _response: Response, next: NextFunction) => {
    if (
      request.path === "/sessions/guest" ||
      request.path.startsWith("/health/") ||
      request.path === "/capabilities"
    ) {
      next();
    } else {
      void requireSession(request as AuthenticatedRequest, _response, next);
    }
  },
);

app.post("/api/v1/demo-case", requireCsrf, async (request, response, next) => {
  try {
    if (
      process.env.NODE_ENV !== "development" &&
      process.env.NODE_ENV !== "test"
    ) {
      sendError(
        response,
        request as AuthenticatedRequest,
        404,
        "NOT_FOUND",
        "This resource was not found.",
      );
      return;
    }
    const sessionHash = (request as AuthenticatedRequest).sessionHash;
    if (!sessionHash) throw new Error("Authenticated session is missing.");
    const existing = await MysteryCase.findOne({
      ownerSessionHash: sessionHash,
      fixture: true,
      status: "ready",
    }).lean();
    if (existing) {
      response
        .status(200)
        .json({ caseId: existing.caseId, status: "ready", demo: true });
      return;
    }
    const caseId = `case_${randomUUID()}`;
    const now = new Date();
    const expiry = new Date(now.getTime() + 30 * DAY);
    const template = await MysteryCase.findOne({
      caseId: "case_seeded_demo",
      expiresAt: { $gt: now },
    }).lean();
    const templateSecret = template
      ? await CaseSecret.findOne({ caseId: template.caseId }).lean()
      : null;
    const generated = createDemoCase(sessionHash, caseId, now);
    const mystery =
      template && templateSecret
        ? {
            ...generated.mystery,
            title: template.title,
            intro: template.intro,
            scenario: template.scenario,
            difficulty: template.difficulty,
            mediaTier: template.mediaTier,
            settingTimeZone: template.settingTimeZone,
            suspects: template.suspects,
            evidence: template.evidence,
          }
        : generated.mystery;
    const secret = templateSecret
      ? {
          ...generated.secret,
          culpritId: templateSecret.culpritId,
          hintTexts: templateSecret.hintTexts,
          proofChain: templateSecret.proofChain,
          redHerrings: templateSecret.redHerrings,
          explanation: templateSecret.explanation,
          expiresAt: expiry,
        }
      : generated.secret;
    try {
      await CaseSecret.create(secret);
      await MysteryCase.create(mystery);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === 11000))
        throw error;
      const raced = await MysteryCase.findOne({
        ownerSessionHash: sessionHash,
        fixture: true,
        status: "ready",
      }).lean();
      if (!raced) throw error;
      response
        .status(200)
        .json({ caseId: raced.caseId, status: "ready", demo: true });
      return;
    }
    response.status(201).json({ caseId, status: "ready", demo: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/cases", requireCsrf, async (request, response, next) => {
  const parsed = CreateCaseRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    sendError(
      response as Response,
      request as AuthenticatedRequest,
      400,
      "VALIDATION_ERROR",
      "Scenario must contain 30 to 600 characters and use a supported difficulty and media tier.",
    );
    return;
  }
  if (parsed.data.mediaTier === "full") {
    sendError(
      response as Response,
      request as AuthenticatedRequest,
      503,
      "FULL_MEDIA_UNAVAILABLE",
      "Full video generation is not configured. Choose standard explicitly or play the seeded demo.",
    );
    return;
  }
  const typed = request as AuthenticatedRequest;
  const sessionHash = typed.sessionHash;
  if (!sessionHash) {
    sendError(
      response as Response,
      typed,
      401,
      "SESSION_REQUIRED",
      "Start a guest session to continue.",
    );
    return;
  }
  const idempotencyKey = request.get("idempotency-key");
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) {
    sendError(
      response as Response,
      typed,
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid Idempotency-Key header is required.",
    );
    return;
  }
  try {
    const job = await enqueueLocalGeneration({
      ownerSessionHash: sessionHash,
      scenario: parsed.data.scenario,
      difficulty: parsed.data.difficulty,
      idempotencyKey,
    });
    response.status(202).json(job);
  } catch (error) {
    if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") {
      sendError(
        response as Response,
        typed,
        409,
        "IDEMPOTENCY_CONFLICT",
        "This idempotency key was already used for a different scenario.",
      );
      return;
    }
    if (
      error instanceof LocalModelError &&
      error.code === "LOCAL_MODEL_UNAVAILABLE"
    ) {
      sendError(response as Response, typed, 503, error.code, error.message);
      return;
    }
    next(error);
  }
});

app.get("/api/v1/jobs/:jobId", async (request, response, next) => {
  try {
    const sessionHash = (request as AuthenticatedRequest).sessionHash;
    const job = sessionHash
      ? await GenerationJob.findOne({
          jobId: routeParam(request, "jobId"),
          ownerSessionHash: sessionHash,
        }).lean()
      : null;
    if (!job) {
      sendError(
        response,
        request as AuthenticatedRequest,
        404,
        "NOT_FOUND",
        "This generation job was not found.",
      );
      return;
    }
    response.json({
      jobId: job.jobId,
      status: job.status,
      step: job.step,
      progressPercent: job.progressPercent,
      ...(job.caseId === undefined ? {} : { caseId: job.caseId }),
      ...(job.errorCode === undefined ? {} : { errorCode: job.errorCode }),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/cases/:caseId", async (request, response, next) => {
  try {
    const sessionHash = (request as AuthenticatedRequest).sessionHash;
    if (!sessionHash) throw new Error("Authenticated session is missing.");
    const dto = await publicDto(routeParam(request, "caseId"), sessionHash);
    if (!dto) {
      sendError(
        response,
        request as AuthenticatedRequest,
        404,
        "NOT_FOUND",
        "This case was not found.",
      );
      return;
    }
    response.json(dto);
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/v1/cases/:caseId/clues/:clueId/discover",
  requireCsrf,
  async (request, response, next) => {
    try {
      const sessionHash = (request as AuthenticatedRequest).sessionHash;
      const caseId = routeParam(request, "caseId");
      const clueId = routeParam(request, "clueId");
      const mystery = sessionHash
        ? await findOwnedCase(caseId, sessionHash)
        : null;
      if (
        !mystery ||
        !mystery.evidence.some((item) => item.evidenceId === clueId)
      ) {
        sendError(
          response,
          request as AuthenticatedRequest,
          404,
          "NOT_FOUND",
          "This clue was not found.",
        );
        return;
      }
      const attempt = await Attempt.exists({
        caseId,
        ownerSessionHash: sessionHash,
      });
      if (attempt) {
        sendError(
          response,
          request as AuthenticatedRequest,
          409,
          "VERDICT_ALREADY_SUBMITTED",
          "The investigation is complete.",
        );
        return;
      }
      await MysteryCase.updateOne(
        { caseId, ownerSessionHash: sessionHash },
        { $addToSet: { discoveredEvidenceIds: clueId } },
      );
      response.json(await publicDto(caseId, sessionHash!));
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/v1/cases/:caseId/hints", async (request, response, next) => {
  try {
    const sessionHash = (request as AuthenticatedRequest).sessionHash;
    const caseId = routeParam(request, "caseId");
    if (!sessionHash || !(await findOwnedCase(caseId, sessionHash))) {
      sendError(
        response,
        request as AuthenticatedRequest,
        404,
        "NOT_FOUND",
        "This case was not found.",
      );
      return;
    }
    const [progress, secret] = await Promise.all([
      HintProgress.findOne({ caseId, ownerSessionHash: sessionHash }).lean(),
      CaseSecret.findOne({ caseId }).lean(),
    ]);
    if (!secret) throw new Error("Case solution record is missing.");
    response.json({
      hintCount: progress?.count ?? 0,
      hintsRevealed: secret.hintTexts.slice(0, progress?.count ?? 0),
    });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/v1/cases/:caseId/hints",
  requireCsrf,
  async (request, response, next) => {
    try {
      const sessionHash = (request as AuthenticatedRequest).sessionHash;
      const caseId = routeParam(request, "caseId");
      const ownedCase = sessionHash
        ? await findOwnedCase(caseId, sessionHash)
        : null;
      if (!sessionHash || !ownedCase) {
        sendError(
          response,
          request as AuthenticatedRequest,
          404,
          "NOT_FOUND",
          "This case was not found.",
        );
        return;
      }
      if (await Attempt.exists({ caseId, ownerSessionHash: sessionHash })) {
        sendError(
          response,
          request as AuthenticatedRequest,
          409,
          "VERDICT_ALREADY_SUBMITTED",
          "The investigation is complete.",
        );
        return;
      }
      const headerKey = request.get("idempotency-key");
      if (
        headerKey !== undefined &&
        !/^[A-Za-z0-9._:-]{1,128}$/.test(headerKey)
      ) {
        sendError(
          response,
          request as AuthenticatedRequest,
          400,
          "VALIDATION_ERROR",
          "The idempotency key contains invalid characters or exceeds 128 characters.",
        );
        return;
      }
      const idempotencyKey = headerKey ?? randomUUID();
      const priorProgress = await HintProgress.findOne({
        caseId,
        ownerSessionHash: sessionHash,
        "idempotencyKeys.key": idempotencyKey,
      }).lean();
      if (priorProgress) {
        const priorHint = priorProgress.idempotencyKeys.find(
          (item) => item.key === idempotencyKey,
        );
        if (!priorHint)
          throw new Error("Stored hint idempotency key has no result.");
        const secret = await CaseSecret.findOne({ caseId }).lean();
        if (!secret) throw new Error("Case solution record is missing.");
        response.json({
          hintNumber: priorHint.hintNumber,
          hintText: secret.hintTexts[priorHint.hintNumber - 1],
          hintCount: priorProgress.count,
        });
        return;
      }
      let progress = await HintProgress.findOneAndUpdate(
        {
          caseId,
          ownerSessionHash: sessionHash,
          count: { $lt: DIFFICULTY_RULES[ownedCase.difficulty].hints },
          idempotencyKeys: { $not: { $elemMatch: { key: idempotencyKey } } },
        },
        [
          {
            $set: {
              count: { $add: ["$count", 1] },
              updatedAt: new Date(),
              idempotencyKeys: {
                $concatArrays: [
                  "$idempotencyKeys",
                  [
                    {
                      key: idempotencyKey,
                      hintNumber: { $add: ["$count", 1] },
                    },
                  ],
                ],
              },
            },
          },
        ],
        { new: true },
      ).lean();
      if (!progress) {
        const mystery = await findOwnedCase(caseId, sessionHash);
        if (!mystery) {
          sendError(
            response,
            request as AuthenticatedRequest,
            404,
            "NOT_FOUND",
            "This case was not found.",
          );
          return;
        }
        try {
          progress = (
            await HintProgress.create({
              caseId,
              ownerSessionHash: sessionHash,
              count: 1,
              idempotencyKeys: [{ key: idempotencyKey, hintNumber: 1 }],
              updatedAt: new Date(),
              expiresAt: mystery.expiresAt,
            })
          ).toObject();
        } catch (error) {
          if (!(
            error instanceof Error &&
            "code" in error &&
            error.code === 11000
          ))
            throw error;
          const duplicate = await HintProgress.findOne({
            caseId,
            ownerSessionHash: sessionHash,
            "idempotencyKeys.key": idempotencyKey,
          }).lean();
          const duplicateHint = duplicate?.idempotencyKeys.find(
            (item) => item.key === idempotencyKey,
          );
          if (duplicateHint) {
            const secret = await CaseSecret.findOne({ caseId }).lean();
            if (!secret) throw new Error("Case solution record is missing.");
            response.json({
              hintNumber: duplicateHint.hintNumber,
              hintText: secret.hintTexts[duplicateHint.hintNumber - 1],
              hintCount: duplicate?.count ?? duplicateHint.hintNumber,
            });
            return;
          }
          progress = await HintProgress.findOneAndUpdate(
            {
              caseId,
              ownerSessionHash: sessionHash,
              count: { $lt: DIFFICULTY_RULES[ownedCase.difficulty].hints },
              idempotencyKeys: {
                $not: { $elemMatch: { key: idempotencyKey } },
              },
            },
            [
              {
                $set: {
                  count: { $add: ["$count", 1] },
                  updatedAt: new Date(),
                  idempotencyKeys: {
                    $concatArrays: [
                      "$idempotencyKeys",
                      [
                        {
                          key: idempotencyKey,
                          hintNumber: { $add: ["$count", 1] },
                        },
                      ],
                    ],
                  },
                },
              },
            ],
            { new: true },
          ).lean();
        }
      }
      if (!progress) {
        sendError(
          response,
          request as AuthenticatedRequest,
          409,
          "HINT_LIMIT_REACHED",
          "You have used all hints for this difficulty.",
        );
        return;
      }
      const secret = await CaseSecret.findOne({ caseId }).lean();
      if (!secret) throw new Error("Case solution record is missing.");
      const hintNumber = progress.count;
      response.json({
        hintNumber,
        hintText: secret.hintTexts[hintNumber - 1],
        hintCount: hintNumber,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/v1/cases/:caseId/accusations",
  requireCsrf,
  async (request, response, next) => {
    try {
      const typed = request as AuthenticatedRequest;
      const parsed = AccusationRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(
          response,
          typed,
          400,
          "VALIDATION_ERROR",
          "The accusation data is invalid.",
        );
        return;
      }
      const sessionHash = typed.sessionHash;
      const caseId = routeParam(request, "caseId");
      const mystery = sessionHash
        ? await findOwnedCase(caseId, sessionHash)
        : null;
      if (!sessionHash || !mystery) {
        sendError(
          response,
          typed,
          404,
          "NOT_FOUND",
          "This case was not found.",
        );
        return;
      }
      const suspectIds = new Set(
        mystery.suspects.map((suspect) => suspect.suspectId),
      );
      const evidenceIds = new Set(
        mystery.evidence.map((item) => item.evidenceId),
      );
      if (
        !suspectIds.has(parsed.data.suspectId) ||
        (parsed.data.citedEvidenceIds ?? []).some((id) => !evidenceIds.has(id))
      ) {
        sendError(
          response,
          typed,
          400,
          "INVALID_REFERENCE",
          "Choose a suspect and evidence from this case.",
        );
        return;
      }
      const prior = await Attempt.findOne({
        caseId,
        ownerSessionHash: sessionHash,
      }).lean();
      const secret = await CaseSecret.findOne({ caseId }).lean();
      if (!secret) throw new Error("Case solution record is missing.");
      if (prior) {
        if (
          prior.suspectId !== parsed.data.suspectId ||
          JSON.stringify(prior.citedEvidenceIds) !==
            JSON.stringify(parsed.data.citedEvidenceIds ?? []) ||
          prior.reason !== parsed.data.reason
        ) {
          sendError(
            response,
            typed,
            409,
            "VERDICT_ALREADY_SUBMITTED",
            "Your final accusation has already been submitted.",
          );
          return;
        }
        response.status(201).json({
          isCorrect: prior.isCorrect,
          score: prior.score,
          correctSuspectId: secret.culpritId,
          resultPath: `/result/${caseId}`,
        });
        return;
      }
      const hintProgress = await HintProgress.findOne({
        caseId,
        ownerSessionHash: sessionHash,
      }).lean();
      const isCorrect = parsed.data.suspectId === secret.culpritId;
      const hintsUsed = hintProgress?.count ?? 0;
      const attempt = {
        caseId,
        ownerSessionHash: sessionHash,
        suspectId: parsed.data.suspectId,
        citedEvidenceIds: parsed.data.citedEvidenceIds ?? [],
        ...(parsed.data.reason === undefined
          ? {}
          : { reason: parsed.data.reason }),
        isCorrect,
        score: calculateScore(
          mystery.difficulty,
          isCorrect,
          mystery.discoveredEvidenceIds?.length ?? 0,
          hintsUsed,
        ),
        hintsUsed,
        submittedAt: new Date(),
        expiresAt: mystery.expiresAt,
      };
      try {
        await Attempt.create(attempt);
      } catch (error) {
        if (!(
          error instanceof Error &&
          "code" in error &&
          error.code === 11000
        ))
          throw error;
        const raced = await Attempt.findOne({
          caseId,
          ownerSessionHash: sessionHash,
        }).lean();
        if (
          !raced ||
          raced.suspectId !== parsed.data.suspectId ||
          JSON.stringify(raced.citedEvidenceIds) !==
            JSON.stringify(parsed.data.citedEvidenceIds ?? []) ||
          raced.reason !== parsed.data.reason
        ) {
          sendError(
            response,
            typed,
            409,
            "VERDICT_ALREADY_SUBMITTED",
            "Your final accusation has already been submitted.",
          );
          return;
        }
        response.status(201).json({
          isCorrect: raced.isCorrect,
          score: raced.score,
          correctSuspectId: secret.culpritId,
          resultPath: `/result/${caseId}`,
        });
        return;
      }
      response.status(201).json({
        isCorrect,
        score: attempt.score,
        correctSuspectId: secret.culpritId,
        resultPath: `/result/${caseId}`,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/v1/cases/:caseId/result", async (request, response, next) => {
  try {
    const sessionHash = (request as AuthenticatedRequest).sessionHash;
    const caseId = routeParam(request, "caseId");
    if (!sessionHash || !(await findOwnedCase(caseId, sessionHash))) {
      sendError(
        response,
        request as AuthenticatedRequest,
        404,
        "NOT_FOUND",
        "This case was not found.",
      );
      return;
    }
    const attempt = await Attempt.findOne({
      caseId,
      ownerSessionHash: sessionHash,
    }).lean();
    if (!attempt) {
      sendError(
        response,
        request as AuthenticatedRequest,
        403,
        "VERDICT_REQUIRED",
        "Submit your final accusation to see the case result.",
      );
      return;
    }
    const secret = await CaseSecret.findOne({ caseId }).lean();
    if (!secret) throw new Error("Case solution record is missing.");
    response.json({
      chosenSuspectId: attempt.suspectId,
      correctSuspectId: secret.culpritId,
      isCorrect: attempt.isCorrect,
      score: attempt.score,
      hintsUsed: attempt.hintsUsed,
      citedEvidenceIds: attempt.citedEvidenceIds,
      proofChain: secret.proofChain,
      redHerrings: secret.redHerrings,
      explanation: secret.explanation,
    });
  } catch (error) {
    next(error);
  }
});

app.use(
  (
    error: unknown,
    request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    const typed = request as AuthenticatedRequest;
    if (response.headersSent) return;
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      (error.status === 400 || error.status === 413)
        ? error.status
        : 500;
    const code =
      status === 413
        ? "PAYLOAD_TOO_LARGE"
        : status === 400
          ? "INVALID_JSON"
          : "INTERNAL_ERROR";
    const message =
      status === 413
        ? "The request payload is too large."
        : status === 400
          ? "The request body must be valid JSON."
          : "The request could not be completed.";
    console.error(
      JSON.stringify({
        requestId: typed.requestId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    sendError(response, typed, status, code, message);
  },
);

export default app;
