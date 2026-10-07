/** 仅封存校验通过的制品目录；固定 tar/gzip 元数据，不混入 runtime/home。 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { verifyDist, verifyReceipt } from "./audit.mjs";
import { readJson, run, sha256 } from "./common.mjs";
const { values } = parseArgs({
  options: { dist: { type: "string" }, out: { type: "string" } },
});
assert.ok(values.dist && values.out, "需要 --dist --out");
const dist = resolve(values.dist),
  out = resolve(values.out);
assert.ok(!existsSync(out), "禁止覆盖已有归档");
verifyDist(dist);
verifyReceipt(dist, readJson(join(dist, "validation.json")));
run("python3", [
  "-c",
  `import gzip,tarfile,pathlib,sys
root=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2])
with target.open('xb') as raw:
 with gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0,compresslevel=6) as zipped:
  with tarfile.open(fileobj=zipped,mode='w',format=tarfile.PAX_FORMAT) as archive:
   for file in sorted(root.rglob('*')):
    if not file.is_file(): continue
    info=archive.gettarinfo(str(file),arcname='dsh-tavern-release/'+str(file.relative_to(root)))
    info.uid=info.gid=info.mtime=0;info.uname=info.gname='';info.mode=0o644;info.pax_headers={}
    with file.open('rb') as stream: archive.addfile(info,stream)
`,
  dist,
  out,
]);
writeFileSync(
  out + ".sha256",
  sha256(readFileSync(out)) + "  " + out.split("/").at(-1) + "\n",
);
console.log(out);
