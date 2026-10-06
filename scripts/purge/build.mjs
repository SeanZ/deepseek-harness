import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { root, run } from "./common.mjs";
const { values } = parseArgs({
  options: {
    out: { type: "string", default: "dist/purge-release" },
    "skip-build": { type: "boolean", default: false },
  },
});
const out = resolve(root, values.out);
assert.ok(!existsSync(out), "输出目录已存在");
// purge 的桌面路径识别会误判源码仓库名；构建运行时必须在系统临时目录内。
const work = mkdtempSync(join(tmpdir(), "dsh-purge-build-"));
const raw = join(work, "raw"),
  runtime = join(work, "runtime"),
  home = join(work, "home");
mkdirSync(home);
const script = (name) => join(root, "scripts/purge", name);
run(process.execPath, [script("check.mjs")], { stdio: "inherit" });
let passed = false;
try {
  run(
    process.execPath,
    [
      script("build-source.mjs"),
      "--out",
      raw,
      "--cache",
      join(work, "source"),
      ...(values["skip-build"] ? ["--skip-build"] : []),
    ],
    { stdio: "inherit" },
  );
  run(
    process.execPath,
    [script("install.mjs"), "--dist", raw, "--runtime", runtime],
    { stdio: "inherit" },
  );
  run(
    process.execPath,
    [script("apply.mjs"), "--runtime", runtime, "--home", home],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DSH_HOME: home,
        DSH_BASE: join(runtime, "node_modules/@deepseek-ai"),
        DSH_SURFACE: "web",
      },
    },
  );
  run(
    process.execPath,
    [script("seal.mjs"), "--dist", raw, "--runtime", runtime, "--out", out],
    { stdio: "inherit" },
  );
  run(
    process.execPath,
    [script("test.mjs"), "--runtime", runtime, "--dist", out],
    { stdio: "inherit" },
  );
  copyFileSync(
    join(runtime, "purge-audit.json"),
    join(out, "purge-audit.json"),
  );
  copyFileSync(join(runtime, "acceptance.json"), join(out, "validation.json"));
  passed = true;
  console.log(JSON.stringify({ out }));
} finally {
  if (passed) rmSync(work, { recursive: true, force: true });
  else console.error(`失败现场保留：${work}`);
}
