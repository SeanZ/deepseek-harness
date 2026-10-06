import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSourceClosure,
  sourceRuntimePackages,
} from "../source-closure.mjs";
const base = () => [
  {
    name: "@deepseek-ai/dsh",
    dependencies: {
      "@deepseek-ai/dsh-sdk-client": "0.0.0-unpublished.1",
      "@deepseek-ai/cordis": "~4.0.5-alpha.1",
      "@deepseek-ai/node-addon-system": "0.1.2",
    },
  },
  { name: "@deepseek-ai/dsh-sdk-client" },
  { name: "@deepseek-ai/cordis" },
];
test("源码闭包允许未发布版本和独立原生依赖，缺失 DSH/vendor 必须阻断", () => {
  assert.doesNotThrow(() => assertSourceClosure(base()));
  for (const section of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const data = base();
    data[1][section] = { "@deepseek-ai/dsh-missing": "0.0.0-unpublished.1" };
    assert.throws(() => assertSourceClosure(data), /闭包缺失/);
  }
  assert.throws(() => assertSourceClosure(base().slice(1)), /缺少源码入口/);
  assert.throws(() => assertSourceClosure([...base(), base()[0]]), /重复/);
  const data = base();
  data[0].dependencies["@deepseek-ai/cordis"] = "workspace:*";
  assert.throws(() => assertSourceClosure(data), /未转换/);
});

test("运行闭包保留传递依赖与显式扩展入口，不安装无关测试工具", () => {
  const entries = [
    ...base(),
    {
      name: "@deepseek-ai/dsh-optional-tool",
      peerDependencies: { "@deepseek-ai/dsh-helper": "0.0.0-unpublished.1" },
    },
    { name: "@deepseek-ai/dsh-helper" },
    { name: "@deepseek-ai/dsh-test-fixture", dependencies: { vitest: "*" } },
  ];
  assert.equal(sourceRuntimePackages(entries).length, 3);
  assert.equal(
    sourceRuntimePackages(entries, ["@deepseek-ai/dsh-optional-tool"]).length,
    5,
  );
  assert.throws(() => sourceRuntimePackages(entries, ["missing"]), /未打包/);
});
