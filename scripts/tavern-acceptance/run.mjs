/**
 * 从已安装制品启动全新隔离 profile，验收真实会话、后台工具与持久化。
 * node scripts/tavern-acceptance/run.mjs --runtime /绝对/runtime --output /全新目录
 * 真实模型另传 --provider-config /本地私有.json：{model:{provider,model},patch:"YAML"}。
 * 必须传 --playwright-module /已安装/playwright/index.mjs，MVU 不能以纯 API 绕过浏览器运行时。
 */
import assert from "node:assert/strict";
import {
  mkdir,
  readFile,
  writeFile,
  appendFile,
  symlink,
  realpath,
} from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { card, markers } from "./fixtures.mjs";
import {
  inspectChat,
  stableChat,
  successfulToolCalls,
  successfulTools,
  summarizeRequest,
} from "./evidence.mjs";
import { verifyRuntime } from "../deploy/audit.mjs";

const { values } = parseArgs({
  options: {
    runtime: { type: "string" },
    output: { type: "string" },
    "provider-config": { type: "string" },
    "playwright-module": { type: "string" },
    "system-marker": {
      type: "string",
      default: "ACCEPTANCE_PE_SINGLE_INJECTION",
    },
    timeout: { type: "string", default: "180000" },
  },
});
assert.ok(values.runtime && values.output, "需要 --runtime 和全新的 --output");
const runtime = resolve(values.runtime),
  output = resolve(values.output);
const here = dirname(fileURLToPath(import.meta.url));
const home = join(output, "home"),
  profile = join(home, "profiles/tavern");
const data = join(home, "profile-data/tavern/data");
const capture = join(output, "request-summaries.jsonl");
let purgeEnabled = false;
const timeout = Number(values.timeout);
assert.ok(Number.isSafeInteger(timeout) && timeout > 0, "timeout 无效");
// mkdir 非 recursive：禁止复用未知数据，失败不得自动覆盖。
await mkdir(output, { mode: 0o700 });
const report = {
  version: 1,
  status: "running",
  model: values["provider-config"] ? "live-provider" : "deterministic-adapter",
  steps: [],
  pending: [],
  platform: process.platform,
  arch: process.arch,
};
let child, origin, cookie, url, browser, page, chatStore, requestLog;
let noticeAcknowledged = false;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function step(name, action) {
  report.currentStep = name;
  const started = Date.now();
  const evidence = await action();
  report.steps.push({
    name,
    ms: Date.now() - started,
    ...(evidence ? { evidence } : {}),
  });
  console.log("通过：" + name);
}
async function request(method, args = {}) {
  // 普通 UI 会话不属于 gameplay API 的 test-* 所有权；通过真实只读服务获取同类证据。
  if (
    args.sessionId?.startsWith("session-") &&
    method.startsWith("gameplay.")
  ) {
    const links = JSON.parse(
      await readFile(join(data, "sessions.json"), "utf8"),
    );
    const chat = await chatStore.read(links[args.sessionId]);
    if (method === "gameplay.state")
      return {
        chat,
        activity: (await request("getSessionActivity", args)).activity,
      };
    if (method === "gameplay.requests")
      return { requests: (await requestLog.evidence(chat.id)).requests };
    if (method === "gameplay.native") {
      const response = await fetch(origin + "/api/tavern-acceptance/native", {
        method: "POST",
        headers: { "content-type": "application/json", origin, cookie },
        body: JSON.stringify({
          sessionId: args.nativeSessionId || args.sessionId,
        }),
        signal: AbortSignal.timeout(timeout),
        redirect: "error",
      });
      const result = await response.json();
      if (response.status !== 200)
        report.nativeFailure = {
          status: response.status,
          reason: result.reason,
          hostname: result.hostname,
          originMatches: result.originMatches,
        };
      assert.equal(
        response.status,
        200,
        "原生只读证据接口失败 HTTP " + response.status,
      );
      assert.equal(result.ok, true, "原生只读查询未完成");
      return result;
    }
  }

  const response = await fetch(origin + "/api/dsh-tavern/" + method, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(timeout),
    redirect: "error",
  });
  assert.equal(response.status, 200, "API HTTP 失败：" + method);
  const result = await response.json();
  if (!values["provider-config"] && (!result.ok || result.error))
    report.syntheticFailure = {
      method,
      error: String(result.error || "未知拒绝")
        .replace(/https?:\/\/\S+/g, "[URL]")
        .slice(0, 500),
    };
  // 外部 provider 的错误可能带敏感配置；只报告方法名和宿主固定前置条件文本。
  if (["上一轮尚未完成", "会话已有操作正在提交"].includes(result.error))
    report.apiRejection = { method, error: result.error };
  assert.ok(result.ok && !result.error, "API 拒绝：" + method);
  return result;
}
async function nativeRpc(method, payload) {
  const rpcId = randomUUID();
  const response = await fetch(origin + "/api/" + method, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie },
    body: JSON.stringify({
      type: "client-request",
      rpcId,
      method,
      payload: { args: { request: payload } },
    }),
    signal: AbortSignal.timeout(timeout),
    redirect: "error",
  });
  assert.equal(response.status, 200, "原生 RPC HTTP 失败");
  const result = await response.json();
  assert.ok(
    result.rpcId === rpcId && result.result?.ok,
    "原生 RPC 拒绝：" +
      method +
      " " +
      (result.result?.error?.code || "unknown"),
  );
  return result.result.value;
}
async function openStory(title, create = false) {
  assert.ok(
    values["playwright-module"],
    "MVU 卡需要 --playwright-module 提供真实浏览器脚本运行时",
  );
  if (!browser) {
    const { chromium } = await import(
      pathToFileURL(resolve(values["playwright-module"]))
    );
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(30000);
  }
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const consent = page.getByRole("button", { name: "Continue", exact: true });
  const group = page
    .locator(".dsh-tavern-history-group-toggle")
    .filter({ hasText: card.data.name });
  const sidebar = page.getByRole("button", { name: /^(Open|Expand) sidebar$/ });
  const play = page.getByRole("button", { name: "游玩", exact: true });
  if (!noticeAcknowledged) {
    await consent.waitFor();
    await consent.click();
    noticeAcknowledged = true;
  }
  await play.or(sidebar).first().waitFor();
  if (!(await play.isVisible())) await sidebar.click();
  if (!(await play.getAttribute("class"))?.split(/\s+/).includes("active"))
    await play.click();
  const picker = page.getByRole("dialog", {
    name: "选择人物卡开始游玩",
    exact: true,
  });
  if (create) {
    if (!(await picker.isVisible()))
      await page.getByRole("button", { name: /选择人物卡.*新开游玩/ }).click();
    await page.getByText(card.data.name, { exact: true }).first().click();
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await page.getByRole("textbox", { name: /发消息|Message/ }).waitFor();
    return;
  }
  if (await picker.isVisible())
    await picker.getByRole("button", { name: "关闭", exact: true }).click();
  await group.or(sidebar).first().waitFor();
  if (!(await group.isVisible())) await sidebar.click();
  if ((await group.getAttribute("aria-expanded")) !== "true")
    await group.click();
  await page
    .locator(".dsh-tavern-side-row-name")
    .filter({ hasText: title })
    .click();
  await page.getByRole("textbox", { name: /发消息|Message/ }).waitFor();
}
async function sendStory(input) {
  const composer = page.getByRole("textbox", { name: /发消息|Message/ });
  await composer.fill(input);
  await composer.press("Enter");
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exiting = new Promise((done) => child.once("exit", done));
  child.kill("SIGTERM");
  await Promise.race([exiting, pause(5000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exiting;
  }
}
async function start() {
  // 不继承生产 provider、代理令牌和 DSH 配置；仅私有 patch 提供真实模型配置。
  const env = Object.fromEntries(
    ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "SYSTEMROOT"]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  child = spawn(
    process.execPath,
    [
      join(runtime, "node_modules/@deepseek-ai/dsh/lib/bin.js"),
      "--profile",
      "tavern",
      "--host",
      "127.0.0.1",
      "--port",
      "0",
      "--no-open",
    ],
    {
      cwd: home,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...env,
        DSH_HOME: home,
        DSH_CWD: home,
        TAVERN_ACCEPTANCE_LLM_MODULE: join(
          runtime,
          "node_modules/@deepseek-ai/dsh-llm/lib/index.js",
        ),
        TAVERN_ACCEPTANCE_CAPTURE: capture,
        TAVERN_ACCEPTANCE_HOME: home,
        TAVERN_ACCEPTANCE_SYSTEM_MARKER: values["system-marker"] || "",
      },
    },
  );
  let buffer = "",
    spawnFailed = false;
  child.on("error", () => {
    spawnFailed = true;
  });
  const receive = (chunk) => {
    buffer = (buffer + chunk).slice(-262144);
    if (!values["provider-config"]) {
      const sanitized = String(chunk).replace(/https?:\/\/\S+/g, "[URL]");
      void appendFile(join(output, "synthetic-startup.log"), sanitized, {
        mode: 0o600,
      });
    }
  };
  child.stdout.on("data", receive);
  child.stderr.on("data", receive);
  const deadline = Date.now() + 60000;
  url = undefined;
  while (Date.now() < deadline) {
    assert.ok(
      !spawnFailed && child.exitCode === null,
      "宿主启动失败；未输出潜在敏感日志",
    );
    // 日志含 ANSI 转义符，URL 必须在转义符之前结束。
    url = buffer
      .split(String.fromCharCode(27))
      .join("\n")
      .match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+[^\s]*/)?.[0];
    if (url) break;
    await pause(100);
  }
  assert.ok(url, "宿主启动超时");
  origin = new URL(url).origin;
  const auth = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
  cookie = auth.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  await auth.body?.cancel();
  assert.equal((await request("gameplay.capabilities")).version, 1);
}
async function settled(sessionId, rounds) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await request("gameplay.state", { sessionId });
    const replies =
      state.chat?.messages.filter(
        (message) => message.role === "assistant" && !message.greeting,
      ) || [];
    if (
      !state.activity?.busy &&
      !["pending", "running"].includes(state.chat?.settleStatus) &&
      replies.length >= rounds &&
      (state.chat.mode === "card" ||
        replies.at(-1)?.mvu?.receipt?.status === "updated")
    ) {
      // 投影在 assistant/message 时已含回复；原生 turn/end 前 send 仍会被拒。
      const types = (
        await request("gameplay.native", { sessionId })
      ).events.map((event) => event.type);
      if (types.lastIndexOf("turn/end") > types.lastIndexOf("turn/start"))
        return state.chat;
    }
    await pause(200);
  }
  throw new Error("会话及后台结算超时");
}
async function toolEvidence(sessionId, expectedPosture) {
  const rows = (await request("gameplay.requests", { sessionId })).requests;
  const ids = new Set([
    sessionId,
    ...rows.map((row) => row.sessionId).filter(Boolean),
  ]);
  const tools = [];
  const calls = [];
  for (const nativeSessionId of ids) {
    const events = (
      await request("gameplay.native", { sessionId, nativeSessionId })
    ).events;
    tools.push(...successfulTools(events));
    calls.push(...successfulToolCalls(events));
  }
  if (expectedPosture !== undefined)
    assert.ok(
      calls.some(
        (call) =>
          call.name === "posture_submit" &&
          JSON.parse(call.arguments).posture === expectedPosture,
      ),
      "成功姿势工具参数必须与持久值一致",
    );
  return [...new Set(tools)];
}
try {
  let model;
  await step("制品校验与合成 profile", async () => {
    verifyRuntime(runtime);
    const lock = JSON.parse(await readFile(join(runtime, "lock.json"), "utf8"));
    purgeEnabled = lock.purge.enabled;
    const bundles = [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
      "dsh-profile-tavern",
      ...(lock.purge.enabled ? ["dsh-purge"] : []),
    ];
    await mkdir(profile, { recursive: true });
    if (purgeEnabled)
      await writeFile(
        join(home, "prompt-inject.md"),
        values["system-marker"] +
          "：中性观星验收；保留角色卡、世界书与工具约束。",
        { mode: 0o600 },
      );
    await symlink(
      join(runtime, "node_modules"),
      join(profile, "node_modules"),
      "dir",
    );
    await writeFile(
      join(profile, "package.json"),
      JSON.stringify({
        name: "tavern-synthetic-acceptance",
        private: true,
        dsh: { profile: { bundles, patchReload: "startup" } },
      }),
    );
    let patch = await readFile(
      join(here, "../deploy/profile.patch.yml"),
      "utf8",
    );
    if (!lock.purge.enabled)
      patch = patch.slice(patch.indexOf("- id: webserver"));
    if (values["provider-config"]) {
      const external = JSON.parse(
        await readFile(resolve(values["provider-config"]), "utf8"),
      );
      assert.ok(
        external.model?.provider &&
          external.model?.model &&
          typeof external.patch === "string",
        "外部 provider 配置缺少 model/patch",
      );
      model = external.model;
      patch += "\n" + external.patch;
    } else {
      model = { provider: "tavern-acceptance", model: "fixed" };
      patch += `\n- id: agent-default-model\n  config:\n    provider: tavern-acceptance\n    model: fixed\n- insert:\n    - id: tavern-acceptance-model\n      name: ${JSON.stringify(join(here, "model.mjs"))}\n`;
      report.pending.push("真实模型业务验收；确定性适配器只证明宿主与工具路径");
    }
    patch += `\n- insert:\n    - id: tavern-acceptance-native-evidence\n      name: ${JSON.stringify(join(here, "native-evidence.mjs"))}\n`;
    await writeFile(join(profile, "cordis.patch.yml"), patch, { mode: 0o600 });
    await mkdir(join(data, "resources/cards"), { recursive: true });
    await writeFile(
      join(data, "resources/cards/acceptance.json"),
      JSON.stringify(card),
    );
    return { purgeEnabled: lock.purge.enabled, syntheticOnly: true };
  });
  await step("真实宿主启动", start);
  let sessionId, chatId, chat;
  const plugin = await realpath(
    join(runtime, "node_modules/dsh-profile-tavern/tavern-plugin"),
  );
  const { createChatJournalStore } = await import(
    pathToFileURL(join(plugin, "lib/domain/chat-journal-store.js"))
  );
  chatStore = createChatJournalStore({
    dataRoot: data,
    compatibleStorage: false,
  });
  const { createModelRequestLog } = await import(
    pathToFileURL(join(plugin, "lib/domain/model-request-log.js"))
  );
  requestLog = createModelRequestLog({
    async readJson(relative) {
      try {
        return JSON.parse(await readFile(join(data, relative), "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return undefined;
        throw error;
      }
    },
    async writeJson() {
      throw new Error("验收证据读取禁止写入");
    },
    async updateJson() {
      throw new Error("验收证据读取禁止更新");
    },
  });
  const saved = () =>
    createChatJournalStore({ dataRoot: data, compatibleStorage: false }).read(
      chatId,
    );
  await step("新会话与前后台工具", async () => {
    await openStory("合成验收主线", true);
    const games = (await request("listSessions")).sessions.filter(
      (item) => item.mode === "story",
    );
    assert.equal(games.length, 1, "隔离 profile 应只有一局 UI 游戏");
    sessionId = games[0].sessionId;
    chatId = games[0].chatId;
    await request("renameConversation", { sessionId, title: "合成验收主线" });
    await sendStory(
      "ACCEPTANCE_FIRST_ONE：请领取一枚观测徽章。正文明确写出徽章以及领取后总数为 1。蓝色灯笼固定悬挂，仅作背景，不可领取或移动。",
    );
    chat = await settled(sessionId, 1);
    inspectChat(chat, 1, 1, "徽章");
    inspectChat(await saved(), 1, 1, "徽章");
    await request("renameConversation", { sessionId, title: "合成验收主线" });
    if (!values["provider-config"])
      assert.equal(chat.posture, "站在观星台旁。");
    const tools = await toolEvidence(sessionId, chat.posture);
    assert.ok(
      tools.includes("mvu_submit_update") && tools.includes("posture_submit"),
      "需要实际成功工具事件",
    );
    return { tools, ...inspectChat(chat, 1, 1, "徽章") };
  });
  await step("第二轮与原生重生成", async () => {
    await sendStory(
      "ACCEPTANCE_SECOND_TWO：再领取一枚观测徽章。正文明确写出徽章和领取后总数为 2，灯笼仍固定悬挂。",
    );
    await settled(sessionId, 2);
    inspectChat(await saved(), 2, 2, "徽章");
    await request("regenBody", {
      sessionId,
      chatId,
      guidance:
        "ACCEPTANCE_REGENERATE_THREE：改为这一轮领取两枚观测徽章。正文明确写出徽章和领取后总数为 3，灯笼仍固定悬挂。",
    });
    chat = await settled(sessionId, 2);
    return inspectChat(await saved(), 2, 3, "徽章");
  });
  const edited = "手工编辑：你在蓝色灯笼旁收好了三枚徽章。";
  await step("原生正文编辑、回退与撤销", async () => {
    const { edit } = await request("getBodyEdit", { sessionId });
    const texts = edit.parts
      .filter((part) => part.kind === "text")
      .map((_, i) => (i === 0 ? edited : ""));
    await request("saveBodyEdit", { sessionId, token: edit.token, texts });
    inspectChat(await saved(), 2, 3, edited, false);
    chat = (await request("gameplay.state", { sessionId })).chat;
    await request("rollbackTurn", {
      sessionId,
      chatId,
      expectedTurn: chat.messages.at(-1).turn,
    });
    inspectChat(await saved(), 1, 1, "徽章");
    await request("undoRollbackTurn", { sessionId, chatId });
    return inspectChat(await saved(), 2, 3, edited, false);
  });
  await step("最终请求来源与 system 去重", async () => {
    const rows = (await request("gameplay.requests", { sessionId })).requests;
    const summaries = rows.map((row) => ({
      scope: row.scope,
      task: row.task,
      ...summarizeRequest(row.request, values["system-marker"]),
    }));
    assert.ok(
      summaries.some(
        (row) =>
          row.scope === "foreground" &&
          row.markers.card > 0 &&
          row.markers.worldbook > 0,
      ),
      "正文请求缺少卡或世界书来源",
    );
    assert.ok(
      summaries.some(
        (row) =>
          row.scope === "background" && row.tools.includes("mvu_submit_update"),
      ),
      "缺少后台结构化契约",
    );
    assert.ok(
      summaries.every((row) => row.repeatedSystemParagraphs === 0),
      "system 存在重复长段落",
    );
    const scopes = new Map(summaries.map((row) => [row.sessionId, row.scope]));
    const finalRequests = values["provider-config"]
      ? summaries
      : (await readFile(capture, "utf8"))
          .trim()
          .split("\n")
          .map(JSON.parse)
          .filter((row) => scopes.has(row.sessionId))
          .map((row) => ({ ...row, scope: scopes.get(row.sessionId) }));
    assert.ok(finalRequests.length > 0, "缺少最终适配器请求证据");
    const finalBySession = [
      ...new Map(finalRequests.map((row) => [row.sessionId, row])).values(),
    ];
    assert.ok(
      finalBySession.some(
        (row) =>
          row.scope === "foreground" &&
          row.markers.card > 0 &&
          row.markers.worldbook > 0 &&
          row.markers.whitespace > 0,
      ),
      "最终适配器请求缺少逐字卡片来源",
    );
    if (purgeEnabled)
      assert.ok(
        finalBySession.every(
          (row) =>
            row.injectionOccurrences === (row.scope === "foreground" ? 1 : 0),
        ),
        "前台注入应唯一，后台不应注入",
      );
    else
      assert.ok(
        summaries.every((row) => row.injectionOccurrences === 0),
        "未启用 purge 的基线不应注入",
      );
    assert.ok(
      summaries.some(
        (row) => row.scope === "foreground" && row.markers.whitespace > 0,
      ),
      "角色卡缩进与行尾空格未逐字保留",
    );
    await writeFile(
      join(output, "host-request-summaries.json"),
      JSON.stringify(summaries, null, 2),
      { mode: 0o600 },
    );
    return {
      requests: summaries.length,
      foreground: summaries.filter((row) => row.scope === "foreground").length,
      background: summaries.filter((row) => row.scope === "background").length,
      finalRequestEvidence: values["provider-config"]
        ? "host-request-log"
        : "adapter-input",
    };
  });
  await step("冷重启与历史重开", async () => {
    const before = stableChat(await saved());
    await page.goto("about:blank");
    await stop();
    assert.deepEqual(stableChat(await saved()), before);
    await start();
    await openStory("合成验收主线");
    await request("getSession", { sessionId, fullView: true });
    assert.deepEqual(
      stableChat((await request("gameplay.state", { sessionId })).chat),
      before,
    );
    assert.deepEqual(stableChat(await saved()), before);
    return { persisted: true, sameProseAndVariables: true };
  });
  await step("Chromium 历史显示与刷新", async () => {
    await page
      .locator(".dsh-tavern-assistant")
      .filter({ hasText: edited })
      .last()
      .waitFor();
    await page.reload();
    await page
      .locator(".dsh-tavern-assistant")
      .filter({ hasText: edited })
      .last()
      .waitFor();
    await page.screenshot({
      path: join(output, "synthetic-history.png"),
      fullPage: true,
    });
    return { historyVisible: true, reload: true };
  });
  await step("原生分叉后前台仍保留提示来源", async () => {
    const plan = await request("prepareConversationFork", {
      sessionId,
      chatId,
    });
    const childSession = await nativeRpc("session/fork", {
      sessionId,
      atSeq: plan.atSeq,
    });
    const { fork } = await request("forkChat", {
      sessionId,
      chatId,
      targetSessionId: childSession.sessionId,
      turn: plan.turn,
      sourceRevision: plan.sourceRevision,
      atSeq: plan.atSeq,
    });
    await request("renameConversation", {
      sessionId: childSession.sessionId,
      title: "合成验收分支",
    });
    await openStory("合成验收分支");
    await sendStory(
      "ACCEPTANCE_FORK_FOUR：分支里再领取一枚观测徽章。正文明确写出徽章和领取后总数为 4，灯笼仍固定悬挂。",
    );
    const store = createChatJournalStore({
      dataRoot: data,
      compatibleStorage: false,
    });
    const deadline = Date.now() + timeout;
    let branch;
    while (Date.now() < deadline) {
      branch = await store.read(fork.chatId);
      if (
        branch?.messages.filter((message) => message.role === "user").length ===
          3 &&
        branch.messages.at(-1)?.mvu?.receipt?.status === "updated"
      )
        break;
      await pause(200);
    }
    inspectChat(branch, 3, 4, "徽章");
    inspectChat(await saved(), 2, 3, edited, false);
    {
      const captures = values["provider-config"]
        ? (
            await request("gameplay.requests", {
              sessionId: childSession.sessionId,
            })
          ).requests.map((row) =>
            summarizeRequest(row.request, values["system-marker"]),
          )
        : (await readFile(capture, "utf8")).trim().split("\n").map(JSON.parse);
      const final = captures
        .filter((item) => item.sessionId === childSession.sessionId)
        .at(-1);
      assert.ok(
        final && final.markers.card > 0 && final.markers.worldbook > 0,
        "分支最终请求缺少来源",
      );
      assert.equal(
        final.injectionOccurrences,
        purgeEnabled ? 1 : 0,
        "原生分叉不应被误判为 subagent",
      );
    }
    return { parentUnchanged: true, branchBadges: 4 };
  });
  await step("未绑卡设计模式不接收剧情注入", async () => {
    const created = await request("gameplay.create", { mode: "card", model });
    await request("gameplay.send", {
      sessionId: created.sessionId,
      input: "设计一张中性观星站角色卡，只给简短建议，不修改文件。",
    });
    await settled(created.sessionId, 1);
    const rows = (
      await request("gameplay.requests", { sessionId: created.sessionId })
    ).requests;
    const final = summarizeRequest(
      rows.at(-1).request,
      values["system-marker"],
    );
    assert.equal(final.injectionOccurrences, 0, "未绑卡工作台误收剧情注入");
    return { sourceNames: final.sources, injectionOccurrences: 0 };
  });
  await step("Mnemon 改卡来源保存与检索", async () => {
    const created = await request("gameplay.create", {
      sourceCard: "acceptance.json",
      mode: "card",
      model,
    });
    const id = created.sessionId;
    await request("gameplay.send", {
      sessionId: id,
      input: `ACCEPTANCE_MEMORY_SAVE：请调用 tavern_memory_preference 保存长期改卡偏好“${markers.preference}：保留原始开场白。”`,
    });
    await settled(id, 1);
    await request("gameplay.send", {
      sessionId: id,
      input:
        "ACCEPTANCE_MEMORY_READ：请调用 tavern_memory_search 检索刚才保存的长期偏好。",
    });
    await settled(id, 2);
    const cardRequests = (await request("gameplay.requests", { sessionId: id }))
      .requests;
    assert.equal(
      summarizeRequest(cardRequests.at(-1).request, values["system-marker"])
        .injectionOccurrences,
      0,
      "绑卡工作台误收剧情注入",
    );
    const tools = await toolEvidence(id);
    assert.ok(
      tools.includes("tavern_memory_preference") &&
        tools.includes("tavern_memory_search"),
      "记忆工具未真正成功执行",
    );
    const native = (await request("gameplay.native", { sessionId: id })).events;
    const searches = new Set(
      native
        .filter(
          (event) =>
            event.type === "tool/call" &&
            event.data.name === "tavern_memory_search",
        )
        .map((event) => event.data.callId),
    );
    assert.ok(
      native.some(
        (event) =>
          event.type === "tool/result" &&
          searches.has(event.data?.message?.source?.callId) &&
          JSON.stringify(event.data.message.content).includes(
            markers.preference,
          ),
      ),
      "检索结果缺少已保存偏好",
    );
    const recalled = native
      .filter(
        (event) =>
          event.type === "user/message" &&
          event.data?.source?.form === "card-memory",
      )
      .at(-1);
    assert.ok(
      recalled &&
        JSON.stringify(recalled.data.content).includes(markers.preference),
      "真实 pre-step 未追加已保存记忆",
    );
    const expected = summarizeRequest({
      messages: [{ role: "user", ...recalled.data }],
    }).pluginMessages[0];
    const hostFinal = summarizeRequest(
      cardRequests.at(-1).request,
      values["system-marker"],
    );
    const actualFinal = values["provider-config"]
      ? hostFinal
      : (await readFile(capture, "utf8"))
          .trim()
          .split("\n")
          .map(JSON.parse)
          .filter((row) => row.sessionId === id)
          .at(-1);
    assert.ok(
      actualFinal?.pluginMessages.some(
        (message) =>
          message.form === "card-memory" &&
          message.contentSha256 === expected.contentSha256,
      ),
      "记忆 pre-step 插件消息未逐字到达模型适配器",
    );
    return {
      tools,
      savedPreferenceRecalled: true,
      preStepUserMessagePreserved: true,
      sourcePlugin: expected.plugin,
      sourceForm: expected.form,
      contentSha256: expected.contentSha256,
      scope:
        "Tavern 使用 Mnemon Source 的 card-memory；未挂载全局 Mnemon hooks",
    };
  });
  await step("结束后制品无漂移", async () => {
    await browser.close();
    browser = null;
    await stop();
    verifyRuntime(runtime);
  });
  report.status = report.pending.length ? "passed-with-pending" : "passed";
} catch (error) {
  if (page && !values["provider-config"]) {
    await page
      .screenshot({
        path: join(output, "synthetic-failure.png"),
        fullPage: true,
      })
      .catch(() => {});
    await writeFile(
      join(output, "synthetic-failure.txt"),
      await page
        .locator("body")
        .innerText()
        .catch(() => "页面已关闭"),
      { mode: 0o600 },
    );
  }
  report.status = "failed";
  report.failure = {
    step: report.currentStep,
    code: error.code || error.name || "Error",
  };
  report.failure.location = String(error.stack)
    .split("\n")
    .find((line) => line.includes("tavern-acceptance/run.mjs:"))
    ?.trim();
  if (error.code === "ERR_ASSERTION")
    report.failure.assertion = String(error.message).split("\n")[0];
  // 错误消息仅保留本脚本定义的白名单；外部错误不得进入公开回执。
  console.error(
    "验收失败：" + report.currentStep + "；类型：" + report.failure.code,
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stop();
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(output, "validation.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
}
