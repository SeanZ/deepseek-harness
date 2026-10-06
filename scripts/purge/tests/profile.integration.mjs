import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as pause } from "node:timers/promises";
import test from "node:test";
import { root, run } from "../common.mjs";
import { initializeProfile } from "../profile.mjs";
import { createRequire } from "node:module";

const runtime = resolve(
  process.env.DSH_TEST_RUNTIME ?? join(root, ".artifacts/purge/runtime"),
);
const yaml = createRequire(join(runtime, "package.json"))("js-yaml");
const schema = yaml.DEFAULT_SCHEMA.extend(
  new yaml.Type("tag:yaml.org,2002:js", {
    kind: "scalar",
    construct: (value) => value,
  }),
);
const parseCordis = (text) => yaml.load(text, { schema });
const bin = join(runtime, "node_modules/@deepseek-ai/dsh/lib/bin.js");

test(
  "文档安装路径：实际 Web profile、完整预设、客户端产物和主机状态端点",
  { timeout: 45000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "dsh-web-profile-"));
    const home = join(dir, "home");
    const workspace = join(dir, "workspace");
    mkdirSync(workspace);
    initializeProfile(runtime, home);
    const env = {
      PATH: process.env.PATH,
      DSH_BASE: join(runtime, "node_modules/@deepseek-ai"),
      DSH_SURFACE: "web",
      DSH_HOME: home,
      DSH_AGENTS_HOME: join(home, "agents"),
      DSH_TELEMETRY_DISABLED: "1",
    };
    const text = run(
      process.execPath,
      [bin, "--profile", "web", "--dump-config"],
      { cwd: workspace, env },
    );
    const rows = parseCordis(text);
    const creative = rows.find((row) => row.id === "preset-creative");
    assert.ok(creative);
    assert.equal(rows.filter((row) => row.id === "preset-creative").length, 1);
    assert.deepEqual(
      creative.config.plugins,
      rows.find((row) => row.id === "preset-standard").config.plugins,
    );
    for (const id of ["request-injections-compatibility", "unrestricted"])
      assert.ok(!rows.some((row) => row.id === id));
    const purge = rows.find((row) => row.id === "dsh-purge");
    assert.equal(purge.config.autoApplyOnStart, false);
    assert.equal(purge.config.autoUpdateOnStart, false);
    const patch = join(dir, "test.patch.json");
    writeFileSync(
      patch,
      JSON.stringify([
        { id: "session-telemetry-otel", disabled: true },
        { id: "session-log-deepseek", disabled: true },
      ]),
    );
    const child = spawn(
      process.execPath,
      [
        bin,
        "--profile",
        "web",
        "--patch",
        patch,
        "--host",
        "127.0.0.1",
        "--port",
        "0",
        "--no-open",
      ],
      { cwd: workspace, env, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    try {
      const deadline = Date.now() + 20000;
      while (
        !/dsh web: (http:\/\/127\.0\.0\.1:\S+)/.test(output) &&
        child.exitCode === null &&
        Date.now() < deadline
      )
        await pause(25);
      const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\S+)/);
      // 启动日志含临时 bootstrap 凭据，失败时仅显示删除 URL 后的诊断。
      assert.ok(match, errors.replace(/https?:\/\/\S+/g, "[URL]"));
      const url = new URL(match[1]);
      const origin = url.origin;
      const anonymous = await fetch(`${origin}/`, { redirect: "manual" });
      assert.equal(anonymous.status, 401);
      const bootstrap = await fetch(url, { redirect: "manual" });
      assert.equal(bootstrap.status, 303);
      const cookie = bootstrap.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      const page = await fetch(`${origin}/`, { headers: { Cookie: cookie } });
      assert.equal(page.status, 200);
      let html = await page.text();
      const clientDeadline = Date.now() + 10000;
      while (!html.includes("dsh-purge") && Date.now() < clientDeadline) {
        await pause(50);
        html = await (
          await fetch(`${origin}/`, { headers: { Cookie: cookie } })
        ).text();
      }
      assert.ok(
        html.includes("dsh-purge"),
        `浏览器启动图应包含业务插件；${errors.replace(/https?:\/\/\S+/g, "[URL]")}`,
      );
      const candidates = [
        ...html.matchAll(/["']([^"']*plugins\/\?\?[^"']*)["']/g),
      ].map((match) =>
        match[1].replaceAll("&amp;", "&").replaceAll("\\u0026", "&"),
      );
      const bundleUrl = candidates.find((candidate) =>
        candidate.includes("dsh-purge/client.js"),
      );
      assert.ok(bundleUrl, "浏览器启动图应提供 client bundle URL");
      const client = await fetch(new URL(bundleUrl, `${origin}/`));
      assert.equal(client.status, 200);
      const code = await client.text();
      assert.ok(code.includes("dsh-purge"));

      // 覆盖启动四秒后的延迟自愈窗口，再由外层制品审计核验磁盘不漂移。
      await pause(5000);
    } finally {
      if (child.exitCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        const killer = setTimeout(() => child.kill("SIGKILL"), 5000);
        await exited;
        clearTimeout(killer);
      }
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
