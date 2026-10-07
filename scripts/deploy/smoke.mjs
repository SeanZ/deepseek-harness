/** 最终包的真实 profile HTTP 启动、重启及运行时不漂移检查，不代替模型业务验收。 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { scriptRoot, json, readJson, sha256 } from "./common.mjs";
import { verifyRuntime } from "./audit.mjs";
const { values } = parseArgs({
  options: {
    runtime: { type: "string" },
    home: { type: "string" },
    report: { type: "string" },
  },
});
assert.ok(
  values.runtime && values.home && values.report,
  "需要 --runtime --home --report",
);
const runtime = resolve(values.runtime),
  home = resolve(values.home);
const deployment = readJson(join(home, "deployment.json"));
assert.equal(resolve(deployment.runtime), runtime, "home 不属于当前runtime");
assert.ok(deployment.dist, "安装回执缺少dist路径");
assert.ok(
  !resolve(values.report).startsWith(resolve(deployment.dist) + "/"),
  "冒烟报告和日志必须位于dist之外",
);
assert.equal(
  deployment.manifestSha256,
  sha256(readFileSync(join(deployment.dist, "manifest.json"))),
  "安装制品manifest已漂移",
);
const activeBundles = readJson(join(home, "profiles/tavern/package.json")).dsh
  .profile.bundles;
const activePurge = activeBundles.includes("dsh-purge");
assert.ok(activeBundles.includes("dsh-profile-tavern"), "profile未挂载Tavern");
const lock = readJson(join(runtime, "lock.json"));
const runs = [];
for (let attempt = 0; attempt < 2; attempt++) {
  let output = "";
  const child = spawn(
    process.execPath,
    [
      join(scriptRoot, "start.mjs"),
      "--runtime",
      runtime,
      "--home",
      home,
      "--port",
      "0",
    ],
    {
      env: { PATH: process.env.PATH, HOME: home, DSH_HOME: home },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const exited = once(child, "exit");
  try {
    let response,
      cookie = "",
      origin = "";
    for (let i = 0; i < 120; i++) {
      if (child.exitCode !== null)
        throw new Error(`真实 profile 提前退出，见 ${values.report}.log`);
      try {
        const url = output
          .split(String.fromCharCode(27))
          .join("\n")
          .match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0];
        if (!url) {
          await delay(100);
          continue;
        }
        origin = new URL(url).origin;
        if (!cookie) {
          const auth = await fetch(url, {
            redirect: "manual",
            signal: AbortSignal.timeout(1000),
          });
          cookie = auth.headers
            .getSetCookie()
            .map((value) => value.split(";")[0])
            .join("; ");
          await auth.body?.cancel();
        }
        response = await fetch(origin + "/", {
          headers: { Cookie: cookie },
          signal: AbortSignal.timeout(1000),
        });
      } catch {
        /* 等待当前进程绑定回环监听。 */
      }
      if (response?.ok) break;
      await response?.body?.cancel();
      await delay(500);
    }
    assert.ok(response?.ok, "真实 HTTP 页面没有就绪");
    const html = await response.text();
    assert.match(html, /<html/i);
    const api = await fetch(origin + "/api/dsh-tavern/gameplay.capabilities", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(api.status, 200, "Tavern gameplay API未加载");
    const capability = await api.json();
    assert.equal(capability.ok, true);
    assert.equal(capability.version, 1);
    let purge;
    if (activePurge) {
      let state;
      for (let i = 0; i < 30; i++) {
        const response = await fetch(origin + "/dsh-purge/status", {
          headers: { Cookie: cookie, Origin: origin },
          signal: AbortSignal.timeout(10000),
        });
        if (response.status === 503) {
          await response.body?.cancel();
          await delay(200);
          continue;
        }
        assert.equal(response.status, 200, "purge状态API未加载");
        state = await response.json();
        break;
      }
      assert.ok(state?.ok && state.ready, "purge未就绪");
      assert.equal(state.plugin_version, lock.purge.version);
      purge = { pluginVersion: state.plugin_version, statusHttp: 200 };
      if (lock.purge.enabled) {
        assert.equal(state.allowHostMutation, false);
        assert.equal(state.rewindEnabled, false);
        assert.equal(state.promptScope, "root");
        for (const [route, code] of [
          ["/dsh-purge/apply", "PURGE_HOST_MUTATION_DISABLED"],
          ["/dsh-purge/rewind/options", "PURGE_REWIND_DISABLED"],
        ]) {
          const response = await fetch(origin + route, {
            method: route.endsWith("apply") ? "POST" : "GET",
            headers: {
              Cookie: cookie,
              Origin: origin,
              "Content-Type": "application/json",
            },
            ...(route.endsWith("apply") ? { body: "{}" } : {}),
            signal: AbortSignal.timeout(10000),
          });
          assert.equal(response.status, 403);
          assert.equal((await response.json()).code, code);
        }
        Object.assign(purge, {
          allowHostMutation: false,
          rewindEnabled: false,
          promptScope: "root",
          mutationDenied: true,
          rewindDenied: true,
        });
      }
    }
    await delay(3000);
    assert.equal(child.exitCode, null, "启动后进程退出");
    verifyRuntime(runtime);
    runs.push({
      attempt: attempt + 1,
      httpStatus: response.status,
      tavernCapabilitiesVersion: capability.version,
      ...(purge ? { purge } : {}),
      htmlBytes: Buffer.byteLength(html),
      runtimeUnchanged: true,
    });
  } finally {
    writeFileSync(
      `${values.report}.log`,
      output.replace(/([?&]token=)[^\s]+/g, "$1[redacted]"),
    );
    const stop = (signal) => {
      if (child.exitCode !== null) return;
      try {
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    };
    stop("SIGTERM");
    const timeout = setTimeout(() => stop("SIGKILL"), 10000);
    await exited;
    clearTimeout(timeout);
  }
}
json(resolve(values.report), {
  status: "profile-smoke-passed",
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  runs,
  hostByteChecks: 8,
  packageLockSha256: sha256(readFileSync(join(runtime, "package-lock.json"))),
  deploymentLockSha256: sha256(readFileSync(join(runtime, "lock.json"))),
  manifestSha256: deployment.manifestSha256,
  runtimeAuditSha256: sha256(readFileSync(join(runtime, "runtime-audit.json"))),
  profilePatchSha256: sha256(
    readFileSync(join(home, "profiles/tavern/cordis.patch.yml")),
  ),
  purgeEnabled: activePurge,
  purgeConfiguredByLock: lock.purge.enabled,
  linuxRuntime:
    process.platform === "linux" ? "profile-smoke-passed" : "not-tested",
  browser: "pending",
  model: "pending",
});
console.log(readFileSync(resolve(values.report), "utf8"));
