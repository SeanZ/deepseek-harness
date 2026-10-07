/** 从已封存运行时启动唯一 Tavern profile；启动前拒绝任何文件漂移。 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { verifyRuntime } from "./audit.mjs";
const { values } = parseArgs({
  options: {
    runtime: { type: "string" },
    home: { type: "string" },
    port: { type: "string", default: "3081" },
  },
});
assert.ok(values.runtime && values.home, "需要 --runtime --home");
assert.ok(
  /^\d+$/.test(values.port) && +values.port >= 0 && +values.port < 65536,
  "port 无效",
);
const runtime = resolve(values.runtime),
  home = resolve(values.home);
verifyRuntime(runtime);
const child = spawn(
  process.execPath,
  [
    join(runtime, "node_modules/@deepseek-ai/dsh/lib/bin.js"),
    "--profile",
    "tavern",
    "--host",
    "127.0.0.1",
    "--port",
    values.port,
    "--no-open",
  ],
  { cwd: home, stdio: "inherit", env: { ...process.env, DSH_HOME: home } },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
