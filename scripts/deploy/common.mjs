/** 固定部署制品的文件、摘要和子进程操作。 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  lstatSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
export const scriptRoot = dirname(fileURLToPath(import.meta.url));
export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function json(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}
export function run(command, args, options = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(key),
    ),
  );
  env.npm_config_cache = join(tmpdir(), "dt-build-npm-cache");
  env.npm_config_userconfig = "/dev/null";
  env.npm_config_registry = "https://registry.npmjs.org";
  env.npm_execpath ??= "pnpm";
  env.LC_ALL = "C";
  env.LANG = "C";
  return execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env,
    ...options,
  });
}
export function files(root, directory = root) {
  return readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const path = join(directory, name),
        stat = lstatSync(path);
      assert.ok(!stat.isSymbolicLink(), `制品不允许符号链接：${path}`);
      return stat.isDirectory() ? files(root, path) : [relative(root, path)];
    });
}
export function checkIntegrity(bytes, integrity) {
  assert.match(integrity, /^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/);
  const [algorithm, expected] = integrity.split("-");
  assert.equal(
    createHash(algorithm).update(bytes).digest("base64"),
    expected,
    "npm tarball 完整性不符",
  );
}
export function safeRelative(path) {
  assert.ok(
    typeof path === "string" &&
      /^[a-zA-Z0-9_.@/-]+$/.test(path) &&
      !path.startsWith("/") &&
      !path.split("/").some((part) => part === ".." || part === "." || !part),
    "制品路径越界",
  );
  return path;
}
