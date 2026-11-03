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
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
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

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Mystery API listening on http://localhost:${port}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.close(() => {
      void mongoose.disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
