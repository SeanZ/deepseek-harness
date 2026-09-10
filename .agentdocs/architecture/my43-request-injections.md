# my43 请求注入与运行契约

## 补丁边界

当前分支在官方 `dsh-v0.1.5-alpha.2` 上保留 `agentLoop.requestInjectionsVersion = 2` 与 `agent/request-injections` waterfall。声明是完整快照，空数组清空；生产者 key 必须唯一，只接受带插件来源的 assistant 文本。最新人类输入前锚定不会随连续工具调用漂移，depth 定位按完整工具交互计数，且不得越过开头的 system 消息。

`request/injections` 是 required 持久事件，不属于聊天历史节点。发送前记录、按日志重建；重试重新读取声明，准备阶段取消不提交用户输入或注入。存在注入或快照改变时开始新请求序列，让 alpha 的系统消息策略与可能发生位置变化的请求一致；因此不能承诺跨请求前缀缓存连续性。token-meter 将注入计入请求占用，单独保留历史节点计量；声明变化使旧 usage 锚点失效。

`creative` 使用当前 standard 的完整组合，独立标识用于外部插件选择，不自行提供注入文本。两者解析后相等由测试锁定。alpha 不提供 preset 继承，因此维护 standard 时需同步 creative。`dsh-unrestricted` 0.3.0 的主机逻辑和六次真实工具调用已验证。其旧独立 RPC 状态入口在 alpha 返回 HTTP 405；[兼容补丁](../../scripts/patches/my43-unrestricted-alpha.patch) 将主机和客户端状态读取迁到共享 `/api/unrestricted/status`，浏览器显示已开启且无操作错误，插件测试验证状态随设置变化。它不修改注入文本。旧 `dsh-context` 不在验证 profile 中；sidebar、scheduled-tasks 外部插件未加入该隔离 profile，不能将核心通过理解为这些插件已经完成升级兼容测试。

## 配套插件兼容补丁

补丁对象为 my43 的 `dsh-unrestricted` 0.3.0 源码目录，包含 node 入口、客户端 controller 源码、重新构建的 client bundle/sourcemap 和状态测试。未来部署时先保留插件原目录副本，在新插件副本内执行 `git apply --unidiff-zero --check <本仓库绝对路径>/scripts/patches/my43-unrestricted-alpha.patch`，成功后再 `git apply --unidiff-zero <同一补丁路径>`；回退使用 `git apply --unidiff-zero --reverse`。只有校验成功才应用；其他版本不可盲套。已在本地原版副本上验证正向应用，修改后验证反向检查，并通过原有插件测试与新增状态测试。

不恢复旧 authority 参数，不新增 Caddy 放行路径，不输出密钥。共享 API 执行既有 Host、Origin、cookie 校验。当前补丁同时适配 controller 源码、重新构建的 client.js 与 sourcemap，防止重建后恢复旧接口。远端 Git 跟踪了 `src/client/controller.ts`，不可将本地审计副本缺少该文件理解为原项目没有源码。

2026-09-10 只读核验：远端插件仓库 `/home/ubuntu/workspace/agent/dsh-plugins/dsh-unrestricted` 干净，HEAD 为 `8c4204c`，版本 `0.3.0`；`49fc8d7` 引入按 preset 选择的 assistant 注入，后续提交调整内容与跨 provider 锚定。web profile 的依赖声明为 `file:/home/ubuntu/workspace/agent/dsh-plugins/dsh-unrestricted`，bundle 列表包含插件，插件自身 `cordis.patch.yml` 插入 unrestricted 节点。`/home/ubuntu/.dsh/profiles/web/node_modules/dsh-unrestricted` 是目录副本而非软链接；其 `src/node.js`、`src/rules.js`、`lib/client.js` 与源目录 SHA-256 一致。更新源码不等于更新安装副本；部署应使用单独打包并校验的插件产物，重新安装并检查实际加载路径与哈希。

## 历史日志边界

V0/V1/V2 读取器显式识别 my43 的 `request/injections` 事件，并通过当前校验器校验 payload；不改变其他未知事件的拒绝策略。读取保留旧 generation，首次写入创建 V3 generation。三个历史版本的集成测试同时验证恢复、再读和旧文件字节不变。

my43 日志只复制到忽略目录后离线审计：73 个会话中 68 个通过，其中全部 5 个注入会话通过，共读取 41040 个事件。另 4 个会话的旧 permission/preset 数据含不接受的 origin，1 个含不支持的 subagent/descriptor version 2。这 5 个不自动丢字段修复；后续部署须保留原 home 与旧运行版本作为恢复来源，逐案处理，不承诺全部旧历史无损可继续。

## Caddy 与 Authelia

生产实例监听 `127.0.0.1:3080`，外部域名 `zxh.tackd.net` 通过 `--trusted-host` 显式许可。Caddy 先调用 Authelia `/api/authz/forward-auth`，再代理到 DSH；保留 Host、Origin、Fetch Metadata，删除 Authorization。不要伪造 localhost Host 或清空 Origin。

Authelia 放行不等同于取得 DSH cookie。根入口的 DSH 401 跳转到 `/_dsh/bootstrap`，该路径同样受 Authelia 保护。systemd `ExecStartPost` 运行 `/usr/local/libexec/dsh-caddy-bootstrap $MAINPID $INVOCATION_ID`：按本次 invocation 和进程查找启动令牌，原子写入 `/run/dsh-browser-bootstrap/index.html`，权限 root:caddy 0640，页面跳转到 HTTPS 的令牌兑换地址。Caddy 对 bootstrap 与根响应禁止缓存；不要恢复把 bootstrap 静态页直接绑定 `/` 的旧方案。

alpha 的 loopback 启动 URL 格式兼容现有脚本，本地真实 CLI 测试证明 cookie 可跨进程重启复用。未来打包运行时必须确认 systemd MAINPID 对应实际输出启动 URL 的 Node 进程；保留同一 credentials 的 browser-session 记录和原 ExecStartPost。远端 Caddy validate 与服务状态均只读检查通过；未重启服务，也未模拟真实外部登录完成部署验收。

## 后续构建与部署边界

2026-09-10 实机核验：本机 macOS arm64，my43 为 Ubuntu 24.04.4 x86_64、glibc 2.39、Node 22.23.2。my43 物理内存约 3.6 GiB，已有 swap 占用。用户随后明确选择本地构建 DSH/vendor 与插件 tarball、上传后由 my43 安装外部依赖；不能直接复制 macOS 的 node_modules。安装使用 npm --ignore-scripts --legacy-peer-deps，禁止自动编译；Linux native-system 0.1.2 使用 registry 预编译包，带仓库既有补丁的 node-pty 仅携带 Linux x64 预编译文件。安装阶段通过独立 systemd unit 限制内存、swap 与 CPU，安装后须实测原生能力。

复用 `scripts/release/pack.ts` 的 dsh/vendor 产物边界及 `verify-packed-install.ts` 的独立消费目录思路，所有带补丁的 workspace 包必须来自同一提交，避免只安装 CLI tarball 却从 registry 解析到未打补丁的内部依赖。native/system 是另一发布序列；node-addon-system、node-pty、koffi、ripgrep 等平台产物必须匹配 Linux x64，不能将忽略生命周期脚本理解为依赖必然可运行，需逐项验证实际加载和工具执行。现有 packed-install 检查省略 optional dependencies 且只验证版本，不能代替完整 web、PTY、搜索、日志持久化和 sandbox 验证。`build-exe-for-python-sdk.ts` 对 Linux PTY 明确要求目标架构与构建主机匹配；不应承诺在 macOS 原生环境直接跨平台打出可用单文件。优先采用普通 Node 加完整运行目录，保留现有进程与插件加载方式。

生产 `dsh.service` 直接通过 `/usr/local/bin/node` 启动旧仓库 `apps/cli/lib/bin.js`，工作目录 `/home/ubuntu/workspace/zx-n`，DSH_HOME `/home/ubuntu/.dsh`，DSH_AGENTS_HOME `/home/ubuntu/.agents`。未来产物可置于 `/home/ubuntu` 下独立 releases 目录，通过 current 软链接选版本，ExecStart 直接指向产物中的 CLI。只调整必要的启动路径，保留端口 3080、trusted-host、用户、home、工作目录与安全限制；保留 `20-google-provider-ipv4.conf` 和 `30-caddy-bootstrap.conf`。后者以提升权限的 ExecStartPost 刷新引导页，但失败被忽略，不能仅凭 systemd active 判断登录链路正常；必须检查本次 invocation 的成功日志与实际 HTTPS 引导。

后续部署前先在独立 home/端口验证最终 Linux 产物和插件，再停服务对生产 home、profile 与配置做一致快照，切换产物后检查完整 Authelia → bootstrap → DSH cookie → API/流式响应链路。回滚需同时考虑运行版本、插件/profile 和会话数据快照；旧 generation 保留并不保证旧程序可读取升级后的 home，回滚快照会舍弃切换后新增数据，不能只承诺切回软链接即可无损降级。sidebar 与 scheduled-tasks 仍需兼容验证；旧 context 可按用户授权从目标 profile 移除。

本节记录部署设计约束；执行状态以当前任务文档为准。

## 本地验证入口

隔离 home 为仓库下 `.artifacts/my43-canary`，端口 `43805`，绑定 loopback；凭据文件权限 0600，目录 0700，只保存在 Git 忽略目录。该 home 的 web profile 只包含 base、web 与本地复制的 dsh-unrestricted；不复用用户默认 home。构建产物可用以下已执行入口启动：

```sh
DSH_HOME="$PWD/.artifacts/my43-canary" DSH_AGENTS_HOME="$PWD/.artifacts/my43-canary/agents" DSH_TELEMETRY_DISABLED=1 node apps/cli/lib/bin.js web --host 127.0.0.1 --port 43805 --trusted-host dsh-my43.test --no-open
```

应用构建与实际请求使用 Node 22.21.1。文档检查使用已有 Node 24.19.0，避开 Node 22.21.1 在既有 snapshot Markdown 路径上的 glob 扫描异常。真实请求选择 `deepseek-official/deepseek-v4-flash`，creative 连续六次只读文件工具调用成功并返回 `LOCAL_ALPHA_OK`。本地 HTTP 同时验证令牌兑换、可信 Host、cookie 和不可信 Origin 拒绝。

确定性回归由 session、agent-loop、token-meter、历史格式迁移测试、`snapshots/sdk/request-injections` 与 Python SDK fixture 承担。Python fixture 使用真实 SDK、独立临时 home 和本地 HTTP 模型桩；通过 `PYTHONPATH=python/sdk/src <含 pydantic 的 Python> scripts/fixtures/request-injections-python.py --node <Node 绝对路径>` 执行。禁止将真实会话、密钥、启动令牌或完整生产配置加入提交。

原始本地迁移与后续部署为独立验收阶段。用户已授权制品上传和服务切换，执行状态、产物与备份位置见当前任务文档；未推送 Git。

## 已部署入口与更新方式

生产通过 `/etc/systemd/system/dsh.service.d/40-local-release.conf` 覆盖 ExecStart，Node 直接启动 `/home/ubuntu/dsh-releases/current/node_modules/@deepseek-ai/dsh/lib/bin.js`，其余 unit 与原有两个 drop-in 保留。current 指向 `20260910-alpha2-1769db27`。外部插件装在 release 内，web profile 的三项依赖与实际 node_modules 链接一起指向该 release；下次升级要同步更新 profile，不能只切 current。生产 home、凭据、工作目录与端口不变，Caddy 配置未修改。

普通 registry 依赖由 release 内 package-lock.json 记录，本地内部包则由根 manifest overrides 固定到 tarball。再次安装保持 --ignore-scripts 与 --legacy-peer-deps，并运行原生能力、制品一致性、历史迁移、真实请求和认证检查；不要在 profile 内另装旧 @deepseek-ai 包覆盖运行时模块。

命令行 `/usr/local/bin/dsh` 同样链接到 current 内的 CLI，避免旧的全局 0.1.2-rc.1 再次操作新版 home。旧 npm 全局安装保留，原链接作为 dsh-global-link 保存在本次切换前备份目录，deployment-state.json 记录前后目标。完整回滚还须恢复该入口；不要通过 npm 全局安装官方版覆盖本地补丁入口。

浏览器 cookie 绑定 Host authority，包含端口；跨端口401不表示签名失效。真实 HTTP 验证自定义 Host 应使用 node:http 等能原样发送该头的客户端，不能假定 Node fetch 保留 Host 覆盖；同时区分请求 headers 与响应 headers。生产验收验证相同 authority 下旧 cookie 可复用、HTTPS Origin 与可信 Host 可访问 API，不可信 Origin 被拒绝。
