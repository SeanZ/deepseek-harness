import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { json, readJson } from "./common.mjs";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

export const retiredBundles = [
  "dsh-request-injections",
  "dsh-preset-creative",
  "dsh-unrestricted",
];
export function planProfile(manifest, runtime) {
  const next = structuredClone(manifest);
  const bundles = next.dsh?.profile?.bundles;
  assert.ok(
    Array.isArray(bundles) && bundles.includes("@deepseek-ai/dsh-base"),
    "只处理已知 base profile",
  );
  next.dsh.profile.bundles = [
    ...bundles.filter(
      (name) => ![...retiredBundles, "dsh-purge"].includes(name),
    ),
    "dsh-purge",
  ];
  next.dependencies ??= {};
  for (const name of retiredBundles) delete next.dependencies[name];
  next.dependencies["dsh-purge"] =
    `link:${join(runtime, "node_modules/dsh-purge")}`;
  return next;
}

/** 兼容旧 ID，能力逐字取自当前 standard，不附加业务提示词。 */
export function legacyPreset(standard) {
  const marker = "        plugins:\n";
  assert.equal(
    standard.split(marker).length,
    2,
    "standard 布局变化，需审查别名生成",
  );
  return (
    "- insert:\n    - id: preset-creative\n      name: '@deepseek-ai/dsh-agent-preset'\n      config:\n        id: creative\n        name: 历史兼容\n        description: 旧 creative 会话兼容入口，能力与 standard 相同。\n        order: 999\n" +
    marker +
    standard.split(marker)[1]
  );
}

/** 仅生成新的 profile；源配置只读取，已有用户设置保持原值。 */
export function initializeProfile(
  runtime,
  home,
  { surface = "web", previous, legacy = true, previousPatch = "" } = {},
) {
  assert.ok(["web", "sdk"].includes(surface));
  const directory = join(home, "profiles", surface);
  assert.ok(!existsSync(directory), "不能覆盖已有 profile");
  mkdirSync(join(directory, "node_modules"), { recursive: true });
  const base = previous ?? {
    name: `dsh-profile-${surface}`,
    private: true,
    dsh: {
      profile: {
        bundles: [
          "@deepseek-ai/dsh-base",
          `@deepseek-ai/dsh-${surface === "web" ? "web-app" : "sdk-app"}`,
        ],
      },
    },
  };
  json(join(directory, "package.json"), planProfile(base, runtime, surface));
  symlinkSync(
    join(runtime, "node_modules/dsh-purge"),
    join(directory, "node_modules/dsh-purge"),
    "dir",
  );
  const require = createRequire(join(runtime, "package.json"));
  const yaml = require("js-yaml");
  class Expression {
    constructor(value) {
      this.value = value;
    }
  }
  const schema = yaml.DEFAULT_SCHEMA.extend(
    new yaml.Type("tag:yaml.org,2002:js", {
      kind: "scalar",
      construct: (value) => new Expression(value),
      instanceOf: Expression,
      represent: (value) => value.value,
    }),
  );
  const original = previousPatch ? yaml.load(previousPatch, { schema }) : [];
  assert.ok(Array.isArray(original), "profile patch 必须是数组");
  const retiredIds = [
    "unrestricted",
    "request-injections-compatibility",
    "preset-creative",
  ];
  const clean = (rows) =>
    rows
      .filter(
        (row) =>
          !retiredIds.includes(row.id) && !retiredBundles.includes(row.name),
      )
      .map((row) => (row.insert ? { ...row, insert: clean(row.insert) } : row));
  const patches = clean(original);
  const purgePatch = yaml.load(
    readFileSync(
      join(runtime, "node_modules/dsh-purge/cordis.patch.yml"),
      "utf8",
    ),
    { schema },
  );
  const config = purgePatch
    .flatMap((row) => row.insert ?? [])
    .find((row) => row.id === "dsh-purge").config;
  patches.push({
    id: "dsh-purge",
    config: { ...config, autoApplyOnStart: false, autoUpdateOnStart: false },
  });
  if (legacy) {
    const text = readFileSync(
      join(
        runtime,
        "node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml",
      ),
      "utf8",
    );
    patches.push(...yaml.load(legacyPreset(text), { schema }));
  }
  writeFileSync(
    join(directory, "cordis.patch.yml"),
    yaml.dump(patches, { schema, lineWidth: -1, noRefs: true }),
  );
  return directory;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: {
      runtime: { type: "string" },
      home: { type: "string" },
      previous: { type: "string" },
      surface: { type: "string", default: "web" },
    },
  });
  assert.ok(values.runtime && values.home, "需要 --runtime 和 --home");
  const previous = values.previous && resolve(values.previous);
  console.log(
    initializeProfile(resolve(values.runtime), resolve(values.home), {
      surface: values.surface,
      previous: previous ? readJson(join(previous, "package.json")) : undefined,
      previousPatch:
        previous && existsSync(join(previous, "cordis.patch.yml"))
          ? readFileSync(join(previous, "cordis.patch.yml"), "utf8")
          : "",
    }),
  );
}
