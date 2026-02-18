import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function hasModule(specifier) {
  try {
    require.resolve(specifier);
    return true;
  } catch {
    return false;
  }
}

if (!hasModule("typescript")) {
  console.log(
    "[atlas-api-helper-npm] Skipping build because 'typescript' is not installed. Run `npm install` inside Atlas_Client_SDKs/connection_packages/atlas-api-helper-npm to rebuild when developing this package."
  );
  process.exit(0);
}

execSync("npx tsup", { stdio: "inherit" });

