import mongoose, { Schema } from "mongoose";
import type { Evidence, Suspect } from "./shared/index.js";

export interface GuestSessionDocument {
  sessionHash: string;
  csrfToken: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface CaseDocument {
  caseId: string;
  ownerSessionHash: string;
  title: string;
  intro: string;
  scenario: string;
  difficulty: "easy" | "medium" | "hard";
  mediaTier: "standard" | "full";
  settingTimeZone: string;
  suspects: Suspect[];
  evidence: Evidence[];
  discoveredEvidenceIds?: string[];
  fixture: boolean;
  status: "ready" | "failed";
  createdAt: Date;
  expiresAt: Date;
}

export interface CaseSecretDocument {
  caseId: string;
  culpritId: string;
  hintTexts: string[];
  proofChain: { evidenceId: string; inference: string }[];
  redHerrings: { evidenceId: string; explanation: string }[];
  explanation: string;
  expiresAt: Date;
}

export interface HintProgressDocument {
  caseId: string;
  ownerSessionHash: string;
  count: number;
  idempotencyKeys: { key: string; hintNumber: number }[];
  updatedAt: Date;
  expiresAt: Date;
}

export interface AttemptDocument {
  caseId: string;
  ownerSessionHash: string;
  suspectId: string;
  citedEvidenceIds: string[];
  reason?: string;
  isCorrect: boolean;
  score: number;
  hintsUsed: number;
  submittedAt: Date;
  expiresAt: Date;
}

export interface GenerationJobDocument {
  jobId: string;
  ownerSessionHash: string;
  idempotencyKeyHash: string;
  requestHash: string;
  scenario: string;
  difficulty: "easy" | "medium" | "hard";
  status: "queued" | "generating" | "ready" | "failed";
  step: string;
  progressPercent: number;
  caseId?: string;
  errorCode?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

const sessionSchema = new Schema<GuestSessionDocument>(
  {
    sessionHash: { type: String, required: true, unique: true },
    csrfToken: { type: String, required: true },
    createdAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { versionKey: false },
);

const caseSchema = new Schema<CaseDocument>(
  {
    caseId: { type: String, required: true, unique: true },
    ownerSessionHash: { type: String, required: true, index: true },
    title: { type: String, required: true },
    intro: { type: String, required: true },
    scenario: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: true,
    },
    mediaTier: { type: String, enum: ["standard", "full"], required: true },
    settingTimeZone: { type: String, required: true },
    suspects: {
      type: [
        new Schema<Suspect>(
          {
            suspectId: { type: String, required: true },
            name: { type: String, required: true },
            role: { type: String, required: true },
            relationshipToCase: { type: String, required: true },
            visibleStatement: { type: String, required: true },
          },
          { _id: false, versionKey: false },
        ),
      ],
      required: true,
    },
    evidence: {
      type: [
        new Schema<Evidence>(
          {},
          { _id: false, versionKey: false, strict: false },
        ),
      ],
      required: true,
    },
    discoveredEvidenceIds: { type: [String], default: [] },
    fixture: { type: Boolean, required: true, default: false },
    status: { type: String, enum: ["ready", "failed"], required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { versionKey: false },
);
caseSchema.index(
  { ownerSessionHash: 1, fixture: 1 },
  { unique: true, partialFilterExpression: { fixture: true } },
);

const secretSchema = new Schema<CaseSecretDocument>(
  {
    caseId: { type: String, required: true, unique: true },
    culpritId: { type: String, required: true },
    hintTexts: { type: [String], required: true },
    proofChain: {
      type: [
        new Schema<CaseSecretDocument["proofChain"][number]>(
          {
            evidenceId: { type: String, required: true },
            inference: { type: String, required: true },
          },
          { _id: false, versionKey: false },
        ),
      ],
      required: true,
    },
    redHerrings: {
      type: [
        new Schema<CaseSecretDocument["redHerrings"][number]>(
          {
            evidenceId: { type: String, required: true },
            explanation: { type: String, required: true },
          },
          { _id: false, versionKey: false },
        ),
      ],
      required: true,
    },
    explanation: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { versionKey: false },
);

const hintSchema = new Schema<HintProgressDocument>(
  {
    caseId: { type: String, required: true },
    ownerSessionHash: { type: String, required: true },
    count: { type: Number, required: true, min: 0, max: 3 },
    idempotencyKeys: {
      type: [
        {
          key: { type: String, required: true },
          hintNumber: { type: Number, required: true },
        },
      ],
      required: true,
      default: [],
    },
    updatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { versionKey: false },
);
hintSchema.index({ caseId: 1, ownerSessionHash: 1 }, { unique: true });

const attemptSchema = new Schema<AttemptDocument>(
  {
    caseId: { type: String, required: true },
    ownerSessionHash: { type: String, required: true },
    suspectId: { type: String, required: true },
    citedEvidenceIds: { type: [String], required: true },
    reason: { type: String },
    isCorrect: { type: Boolean, required: true },
    score: { type: Number, required: true },
    hintsUsed: { type: Number, required: true },
    submittedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { versionKey: false },
);
attemptSchema.index({ caseId: 1, ownerSessionHash: 1 }, { unique: true });

const generationJobSchema = new Schema<GenerationJobDocument>(
  {
    jobId: { type: String, required: true, unique: true },
    ownerSessionHash: { type: String, required: true },
    idempotencyKeyHash: { type: String, required: true },
    requestHash: { type: String, required: true },
    scenario: { type: String, required: true, maxlength: 600 },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: true,
    },
    status: {
      type: String,
      enum: ["queued", "generating", "ready", "failed"],
      required: true,
    },
    step: { type: String, required: true },
    progressPercent: { type: Number, required: true, min: 0, max: 100 },
    caseId: { type: String },
    errorCode: { type: String },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { versionKey: false },
);
generationJobSchema.index(
  { ownerSessionHash: 1, idempotencyKeyHash: 1 },
  { unique: true },
);
generationJobSchema.index({ ownerSessionHash: 1, createdAt: -1 });

export const GuestSession = mongoose.model("GuestSession", sessionSchema);
export const MysteryCase = mongoose.model("MysteryCase", caseSchema);
export const CaseSecret = mongoose.model("CaseSecret", secretSchema);
export const HintProgress = mongoose.model("HintProgress", hintSchema);
export const Attempt = mongoose.model("Attempt", attemptSchema);
export const GenerationJob = mongoose.model(
  "GenerationJob",
  generationJobSchema,
);
