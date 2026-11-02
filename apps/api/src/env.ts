import { config } from "dotenv";
import { fileURLToPath } from "node:url";
// Workspace scripts run from apps/api; resolve the existing root configuration.
config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});
