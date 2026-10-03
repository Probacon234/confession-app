import { spawn } from "node:child_process";

const env = { ...process.env, NODE_ENV: "development" };

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

try {
  await run(process.execPath, ["./build.mjs"]);
  await run(process.execPath, ["--enable-source-maps", "./dist/index.mjs"]);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
