import { authorCanonical } from "./generation.js";
import { createHash, randomUUID } from "node:crypto";
import { toPublicEvidence } from "./localGeneration.js";
import {
  CaseSecret,
  GenerationJob,
  MysteryCase,
  type GenerationJobDocument,
} from "./models.js";

const DAY = 24 * 60 * 60 * 1000;
const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
let activeJobs = 0;
let pumping = false;

async function processJob(job: GenerationJobDocument): Promise<void> {
  const now = new Date();
  await GenerationJob.updateOne(
    { jobId: job.jobId, status: "queued" },
    {
      $set: {
        status: "generating",
        step: "writing_and_validating_case",
        progressPercent: 10,
        updatedAt: now,
      },
    },
  );
  try {
    const draft = await authorCanonical({
      scenario: job.scenario,
      difficulty: job.difficulty,
    });
    const completedAt = new Date();
    const caseId = `case_${randomUUID()}`;
    const expiresAt = new Date(completedAt.getTime() + 30 * DAY);
    await GenerationJob.updateOne(
      { jobId: job.jobId, status: "generating" },
      {
        $set: {
          step: "saving_case",
          progressPercent: 80,
          updatedAt: completedAt,
        },
      },
    );
    await CaseSecret.create({
      caseId,
      culpritId: draft.culpritId,
      hintTexts: draft.hintTexts,
      proofChain: draft.proofChain,
      redHerrings: draft.redHerrings,
      explanation: draft.explanation,
      expiresAt,
    });
    try {
      await MysteryCase.create({
        caseId,
        ownerSessionHash: job.ownerSessionHash,
        title: draft.title,
        intro: draft.intro,
        scenario: job.scenario,
        difficulty: job.difficulty,
        mediaTier: "standard",
        settingTimeZone: draft.settingTimeZone,
        suspects: draft.suspects,
        evidence: toPublicEvidence(draft),
        fixture: false,
        status: "ready",
        createdAt: completedAt,
        expiresAt,
      });
    } catch (error) {
      await CaseSecret.deleteOne({ caseId });
      throw error;
    }
    await GenerationJob.updateOne(
      { jobId: job.jobId, status: "generating" },
      {
        $set: {
          status: "ready",
          step: "ready",
          progressPercent: 100,
          caseId,
          updatedAt: new Date(),
        },
        $unset: { errorCode: 1 },
      },
    );
  } catch (error) {
    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "LOCAL_GENERATION_FAILED";
    await GenerationJob.updateOne(
      { jobId: job.jobId, status: "generating" },
      {
        $set: {
          status: "failed",
          step: "failed",
          errorCode,
          updatedAt: new Date(),
        },
      },
    );
    console.error(
      JSON.stringify({
        jobId: job.jobId,
        stage: "local_generation",
        errorCode,
      }),
    );
  }
}

async function pumpQueue(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (activeJobs < 1) {
      const job = await GenerationJob.findOne({ status: "queued" })
        .sort({ createdAt: 1 })
        .lean();
      if (!job) break;
      activeJobs += 1;
      void processJob(job).finally(() => {
        activeJobs -= 1;
        void pumpQueue();
      });
    }
  } finally {
    pumping = false;
  }
}

export async function resumeLocalGenerationJobs(): Promise<void> {
  await GenerationJob.updateMany(
    { status: "generating" },
    {
      $set: {
        status: "queued",
        step: "queued",
        progressPercent: 0,
        updatedAt: new Date(),
      },
    },
  );
  await pumpQueue();
}

async function enqueueGeneration(input: {
  ownerSessionHash: string;
  scenario: string;
  difficulty: "easy" | "medium" | "hard";
  idempotencyKey: string;
}): Promise<{
  jobId: string;
  status: GenerationJobDocument["status"];
  caseId?: string;
  errorCode?: string;
}> {
  const idempotencyKeyHash = hash(input.idempotencyKey);
  const requestHash = hash(
    JSON.stringify({ scenario: input.scenario, difficulty: input.difficulty }),
  );
  const existing = await GenerationJob.findOne({
    ownerSessionHash: input.ownerSessionHash,
    idempotencyKeyHash,
  }).lean();
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new Error("IDEMPOTENCY_CONFLICT");
    }
    return {
      jobId: existing.jobId,
      status: existing.status,
      ...(existing.caseId === undefined ? {} : { caseId: existing.caseId }),
      ...(existing.errorCode === undefined
        ? {}
        : { errorCode: existing.errorCode }),
    };
  }

  const now = new Date();
  const since = new Date(now);
  since.setUTCHours(0, 0, 0, 0);
  const sessionLimit = Math.max(
    1,
    Math.floor(Number(process.env.MAX_GENERATIONS_PER_GUEST_PER_DAY) || 3),
  );
  const dailyLimit = Math.max(
    1,
    Math.floor(Number(process.env.MAX_GENERATIONS_PER_DAY) || 30),
  );
  const [sessionCount, dailyCount, active] = await Promise.all([
    GenerationJob.countDocuments({
      ownerSessionHash: input.ownerSessionHash,
      createdAt: { $gte: since },
    }),
    GenerationJob.countDocuments({ createdAt: { $gte: since } }),
    GenerationJob.exists({
      ownerSessionHash: input.ownerSessionHash,
      status: { $in: ["queued", "generating"] },
    }),
  ]);
  if (active) throw new Error("GENERATION_IN_PROGRESS");
  if (sessionCount >= sessionLimit || dailyCount >= dailyLimit)
    throw new Error("GENERATION_QUOTA_EXCEEDED");
  const jobId = `job_${randomUUID()}`;
  let created: GenerationJobDocument;
  try {
    created = await GenerationJob.create({
      jobId,
      ownerSessionHash: input.ownerSessionHash,
      idempotencyKeyHash,
      requestHash,
      scenario: input.scenario,
      difficulty: input.difficulty,
      status: "queued",
      step: "queued",
      progressPercent: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 30 * DAY),
    });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === 11000))
      throw error;
    const raced = await GenerationJob.findOne({
      ownerSessionHash: input.ownerSessionHash,
      idempotencyKeyHash,
    }).lean();
    if (!raced) throw error;
    if (raced.requestHash !== requestHash)
      throw new Error("IDEMPOTENCY_CONFLICT");
    return {
      jobId: raced.jobId,
      status: raced.status,
      ...(raced.caseId === undefined ? {} : { caseId: raced.caseId }),
      ...(raced.errorCode === undefined ? {} : { errorCode: raced.errorCode }),
    };
  }
  void pumpQueue();
  return { jobId: created.jobId, status: created.status };
}

// Admission is serialized because quotas and pending-job checks span multiple records.
let admissionTail: Promise<unknown> = Promise.resolve();
export function enqueueLocalGeneration(
  input: Parameters<typeof enqueueGeneration>[0],
) {
  const task = admissionTail.then(() => enqueueGeneration(input));
  admissionTail = task.catch(() => undefined);
  return task;
}
