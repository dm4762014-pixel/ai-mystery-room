const { spawnSync, spawn } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const database = spawnSync("docker", ["compose", "up", "-d", "mongo"], {
  cwd: root,
  stdio: "inherit",
});
if (database.error || database.status !== 0) {
  console.error("Start Docker Desktop, then run pnpm dev:local again.");
  process.exit(1);
}
const pnpm = process.env.npm_execpath;
if (!pnpm) {
  console.error("Run this helper using pnpm dev:local.");
  process.exit(1);
}
const child = spawn(process.execPath, [pnpm, "dev"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    MONGODB_URI: "mongodb://127.0.0.1:27017/ai_mystery_room",
  },
});
child.on("error", () => {
  console.error("Could not start the development server.");
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
