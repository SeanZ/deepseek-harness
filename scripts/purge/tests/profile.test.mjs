import assert from "node:assert/strict";
import test from "node:test";
import { planProfile, legacyPreset, retiredBundles } from "../profile.mjs";

test("profile 退出旧扩展，保留 Team 与用户依赖，purge 只注册一次", () => {
  const source = {
    name: "fixture",
    dependencies: {
      "user-plugin": "file:./user",
      "dsh-unrestricted": "file:./old",
    },
    dsh: {
      profile: {
        bundles: [
          "@deepseek-ai/dsh-base",
          "@deepseek-ai/dsh-web-app",
          ...retiredBundles,
          "fixture-team",
          "dsh-purge",
        ],
      },
    },
  };
  const original = structuredClone(source);
  const next = planProfile(source, "/fixture/runtime");
  assert.deepEqual(source, original);
  assert.deepEqual(next.dsh.profile.bundles, [
    "@deepseek-ai/dsh-base",
    "@deepseek-ai/dsh-web-app",
    "fixture-team",
    "dsh-purge",
  ]);
  assert.equal(
    next.dependencies["user-plugin"],
    source.dependencies["user-plugin"],
  );
  assert.ok(!next.dependencies["dsh-unrestricted"]);
  assert.deepEqual(planProfile(next, "/fixture/runtime"), next);
  assert.throws(() => planProfile({}, "/fixture/runtime"));
});

test("历史 preset 逐字复用 standard 的能力配置，并拒绝未知布局", () => {
  const standard =
    "old header\n        plugins:\n          - id: fixture-tool\n";
  const next = legacyPreset(standard);
  assert.match(next, /id: creative/);
  assert.equal(
    next.split("        plugins:\n")[1],
    standard.split("        plugins:\n")[1],
  );
  assert.throws(() => legacyPreset("unknown layout"), /布局变化/);
});
