/** 在已启动的隔离 Web 实例上验证插件下载，不读取或输出生产凭据。 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { test } from 'node:test'

const [logPath, sessionPath, workspace] = process.argv.slice(2)
assert.ok(logPath && sessionPath && workspace, '参数：启动日志、隔离会话 JSON、隔离工作区绝对路径')
assert.ok(isAbsolute(workspace), '工作区必须是绝对路径')
const log = await readFile(logPath, 'utf8')
const start = [...log.matchAll(/dsh web: (http:\/\/\S+)/g)].at(-1)?.[1]
assert.ok(start, '日志中缺少启动地址')
const origin = new URL(start).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname), '仅允许 loopback 隔离实例')
const sessionId = JSON.parse(await readFile(sessionPath, 'utf8')).sessionId
assert.equal(typeof sessionId, 'string')
const auth = await fetch(start, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
assert.equal(auth.status, 303)
const cookie = auth.headers.get('set-cookie')?.split(';')[0]
assert.ok(cookie)

await test('下载兼容回归', async (t) => {
  // 原子分配每次运行独有的文件，清理只作用于本次创建的目录。
  const inside = await mkdtemp(join(workspace, '.sidebar-download-'))
  t.after(() => rm(inside, { recursive: true, force: true }))
  const outside = await mkdtemp(resolve(workspace, '../.sidebar-outside-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const file = join(inside, '验证文件.bin')
  const expected = Buffer.from(Array.from({ length: 1024 }, (_, index) => index % 256))
  await writeFile(file, expected)
  const external = join(outside, 'outside.bin')
  await writeFile(external, randomUUID())
  const link = join(inside, 'outside-link')
  await symlink(external, link)

  /** 调用实际媒体路由；返回体立即读完以释放连接。 */
  async function download(path, requestOrigin = origin) {
    const query = new URLSearchParams({ sessionId, path, cwd: workspace, download: '1' })
    const response = await fetch(`${origin}/sidebar/file?${query}`, {
      headers: { cookie, origin: requestOrigin },
      signal: AbortSignal.timeout(10000),
    })
    return { status: response.status, disposition: response.headers.get('content-disposition'), body: Buffer.from(await response.arrayBuffer()) }
  }

  for (const [name, path] of [['相对路径', relative(workspace, file)], ['绝对路径', file]]) {
    await t.test(`${name}保留二进制字节和下载文件名`, async () => {
      const result = await download(path)
      assert.equal(result.status, 200)
      assert.deepEqual(result.body, expected)
      assert.equal(result.disposition, `attachment; filename*=UTF-8''${encodeURIComponent('验证文件.bin')}`)
    })
  }

  await t.test('拒绝通过父目录读取工作区外文件', async () => {
    assert.equal((await download(relative(workspace, external))).status, 403)
  })
  await t.test('拒绝通过软链接读取工作区外文件', async () => {
    assert.equal((await download(relative(workspace, link))).status, 403)
  })
  await t.test('拒绝不可信 Origin 的下载请求', async () => {
    assert.equal((await download(file, 'https://untrusted.invalid')).status, 403)
  })
})
