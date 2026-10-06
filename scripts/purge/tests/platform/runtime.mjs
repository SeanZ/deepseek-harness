import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export const runtime = resolve(
  process.env.DSH_TEST_RUNTIME ?? ".artifacts/purge/runtime",
);
export const requireRuntime = createRequire(resolve(runtime, "package.json"));
export const importRuntime = (name) =>
  import(
    import.meta.resolve(name, pathToFileURL(resolve(runtime, "package.json")))
  );
