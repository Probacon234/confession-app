import { rmSync } from "node:fs";
import { resolve } from "node:path";

if (!process.env.npm_config_user_agent?.startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exit(1);
}

for (const lockFile of ["package-lock.json", "yarn.lock"]) {
  rmSync(resolve(process.cwd(), lockFile), { force: true });
}
