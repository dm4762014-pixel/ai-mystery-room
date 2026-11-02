import "./env.js";
import mongoose from "mongoose";
import app from "./app.js";
import {
  Attempt,
  CaseSecret,
  GenerationJob,
  GuestSession,
  HintProgress,
  MysteryCase,
} from "./models.js";
import { resumeLocalGenerationJobs } from "./localGenerationJobs.js";

process.env.NODE_ENV ??= "development";
const port = Number(process.env.API_PORT ?? 4000);
const mongoUri =
  process.env.MONGODB_URI ?? "mongodb://localhost:27017/ai_mystery_room";

await mongoose.connect(mongoUri);
await Promise.all([
  GuestSession.init(),
  MysteryCase.init(),
  CaseSecret.init(),
  HintProgress.init(),
  Attempt.init(),
  GenerationJob.init(),
]);
await resumeLocalGenerationJobs();

app.listen(port, () => {
  console.log(`Mystery API listening on http://localhost:${port}`);
});
