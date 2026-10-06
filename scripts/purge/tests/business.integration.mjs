import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import test from "node:test";
import { root } from "../common.mjs";
import { initializeProfile } from "../profile.mjs";

const runtime = resolve(
  process.env.DSH_TEST_RUNTIME ?? join(root, ".artifacts/purge/runtime"),
);
const installed = (name) => join(runtime, "node_modules", name, "lib/index.js");
const { defaultOverrideText } = await import(
  pathToFileURL(join(runtime, "node_modules/dsh-purge/lib/core.js"))
);
const { modePromptText } = await import(
  pathToFileURL(join(runtime, "node_modules/dsh-purge/lib/identity.js"))
);
const marker = modePromptText(defaultOverrideText(), false)
  .trim()
  .split(/\\r\\n|\r?\n/)
  .find((line) => line.trim());
assert.ok(marker.length > 10);
const { DeepSeekHarness } = await import(
  pathToFileURL(installed("@deepseek-ai/dsh-sdk-client"))
);

test(
  "purge 真实 preset：模型请求可见、重启恢复、无旧注入事件",
  { timeout: 90000 },
  async () => {
    // 夹具在独立安装树内，以正常 Node 包解析使用同一套 Cordis 与服务。
    const dir = mkdtempSync(join(runtime, "business-"));
    const home = join(dir, "home");
    const workspace = join(dir, "workspace");
    mkdirSync(home);
    initializeProfile(runtime, home, { surface: "sdk" });
    mkdirSync(workspace);
    const requests = [];
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      requests.push(JSON.parse(body));
      const events = [
        {
          type: "message_start",
          message: {
            id: "local",
            model: "deepseek-v4-flash",
            usage: { input_tokens: 10, output_tokens: 0 },
          },
        },
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "NEUTRAL_BUSINESS_OK" },
        },
        { type: "content_block_stop", index: 0 },
        {
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { output_tokens: 5 },
        },
        { type: "message_stop" },
      ];
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    try {
      for (const [index, preset] of [
        "creative",
        "creative",
        "standard",
      ].entries()) {
        const result = join(dir, `result-${index}.json`);
        const runner = join(dir, `runner-${index}.mjs`);
        const trigger = join(dir, `start-${index}`);
        writeFileSync(
          runner,
          `
import { writeFileSync, existsSync } from 'node:fs';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
export const name='business-integration';
export const inject=['agents','agentLoop','agentPresets','sessionPersistence'];
export function apply(ctx){
  const poll=setInterval(()=>{if(!existsSync(${JSON.stringify(trigger)}))return;clearInterval(poll);void execute().catch(error=>writeFileSync(${JSON.stringify(result)},JSON.stringify({error:String(error),stack:error.stack})));},25);
  ctx.effect(()=>()=>clearInterval(poll));
  async function execute(){
    const options={agentOptions:{provider:'deepseek-official',model:'deepseek-v4-flash'},setup:async agentCtx=>{await ctx.agentPresets.mount(agentCtx,${JSON.stringify(preset)});}};
    const handle=await ctx.agents.${index !== 1 ? "create" : "resume"}({...options,${index !== 1 ? "sessionId:" + JSON.stringify("business-session-" + index) + ",meta:{cwd:" + JSON.stringify(workspace) + "}" : "resumeSessionId:'business-session-0'"}});
    const done=new Promise(resolve=>{const off=ctx.on('agent/status',({agent,status})=>{if(agent===handle.agent&&status==='idle'){off();resolve();}});});
    handle.agent.send(createUserMessage({content:[{type:'text',text:'NEUTRAL_PROMPT_${index}'}],source:{kind:'user'}}),'next-turn',true);
    await done;
    writeFileSync(${JSON.stringify(result)},JSON.stringify({events:handle.agent.session.snapshotEvents(),preset:ctx.agentPresets.composedPreset(handle.agent.ctx)}));
    await handle.dispose();
  }
}`,
        );
        const patch = join(dir, `patch-${index}.json`);
        writeFileSync(
          patch,
          JSON.stringify([
            { id: "skill-filesystem", config: { includeDefaultRoots: false } },
            {
              id: "session-persistence-jsonl",
              config: { root: join(dir, "sessions"), compression: "none" },
            },
            { id: "session-telemetry-otel", disabled: true },
            { id: "session-log-deepseek", disabled: true },
            {
              id: "llm-deepseek",
              config: { baseURL: endpoint, thinking: "disabled" },
            },
            {
              insert: [
                {
                  id: "subagent-model-selection-settings",
                  name: "@deepseek-ai/dsh-tool-subagent/model-selection-settings",
                },
                {
                  id: "agent-preset-registry",
                  name: "@deepseek-ai/dsh-agent-preset-registry",
                  config: { default: "creative" },
                },
                { id: "business-integration", name: runner },
              ],
            },
          ]),
        );
        const harness = new DeepSeekHarness({
          dshBin: join(runtime, "node_modules/@deepseek-ai/dsh/lib/bin.js"),
          patches: [
            join(
              runtime,
              "node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml",
            ),
            patch,
          ],
          dshHome: home,
          cwd: workspace,
          processCwd: workspace,
          env: {
            PATH: process.env.PATH,
            DSH_BASE: join(runtime, "node_modules/@deepseek-ai"),
            DSH_SURFACE: "web",
            DSH_AGENTS_HOME: join(home, "agents"),
            DSH_TELEMETRY_DISABLED: "1",
            DEEPSEEK_API_KEY: "local-test-only",
          },
          initializeTimeoutMs: 30000,
          requestTimeoutMs: 30000,
        });
        try {
          await harness.start();
          writeFileSync(trigger, "start");
          const deadline = Date.now() + 15000;
          while (!existsSync(result) && Date.now() < deadline) await pause(25);
          assert.ok(existsSync(result), "真实 Agent 活动应结束");
          const data = JSON.parse(readFileSync(result, "utf8"));
          assert.equal(data.error, undefined, data.stack);
          assert.equal(data.preset, preset);
          assert.equal(requests.length, index + 1);
          const text = JSON.stringify(requests.at(-1).messages);
          const request = JSON.stringify(requests.at(-1));
          assert.ok(
            request.includes(JSON.stringify(marker).slice(1, -1)),
            "purge 内容应进入实际模型请求",
          );
          assert.ok(
            !data.events.some((event) => event.type === "request/injections"),
          );
          assert.ok(requests.at(-1).tools.length > 0, "保留标准工具能力");
          if (index === 1) assert.ok(text.includes("NEUTRAL_PROMPT_0"));
        } finally {
          await harness.close();
        }
      }
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
