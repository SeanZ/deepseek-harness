import assert from "node:assert/strict";
import test from "node:test";
import { importRuntime, requireRuntime } from "./runtime.mjs";

test(
  "安装后的 Office 服务完成合成文档转 PDF 与缓存复用",
  { timeout: 120000 },
  async () => {
    const { zipSync, strToU8 } = requireRuntime("fflate");
    const { Context } = await importRuntime("@deepseek-ai/cordis");
    const { default: OfficeToPdf, OfficeSourceKey } = await importRuntime(
      "@deepseek-ai/dsh-office-to-pdf",
    );
    const data = zipSync(
      Object.fromEntries(
        Object.entries({
          "[Content_Types].xml":
            '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
          "_rels/.rels":
            '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
          "word/document.xml":
            '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Neutral compatibility fixture</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
        }).map(([path, text]) => [path, strToU8(text)]),
      ),
    );
    const ctx = new Context();
    try {
      await ctx.plugin(OfficeToPdf, { maxConcurrentConversions: 1 });
      const request = {
        extension: "docx",
        priority: "foreground",
        source: {
          key: OfficeSourceKey("neutral-compatibility"),
          version: "1",
          bytes: data.length,
          read: async () => ({ bytes: data, version: "1" }),
        },
      };
      const result = await ctx.officeToPdf.convert(request);
      assert.equal(Buffer.from(result.pdf).subarray(0, 5).toString(), "%PDF-");
      assert.ok(result.pdf.length > 500);
      assert.deepEqual(
        (await ctx.officeToPdf.convert(request)).pdf,
        result.pdf,
      );
    } finally {
      await ctx.fiber.dispose();
    }
  },
);
