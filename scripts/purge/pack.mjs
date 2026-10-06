import assert from "node:assert/strict";
import {
  mkdtempSync,
  cpSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { root, readJson, digest, run, json } from "./common.mjs";
const { values } = parseArgs({
  options: { dist: { type: "string" }, out: { type: "string" } },
});
assert.ok(values.dist && values.out, "需要 --dist、--out");
const dist = resolve(values.dist),
  out = resolve(values.out);
assert.ok(!existsSync(out), "输出文件已存在");
const manifest = readJson(join(dist, "manifest.json"));
assert.equal(manifest.sealed, true, "只交付已封存补丁的制品");
const validation = readJson(join(dist, "validation.json"));
assert.equal(validation.passed, true, "必须先通过本地验收");
assert.equal(
  validation.manifestSha256,
  digest(readFileSync(join(dist, "manifest.json"))),
  "验收记录不匹配当前制品",
);
const scratch = mkdtempSync(join(tmpdir(), "dsh-purge-delivery-"));
try {
  cpSync(dist, join(scratch, "dist"), { recursive: true });
  mkdirSync(join(scratch, "scripts"));
  cpSync(join(root, "scripts/purge"), join(scratch, "scripts/purge"), {
    recursive: true,
  });
  cpSync(join(dist, "validation.json"), join(scratch, "acceptance.json"));
  run(
    "tar",
    [
      "--no-xattrs",
      "-czf",
      out,
      "-C",
      scratch,
      "dist",
      "scripts",
      "acceptance.json",
    ],
    { env: { ...process.env, COPYFILE_DISABLE: "1" } },
  );
  json(`${out}.json`, {
    sha256: digest(readFileSync(out)),
    upstreamVersion: manifest.upstreamVersion,
    purgeVersion: manifest.purge.version,
  });
  console.log(JSON.stringify({ out, sha256: digest(readFileSync(out)) }));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
