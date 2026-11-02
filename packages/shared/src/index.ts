import { z } from "zod";

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);
export const MediaTierSchema = z.enum(["standard", "full"]);
export type Difficulty = z.infer<typeof DifficultySchema>;
export type MediaTier = z.infer<typeof MediaTierSchema>;

const ChatMessageSchema = z
  .object({
    messageId: z.string().min(1),
    senderName: z.string().min(1),
    sentAt: z.string().datetime({ offset: true }),
    text: z.string().min(1),
  })
  .strict();

export const EvidenceSchema = z.discriminatedUnion("type", [
  z
    .object({
      evidenceId: z.string().min(1),
      type: z.literal("chat"),
      title: z.string().min(1),
      occurredAt: z.string().datetime({ offset: true }),
      description: z.string().min(1),
      chat: z
        .object({
          participants: z.array(z.string()).min(2),
          messages: z.array(ChatMessageSchema).min(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      evidenceId: z.string().min(1),
      type: z.literal("photo"),
      title: z.string().min(1),
      occurredAt: z.string().datetime({ offset: true }),
      description: z.string().min(1),
      assetId: z.string().optional(),
    })
    .strict(),
  z
    .object({
      evidenceId: z.string().min(1),
      type: z.literal("cctv"),
      title: z.string().min(1),
      occurredAt: z.string().datetime({ offset: true }),
      description: z.string().min(1),
      assetId: z.string().optional(),
      cctv: z
        .object({
          rendition: z.enum(["still", "video"]),
          transcript: z.string().min(1),
          durationMs: z.number().int().positive().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      evidenceId: z.string().min(1),
      type: z.enum(["document", "witness"]),
      title: z.string().min(1),
      occurredAt: z.string().datetime({ offset: true }),
      description: z.string().min(1),
      recordText: z.string().min(1),
    })
    .strict(),
]);
export type Evidence = z.infer<typeof EvidenceSchema>;

export const SuspectSchema = z
  .object({
    suspectId: z.string().min(1),
    name: z.string().min(1),
    role: z.string().min(1),
    relationshipToCase: z.string().min(1),
    visibleStatement: z.string().min(1),
  })
  .strict();
export type Suspect = z.infer<typeof SuspectSchema>;

const ProofStepSchema = z
  .object({
    evidenceId: z.string().min(1),
    inference: z.string().min(1).max(500),
  })
  .strict();

const RedHerringSchema = z
  .object({
    evidenceId: z.string().min(1),
    explanation: z.string().min(1).max(500),
  })
  .strict();

export const CanonicalDraftSchema = z
  .object({
    title: z.string().min(4).max(100),
    intro: z.string().min(30).max(700),
    settingTimeZone: z.string().min(1).max(80),
    suspects: z.array(SuspectSchema).min(3).max(5),
    culpritId: z.string().min(1),
    evidence: z.array(EvidenceSchema).min(5).max(9),
    proofChain: z.array(ProofStepSchema).min(3).max(6),
    redHerrings: z.array(RedHerringSchema).min(2).max(4),
    explanation: z.string().min(40).max(1200),
    hintTexts: z.array(z.string().min(10).max(300)).min(2).max(3),
  })
  .strict();
export type CanonicalDraft = z.infer<typeof CanonicalDraftSchema>;

export const GenerationJobStatusSchema = z.enum([
  "queued",
  "generating",
  "ready",
  "failed",
]);
export const GenerationJobResponseSchema = z
  .object({
    jobId: z.string().min(1),
    status: GenerationJobStatusSchema,
    caseId: z.string().optional(),
    errorCode: z.string().optional(),
  })
  .strict();
export const GenerationJobStatusResponseSchema = z
  .object({
    jobId: z.string().min(1),
    status: GenerationJobStatusSchema,
    step: z.string().min(1),
    progressPercent: z.number().int().min(0).max(100),
    caseId: z.string().optional(),
    errorCode: z.string().optional(),
  })
  .strict();

export const CapabilitiesResponseSchema = z
  .object({
    standard: z.boolean(),
    full: z.literal(false),
    localText: z
      .object({
        available: z.boolean(),
        model: z.string(),
        reason: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export const LocalGenerationDisclosure =
  "Case text was generated locally with an open-weight language model. Photo exhibits use schematic drawings, not generated photographs; CCTV is text-only, with no video.";

export const PublicCaseSchema = z
  .object({
    caseId: z.string().min(1),
    title: z.string().min(1),
    intro: z.string().min(1),
    difficulty: DifficultySchema,
    mediaTier: MediaTierSchema,
    settingTimeZone: z.string().min(1),
    suspects: z.array(SuspectSchema).min(3).max(5),
    evidence: z.array(EvidenceSchema).min(5).max(9),
    generatedMediaDisclosure: z.string().min(1),
    hintCount: z.number().int().min(0).max(3),
    verdictSubmitted: z.boolean(),
    hintsRevealed: z.array(z.string()).default([]),
    discoveredEvidenceIds: z.array(z.string()).default([]),
  })
  .strict();
export type PublicCaseDTO = z.infer<typeof PublicCaseSchema>;

export const CreateCaseRequestSchema = z
  .object({
    scenario: z.string().trim().min(30).max(600),
    difficulty: DifficultySchema,
    mediaTier: MediaTierSchema,
  })
  .strict();
export type CreateCaseRequest = z.infer<typeof CreateCaseRequestSchema>;

export const AccusationRequestSchema = z
  .object({
    suspectId: z.string().min(1).max(80),
    citedEvidenceIds: z.array(z.string().min(1).max(80)).max(9).optional(),
    reason: z.string().max(1000).optional(),
  })
  .strict();
export type AccusationRequest = z.infer<typeof AccusationRequestSchema>;

export const ErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        requestId: z.string(),
      })
      .strict(),
  })
  .strict();

export const GuestSessionResponseSchema = z
  .object({
    csrfToken: z.string().min(1),
    expiresAt: z.string().datetime(),
  })
  .strict();

export const DemoCaseResponseSchema = z
  .object({
    caseId: z.string().min(1),
    status: z.literal("ready"),
    demo: z.literal(true),
  })
  .strict();

export const HintResponseSchema = z
  .object({
    hintNumber: z.number().int().min(1).max(3),
    hintText: z.string().min(1),
    hintCount: z.number().int().min(1).max(3),
  })
  .strict();

export const AccusationResponseSchema = z
  .object({
    isCorrect: z.boolean(),
    score: z.number().int().min(0).max(245),
    correctSuspectId: z.string().min(1),
    resultPath: z.string().startsWith("/result/"),
  })
  .strict();

export const CaseResultSchema = z
  .object({
    chosenSuspectId: z.string().min(1),
    correctSuspectId: z.string().min(1),
    isCorrect: z.boolean(),
    score: z.number().int().min(0).max(245),
    hintsUsed: z.number().int().min(0).max(3),
    citedEvidenceIds: z.array(z.string()),
    proofChain: z
      .array(
        z
          .object({
            evidenceId: z.string().min(1),
            inference: z.string().min(1),
          })
          .strict(),
      )
      .min(3),
    redHerrings: z.array(
      z
        .object({
          evidenceId: z.string().min(1),
          explanation: z.string().min(1),
        })
        .strict(),
    ),
    explanation: z.string().min(1),
  })
  .strict();

export type CaseResult = z.infer<typeof CaseResultSchema>;

export const FICTION_DISCLOSURE =
  "All characters and evidence in this demo are fictional. Demo illustrations are placeholders, not AI-generated media.";

export const DIFFICULTY_RULES = {
  easy: { suspects: 3, clues: 5, hints: 2, bonus: 100 },
  medium: { suspects: 4, clues: 7, hints: 3, bonus: 150 },
  hard: { suspects: 5, clues: 9, hints: 3, bonus: 200 },
} as const;
export function calculateScore(
  difficulty: Difficulty,
  correct: boolean,
  discoveries: number,
  hints: number,
): number {
  return Math.max(
    0,
    (correct ? DIFFICULTY_RULES[difficulty].bonus : 0) +
      5 * discoveries -
      10 * hints,
  );
}
