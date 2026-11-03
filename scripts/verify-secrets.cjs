const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "..");
const apiRequire = createRequire(path.join(root, "server/package.json"));
const { parse } = apiRequire("dotenv");
const envFile = path.join(root, ".env");
const serverEnvFile = path.join(root, "server/.env");
const env = {
  ...(fs.existsSync(envFile) ? parse(fs.readFileSync(envFile)) : {}),
  ...(fs.existsSync(serverEnvFile)
    ? parse(fs.readFileSync(serverEnvFile))
    : {}),
};
const secrets = [env.GEMINI_API_KEY];
try {
  const uri = new URL(env.MONGODB_URI);
  if (uri.password) secrets.push(decodeURIComponent(uri.password));
} catch {}
const actual = secrets.filter(
  (value) => value && value.length > 8 && !value.includes("replace-me"),
);
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const forbidden = files.filter(
  (file) =>
    /(^|\/)\.env($|\.)/.test(file) &&
    path.posix.basename(file) !== ".env.example",
);
const leaked = [];
for (const file of files) {
  const full = path.join(root, file);
  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    const text = fs.readFileSync(full, "utf8");
    if (actual.some((secret) => text.includes(secret))) leaked.push(file);
  }
}
if (forbidden.length || leaked.length) {
  console.error(
    "Secret scan failed. Review these files:",
    JSON.stringify([...new Set([...forbidden, ...leaked])]),
  );
  process.exit(1);
}
console.log(
  `Secret scan passed for ${files.length} source files; private env and logs are excluded.`,
);
