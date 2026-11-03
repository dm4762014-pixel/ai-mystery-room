import { config } from "dotenv";
import { fileURLToPath } from "node:url";
// Prefer server-local settings; retain the existing private root .env as fallback.
config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});
