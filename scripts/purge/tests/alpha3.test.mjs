import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptAlpha3Core,
  adaptAlpha3Identity,
  prohibition,
  briefIdentity,
} from "../alpha3.mjs";

const fixture = `export const files = {"web-app-lib": firstExisting([])};
export const PATCHES = [
  {
    name: "WEB_SURFACE_IDENTITY_NEUTRAL", file: ["web-app-lib"],
    replacements: [
      {pattern: "You are interacting with the user through the DeepSeek Harness Web GUI at \${webUrl}.", replace: "You are interacting with the user through the local web GUI at \${webUrl}."},
      {pattern: 'description: "Canonical local URL of the DeepSeek Harness Web GUI serving this session."', replace: 'description: "Canonical local URL of the web GUI serving this session."'},
    ], markers: [],
  },
  {
    name: "WEB_SURFACE_PROHIBITION", file: ["web-app-lib"],
    replacements: [
      {pattern: "You are interacting with the user through the local web GUI at \${webUrl}.", replace: "Local web GUI: \${webUrl}. // [dsh-purge] web surface identity neutralized"},
      {pattern: ${JSON.stringify(prohibition)}, replace: "",},
    ], markers: [],
  },
];`;

test("alpha.3 默认后缀适配拒绝未知来源与重复适配", () => {
  const source = `  let sawSuffix = false;
      sawSuffix = true;
out.push({ ...section, text: CWD_ONLY_SUFFIX });
  if (!sawSuffix) {
    out.push({
      name: "deployment:persona-suffix",
      text: CWD_ONLY_SUFFIX,
      order: 10200,
    });
  }
`;
  const adapted = adaptAlpha3Identity(source);
  assert.ok(!adapted.includes("CWD_ONLY_SUFFIX"));
  assert.ok(adapted.includes('out.push({ ...section, text: "" });'));
  assert.throws(() => adaptAlpha3Identity(adapted), /锚点/);
  assert.throws(() => adaptAlpha3Identity("unknown"), /锚点/);
});

test("alpha.3 网页规则移动到新目标，仅替换当前模板串，保留旧历史匹配文本", async () => {
  const output = adaptAlpha3Core(fixture);
  const module = await import(
    `data:text/javascript,${encodeURIComponent(
      'const firstExisting = (files) => files[0], aiBase = "/base", path = {join: (...parts) => parts.join("/")};\n' +
        output,
    )}`
  );
  assert.equal(
    module.files["harness-dev-context-lib"],
    "/base/dsh-harness-dev-context/lib/index.js",
  );
  const current =
    "const WEB_SURFACE_PROMPT = `You are interacting with the user through the DeepSeek Harness Web GUI whose URL the runtime context names. " +
    prohibition +
    "`;";
  const legacy = `const LEGACY_WEB_SURFACE = {suffix: ${JSON.stringify(prohibition)}};`;
  let text = current + "\n" + legacy;
  for (const patch of module.PATCHES)
    for (const change of patch.replacements)
      text = text.split(change.pattern).join(change.replace);
  assert.ok(text.startsWith("const WEB_SURFACE_PROMPT = `" + briefIdentity));
  assert.ok(text.endsWith(legacy));
  assert.equal(text.split(prohibition).length, 2);
  assert.throws(() => adaptAlpha3Core(output), /锚点/);
  assert.throws(() => adaptAlpha3Core("unknown"), /锚点/);
});
