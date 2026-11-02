import "./env.js";
import mongoose from "mongoose";
import { createDemoCase } from "./demoCase.js";
import { CaseSecret, MysteryCase } from "./models.js";

const mongoUri =
  process.env.MONGODB_URI ?? "mongodb://localhost:27017/ai_mystery_room";
if (process.env.NODE_ENV !== "development") {
  throw new Error(
    "The demo fixture can only be seeded when NODE_ENV=development.",
  );
}
await mongoose.connect(mongoUri);
const ownerSessionHash = "development-demo-owner";
const caseId = "case_seeded_demo";
const existing = await MysteryCase.findOne({ caseId });
if (!existing) {
  const { mystery, secret } = createDemoCase(
    ownerSessionHash,
    caseId,
    new Date(),
  );
  await MysteryCase.create(mystery);
  await CaseSecret.create(secret);
  console.log(
    `Seeded demo case ${caseId}; API session-bound demo creation is also available in development.`,
  );
} else {
  console.log(`Demo case ${caseId} is already present.`);
}
await mongoose.disconnect();
