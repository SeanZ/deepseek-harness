import assert from "node:assert/strict";

export const webIdentity =
  "You are interacting with the user through the DeepSeek Harness Web GUI whose URL the runtime context names.";
export const neutralIdentity =
  "You are interacting with the user through the local web GUI whose URL the runtime context names.";
export const briefIdentity =
  "Local web GUI: the runtime context names its URL.";
export const prohibition =
  "Do not start a replacement server unless the user asks; if one is needed, use a managed background job and verify its exact URL.";

function replaceOnce(source, from, to) {
  assert.equal(source.split(from).length, 2, "alpha.3 补丁锚点已变更");
  return source.replace(from, to);
}

/** 只修改固定规则本体，避免误改其它规则或旧会话匹配文本。 */
function rule(source, name, transform) {
  const start = source.indexOf(`name: "${name}"`);
  const end = source.indexOf("\n  },", start);
  assert.ok(start >= 0 && end > start, `缺少规则 ${name}`);
  return (
    source.slice(0, start) +
    transform(source.slice(start, end)) +
    source.slice(end)
  );
}

/** Web 提示从 web-app 移到 harness-dev-context；旧日志识别常量必须原样保留。 */
export function adaptAlpha3Core(source) {
  let output = replaceOnce(
    source,
    '"web-app-lib": firstExisting([',
    '"harness-dev-context-lib": firstExisting([\n' +
      '      path.join(aiBase, "dsh-harness-dev-context", "lib", "index.js"),\n' +
      '    ]),\n    "web-app-lib": firstExisting([',
  );
  output = rule(output, "WEB_SURFACE_IDENTITY_NEUTRAL", (text) => {
    let result = replaceOnce(
      text,
      'file: ["web-app-lib"]',
      'file: ["web-app-lib", "harness-dev-context-lib"]',
    );
    result = replaceOnce(
      result,
      '"You are interacting with the user through the DeepSeek Harness Web GUI at ${webUrl}."',
      JSON.stringify("const WEB_SURFACE_PROMPT = `" + webIdentity),
    );
    result = replaceOnce(
      result,
      '"You are interacting with the user through the local web GUI at ${webUrl}."',
      JSON.stringify("const WEB_SURFACE_PROMPT = `" + neutralIdentity),
    );
    result = result.replaceAll("Canonical local URL", "Advertised URL");
    return replaceOnce(
      result,
      "markers: [",
      `markers: [${JSON.stringify(neutralIdentity)}, ${JSON.stringify(briefIdentity)},`,
    );
  });
  return rule(output, "WEB_SURFACE_PROHIBITION", (text) => {
    let result = replaceOnce(
      text,
      'file: ["web-app-lib"]',
      'file: ["harness-dev-context-lib"]',
    );
    result = replaceOnce(
      result,
      '"You are interacting with the user through the local web GUI at ${webUrl}."',
      JSON.stringify("const WEB_SURFACE_PROMPT = `" + neutralIdentity),
    );
    result = replaceOnce(
      result,
      '"Local web GUI: ${webUrl}. // [dsh-purge] web surface identity neutralized"',
      JSON.stringify("const WEB_SURFACE_PROMPT = `" + briefIdentity),
    );
    // 当前模板串以反引号结束；旧日志识别副本以双引号结束，不会匹配。
    result = replaceOnce(
      result,
      JSON.stringify(prohibition),
      JSON.stringify(prohibition + "`;"),
    );
    result = replaceOnce(result, 'replace: "",', 'replace: "`;",');
    return replaceOnce(
      result,
      "markers: [",
      `markers: [${JSON.stringify(briefIdentity)},`,
    );
  });
}
