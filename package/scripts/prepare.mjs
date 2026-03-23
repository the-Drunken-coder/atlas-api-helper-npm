import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

let tsupCli;
try {
  tsupCli = require.resolve("tsup/dist/cli-default.js", { paths: [root] });
} catch {
  console.warn(
    "Skipping atlas-api-helper prepare build because tsup is not installed in this environment."
  );
  process.exit(0);
}

execFileSync(process.execPath, [tsupCli], { stdio: "inherit", cwd: root, env: process.env });
