# my43 请求注入与运行契约

## 补丁边界

当前维护目标为官方 `dsh-v0.1.7-rc.1`；生产切换状态以当前任务文档为准，保留最初迁入 alpha.2 的 `agentLoop.requestInjectionsVersion = 2` 与 `agent/request-injections` waterfall。声明是完整快照，空数组清空；生产者 key 必须唯一，只接受带插件来源的 assistant 文本。最新人类输入前锚定不会随连续工具调用漂移，depth 定位按完整工具交互计数，且不得越过开头的 system 消息。

`request/injections` 是 required 持久事件，不属于聊天历史节点。发送前记录、按日志重建；重试重新读取声明，准备阶段取消不提交用户输入或注入。稳定注入保持同一请求序列；快照改变时开始新请求序列，让 alpha 的系统消息策略与可能发生位置变化的请求一致；因此不能承诺跨请求前缀缓存连续性。token-meter 将注入计入请求占用，单独保留历史节点计量；声明变化使旧 usage 锚点失效。

`creative` 使用当前 standard 的完整组合，独立标识用于外部插件选择，不自行提供注入文本。两者解析后相等由测试锁定。alpha 不提供 preset 继承，因此维护 standard 时需同步 creative。`dsh-unrestricted` 0.3.0 的主机逻辑和六次真实工具调用已验证。其旧独立 RPC 状态入口在 alpha 返回 HTTP 405；[兼容补丁](../../scripts/patches/my43-unrestricted-alpha.patch) 将主机和客户端状态读取迁到共享 `/api/unrestricted/status`，浏览器显示已开启且无操作错误，插件测试验证状态随设置变化。它不修改注入文本。首次核心隔离验证未包含旧 `dsh-context`、sidebar 与 scheduled-tasks；后续完整插件验收与当前安装状态见下文。旧 context 已按授权移除。

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

alpha 的 loopback 启动 URL 格式兼容现有脚本，本地真实 CLI 测试证明 cookie 可跨进程重启复用。未来打包运行时必须确认 systemd MAINPID 对应实际输出启动 URL 的 Node 进程；保留同一 credentials 的 browser-session 记录和原 ExecStartPost。初次迁移审计阶段只读检查了远端 Caddy validate 与服务状态；后续生产切换另外验证本次启动引导、cookie 和公网认证边界，不将匿名跳转检查称为真实用户完整登录验收。

## 后续构建与部署边界

2026-09-10 实机核验：本机 macOS arm64，my43 为 Ubuntu 24.04.4 x86_64、glibc 2.39、Node 22.23.2。my43 物理内存约 3.6 GiB，已有 swap 占用。用户随后明确选择本地构建 DSH/vendor 与插件 tarball、上传后由 my43 安装外部依赖；不能直接复制 macOS 的 node_modules。安装使用 npm --ignore-scripts --legacy-peer-deps，禁止自动编译；Linux native-system 0.1.2 使用 registry 预编译包，带仓库既有补丁的 node-pty 仅携带 Linux x64 预编译文件。安装阶段通过独立 systemd unit 限制内存、swap 与 CPU，安装后须实测原生能力。

复用 `scripts/release/pack.ts` 的 dsh/vendor 产物边界及 `verify-packed-install.ts` 的独立消费目录思路，所有带补丁的 workspace 包必须来自同一提交，避免只安装 CLI tarball 却从 registry 解析到未打补丁的内部依赖。native/system 是另一发布序列；node-addon-system、node-pty、koffi、ripgrep 等平台产物必须匹配 Linux x64，不能将忽略生命周期脚本理解为依赖必然可运行，需逐项验证实际加载和工具执行。现有 packed-install 检查省略 optional dependencies 且只验证版本，不能代替完整 web、PTY、搜索、日志持久化和 sandbox 验证。`build-exe-for-python-sdk.ts` 对 Linux PTY 明确要求目标架构与构建主机匹配；不应承诺在 macOS 原生环境直接跨平台打出可用单文件。优先采用普通 Node 加完整运行目录，保留现有进程与插件加载方式。

首次部署前，生产 `dsh.service` 直接通过 `/usr/local/bin/node` 启动旧仓库 `apps/cli/lib/bin.js`，工作目录 `/home/ubuntu/workspace/zx-n`，DSH_HOME `/home/ubuntu/.dsh`，DSH_AGENTS_HOME `/home/ubuntu/.agents`。未来产物可置于 `/home/ubuntu` 下独立 releases 目录，通过 current 软链接选版本，ExecStart 直接指向产物中的 CLI。只调整必要的启动路径，保留端口 3080、trusted-host、用户、home、工作目录与安全限制；保留 `20-google-provider-ipv4.conf` 和 `30-caddy-bootstrap.conf`。后者以提升权限的 ExecStartPost 刷新引导页，但失败被忽略，不能仅凭 systemd active 判断登录链路正常；必须检查本次 invocation 的成功日志与实际 HTTPS 引导。

后续部署前先在独立 home/端口验证最终 Linux 产物和插件，再停服务对生产 home、profile 与配置做一致快照，切换产物后检查完整 Authelia → bootstrap → DSH cookie → API/流式响应链路。回滚需同时考虑运行版本、插件/profile 和会话数据快照；旧 generation 保留并不保证旧程序可读取升级后的 home，回滚快照会舍弃切换后新增数据，不能只承诺切回软链接即可无损降级。完整 profile 应覆盖当前启用的插件；Context、Better Sidebar 和定时任务插件已按用户授权移除，不再为定时任务维护兼容补丁。

本节记录部署设计约束；执行状态以当前任务文档为准。

## 本地验证入口

隔离 home 为仓库下 `.artifacts/my43-canary`，端口 `43805`，绑定 loopback；凭据文件权限 0600，目录 0700，只保存在 Git 忽略目录。该 home 的 web profile 只包含 base、web 与本地复制的 dsh-unrestricted；不复用用户默认 home。构建产物可用以下已执行入口启动：

```sh
DSH_HOME="$PWD/.artifacts/my43-canary" DSH_AGENTS_HOME="$PWD/.artifacts/my43-canary/agents" DSH_TELEMETRY_DISABLED=1 node apps/cli/lib/bin.js web --host 127.0.0.1 --port 43805 --trusted-host dsh-my43.test --no-open
```

应用构建与实际请求使用 Node 22.21.1。文档检查使用已有 Node 24.19.0，避开 Node 22.21.1 在既有 snapshot Markdown 路径上的 glob 扫描异常。真实请求选择 `deepseek-official/deepseek-v4-flash`，creative 连续六次只读文件工具调用成功并返回 `LOCAL_ALPHA_OK`。本地 HTTP 同时验证令牌兑换、可信 Host、cookie 和不可信 Origin 拒绝。

确定性回归由 session、agent-loop、token-meter、历史格式迁移测试、`snapshots/sdk/request-injections` 与 Python SDK fixture 承担。Python fixture 使用真实 SDK、独立临时 home 和本地 HTTP 模型桩；通过 `PYTHONPATH=python/sdk/src <含 pydantic 的 Python> scripts/fixtures/request-injections-python.py --node <Node 绝对路径>` 执行。禁止将真实会话、密钥、启动令牌或完整生产配置加入提交。

原始本地迁移与后续部署为独立验收阶段。用户已授权制品上传、服务切换及 dev 的 commit/push，执行状态、产物与备份位置见当前任务文档。

## 已部署入口与更新方式

生产通过 `/etc/systemd/system/dsh.service.d/40-local-release.conf` 覆盖 ExecStart，Node 直接启动 `/home/ubuntu/dsh-releases/current/node_modules/@deepseek-ai/dsh/lib/bin.js`，其余 unit 与原有两个 drop-in 保留。current 指向 `20260923-017rc1`，核心为 patched `0.1.7-rc.1`，制品提交 `ed8f9953187e5b50c27af818337df26214911caa`。外部插件保留 `dsh-unrestricted@0.3.0+my43.017a1`，官方Agent Team使用合并后的agent-team-profile，profile清单中的自定义依赖和unrestricted安装链接指向该release，DSH内置包由当前安装的运行时解析表提供；下次升级要同步更新profile，不能只切current。生产 home、凭据、工作目录与端口不变，Caddy 配置未修改。

普通 registry 依赖由 release 内 package-lock.json 记录，本地内部包则由根 manifest overrides 固定到 tarball。再次安装保持 --ignore-scripts 与 --legacy-peer-deps，并运行原生能力、制品一致性、历史迁移、真实请求和认证检查；不要在 profile 内另装旧 @deepseek-ai 包覆盖运行时模块。

命令行 `/usr/local/bin/dsh` 同样链接到 current 内的 CLI，避免旧的全局 0.1.2-rc.1 再次操作新版 home。旧 npm 全局安装保留，原链接作为 dsh-global-link 保存在本次切换前备份目录，deployment-state.json 记录前后目标。完整回滚还须恢复该入口；不要通过 npm 全局安装官方版覆盖本地补丁入口。

浏览器 cookie 绑定 Host authority，包含端口；跨端口401不表示签名失效。真实 HTTP 验证自定义 Host 应使用 node:http 等能原样发送该头的客户端，不能假定 Node fetch 保留 Host 覆盖；同时区分请求 headers 与响应 headers。生产验收验证相同 authority 下旧 cookie 可复用、HTTPS Origin 与可信 Host 可访问 API，不可信 Origin 被拒绝。

## 已停用的 Better Sidebar 兼容补丁

DSH alpha.2、rc.1 与 rc.2 已验证搭配 `dsh-better-sidebar@0.19.0-alpha.1`，不要使用面向旧核心的 npm latest 0.18.x。该版本移除插件自绘右栏，将文件、终端等页面注册进官方右栏，并保留底部工作台。旧右栏布局不能承诺原样迁移；官方右栏标签刷新后的恢复能力也不等同于插件的 PTY 断线重连。

停用前制品为 `0.19.0-alpha.1+my43.1`，补丁位于 `scripts/patches/my43-sidebar-alpha-download.patch`，同时包含 Host TypeScript 与发布 JS 的最小修改。官方交付文件可能携带相对路径，媒体/下载路由需先相对会话权威 cwd 解析，再执行原有 realpath 和工作区边界校验；不能改用浏览器传入的 cwd 覆盖会话目录。原版直接下载这种文件会返回 400。应用补丁后需单独将 package.json 版本设为上述构建标记再打包；重建 Host 时源码补丁仍有效。

回归入口 `scripts/fixtures/my43-sidebar-download.mjs` 使用 Node 内置测试，参数依次为隔离实例启动日志、包含 sessionId 的 JSON 文件和工作区绝对路径。它只连接 loopback，独立创建并清理测试文件，验证相对/绝对路径、中文下载文件名、完整二进制字节、目录穿越、软链接越界与错误 Origin。终端另外验证真实输出、断连后的转录回放和 shell 变量保留。

插件媒体路由自身按可信 Host/Origin 放行 loopback，请勿将它等同于核心 API cookie 鉴权。公网 `/sidebar/file` 和终端 WebSocket 继续经过既有 Caddy/Authelia；上线检查匿名媒体 URL 跳转登录页，不新增放行路径。升级备份在 `/home/ubuntu/dsh-backups/20260910-110047-pre-sidebar019`，包含一致 home 和原 profile；旧 release 保留。通常回退同时恢复 current 和 profile 链接，完整 home 快照仅在明确评估切换后新增数据后恢复。

## rc.1 发布与模型配置约束

发布制品必须在提交后执行 `pnpm run build:official`，再用 `pnpm run release:pack --family dsh --out <目录> --concurrency 4` 打包；普通 build 的开发标识或过期提交会被发布检查拒绝。不能改成 `pnpm exec tsx scripts/release/pack.ts`，其缺少 pack 子进程需要的 npm_execpath。内部包统一来自该提交，未变化的 vendor、原生包和外部插件可保留现有锁定安装；安装后校验 tarball 哈希、实际包文件及保留插件字节。远端 npm 安装禁用脚本并限制内存，不执行源码构建。

rc.1 新增默认模型 `deepseek-flash`，支持图片和历史内系统消息更新。线上 settings 显式模型列表会覆盖内置目录，显式 `agent-default-model` 也不会因程序升级而切换。rc.1 部署当时保留线上 `deepseek-v4.1-flash-expires-on-0910` 和完整 settings；旧实验模型与新正式模型在升级时均能请求，不代表实验模型名称中的到期日之后仍受服务商保证。若用户选择正式模型，应在保留其它条目的同时加入官方模型参数，并单独更新默认项，禁止整体覆盖其它 provider 或历史会话模型选择。

rc.1 切换前备份位于 `/home/ubuntu/dsh-backups/20260910-142508-pre-rc1`，前一 release 为 `20260910-alpha2-sidebar019`。本次没有新会话格式；两个版本具有相同 V3 与注入补丁。仍须先保留切换后新增数据再评估回退，不以格式相同替代备份。验收证据位于 `.artifacts/my43-rc1` 与远端 release 的 `rc1-*.json`；带凭据的 home、cookie 和启动日志不入库。

## rc.2 标签选择与运行恢复边界

2026-09-11 升级选择官方标签 `dsh-v0.1.5-rc.2` / `fb2c4b9e698e30edb738bca4cf0618587db7d203`。fork master 当时已包含标签外开发提交，即使 package.json 同为 rc.2 也不可等同正式发布。rc.2 标签仅回移评分弹窗、文件卡片与图标改动，核心注入、会话格式与鉴权源码未改；20个自用源码补丁与rc.1基线下的补丁完全一致。

线上当前默认模型由用户改为 `deepseek-official/deepseek-v4-pro`、`low`，本次完整保留 settings 和 credentials。隔离真实请求按当前配置测六次工具调用与注入快照，不以昨天的实验模型配置覆盖今天的生产设置。三个外部插件及 node-pty 保持上一 release 的字节；265个内部包3733文件与本地正式打包产物一致，远端仅安装依赖。

历史验证分两组：原9条旧格式样本的首次写入迁移和重开；当前生产会话快照中三个工作区各取3条近期会话进行读写回放。后者87个源文件保持不变；扫描仍明确报告原有5条不兼容日志，不删除未知字段绕过校验。证据保存在忽略目录 `.artifacts/my43-rc2` 和远端隔离 home `/home/ubuntu/dsh-canary/20260911-rc2`。

会话恢复可能正常追加空 payload 的 `session/end-seed`；`Session` 构造器在恢复日志末尾不是该事件时写入，rc.1/rc.2 的逻辑相同。因此服务重启后的全文件哈希变化不必然表示旧历史被改写，必须保留快照并逐项核对原始压缩字节前缀、解压后的完整旧事件及新事件类型；不得无条件放行追加。Node 22的zstdDecompressSync在此次实际拼接文件上只解出首帧，因此不能用全文件同步解码的相等结果证明没有追加事件；先验证原压缩字节前缀，再独立解码新增帧，或使用覆盖所有帧的流式解码。本次首次切换因该标记触发严格校验并自动回退，确认只有一条正常标记后保留数据，再次切换通过原严格校验（89个数据文件不变）。恢复相关83项既有测试通过。

rc.2 的一致备份 `/home/ubuntu/dsh-backups/20260911-012012-pre-rc2`，首次回退备份 `/home/ubuntu/dsh-backups/20260911-011756-pre-rc2`，旧 release `20260910-rc1-2c122992` 保留。服务配置、Caddy 与启动脚本哈希不变；web profile 三项依赖和链接均指向新 release。公网检查用 `Accept: text/html` 验证四个入口302至 `auth.zxh.tackd.net`；无HTML Accept的请求可能返回401并带登录Location，这是Authelia的内容协商，不应误判成浏览器认证故障。完整用户登录体验仍由页面人工验收确认。


## 0.1.6-alpha.1 维护边界

本次按用户选择从 web profile 卸载 Better Sidebar，原生文件预览和多终端接管；不删除旧release、补丁源码和历史设置。当前完整回退快照位于 `/home/ubuntu/dsh-backups/20260915-205844-pre-prompt-fix`，上一release为 `20260915-alpha1`；首次alpha.1快照20260915-181822-pre-alpha1和rc.2 release仍保留。切换即时校验91个数据文件哈希未变；稍后反馈会话恢复追加1条空载荷session/end-seed，其旧压缩字节、全文和事件前缀均保持不变。Caddy、systemd及bootstrap脚本哈希不变，旧cookie可用，可信Origin通过，不可信Origin403；公网入口继续由Authelia保护。完整用户登录需用户页面验收，自动检查不替代密码/MFA登录。

creative 与本标签 standard 的agent-plane保持一致，使用workflow-ptc，默认禁用Ralph；独立标识供unrestricted选择，不影响standard或默认排除的子Agent。请求循环以surface.contentGeneration判断图片投影变化，注入存在时禁用历史内系统更新，将提示词归一化到头部；稳定注入延续同一请求段，不能因非空就每步记录series，否则Chat会重复展示系统提示卡片。注入快照实际切换仍开启新请求段；既有同步历史恢复调用暂留逐行弃用说明，新增功能不得照抄同步历史扫描。Session观察器分发抽离时保留collectSessionCallbacks在原文件，事件目录语义扫描才可识别生产方。

DeepSeek默认协议为Messages，V4 Pro / Low在本地和Linux完整组合中均完成六次连续工具调用。web profile显式设置session-log-deepseek.enabled=false，避免新版默认开启自动会话日志上传；不改线上模型列表、凭据和访问模式。普通历史内消息注入仍不能替代request/injections。新增持久类型历史登记仅记录分支已有事件，不修改载荷或格式版本；保留旧未知字段日志的拒绝边界。

首次alpha.1升级包含vendor源码变化，必须与285个DSH包一起本地重建打包；不能复用rc.2的vendor tarball。后续局部修复可沿用未变的alpha.1 vendor制品。9个vendor、两个原生/插件tarball合计296包，Linux安装后4447文件逐字节核验。依赖锁文件保存在release内，npm不运行生命周期脚本；native-system继续使用Linux x64 0.1.2预编译，node-pty与unrestricted保留原发布包字节。首次alpha.1安装内存峰值484.9MiB，无swap。

完整测试使用已有Node24、Python3.12和Homebrew Git；系统Python3.9与旧Apple Git不满足新实验测试及禁止Git懒加载的验证。原生N-API构建用带headers的Node22，普通CLI和Linux运行也验证Node22。合并删除包后将无package.json的旧lib/node_modules目录移到忽略目录，避免全构建扫描误读旧文件。doc-sync会重建Host产物，须等待完成后再跑built-artifact测试。

profile及共享profiles/node_modules由上游healProfilesModuleFallback在启动时修复；选用插件减少后会清除profile内对应受管fallback链接，但共享目录中上游已删除包的旧链接可能保留。首次alpha.1升级时核对目标包已不存在、链接确实指向上一release后，将code-runtime、code-runtime-worker-thread和workflow-worker-thread三个共享链接移入20260915-181822-pre-alpha1备份的retired-shared-links目录。部署仍必须核对所有解析后的链接，不能只看package.json或current。用户规定的.agentdocs需要保留部署提交标识，因此引用检查对此目录允许提交引用，普通文档和禁用组织链接检查保持原规则。

## 0.1.6-alpha.2 插件适配

`my43-unrestricted-alpha2.patch` 以当前线上已打共享API补丁的0.3.0安装副本为基线，迁移设置卡片到 `plugins.bundle.config`、key为 `dsh-unrestricted`，版本标记0.3.0+my43.alpha2。不改变注入文本、主机注入协议和路由。该补丁不可直接套到最初的原版0.3.0；先应用旧alpha补丁，或使用已核验的线上安装副本。应用前执行git apply --unidiff-zero --check，部署前重新核对制品哈希。

新补丁包括客户端源码、bundle/map与Node测试；测试直接加载交付JS，覆盖新插槽、默认展开、状态读写和卸载后的迟到请求。配置写入后立即刷新状态，移除固定延迟；样式和订阅由插件生命周期回收。旧bundle作为负对照因旧插槽失败。插件必须在与目标DSH一致的类型声明下构建和检查，不发布本地路径tsconfig或node_modules。

alpha2的standard新增默认关闭的tool-plugin-manager声明，creative必须同步但保持disabled:true。官方Creator/cordis并非自用creative，不能套用其默认安装权限。alpha2 runtime依赖解析及HMR需要实际组合验收，不将目录软链接存在等同加载成功。


## alpha2 插件选择与 Linux 资源边界

用户明确不再使用 `@opendsh/dsh-plugin-scheduled-tasks`，因此从生产 web profile、release 依赖和锁文件卸载，并删除本分支新增的 alpha2 兼容补丁。后续制品不携带该插件，不能在升级时按旧 profile 自动装回。原存储 `/home/ubuntu/.dsh/storages/scheduled_tasks.json` 保留且哈希不变；卸载前 profile、依赖清单和已安装包备份在 `/home/ubuntu/dsh-backups/20260917-185718-remove-scheduled`。DSH 内置 schedule 能力不属于这次外部插件卸载范围。

本轮 Linux 全安装直接 npm install 两次触及1.2GiB硬上限；中断残留目录又导致 ENOTEMPTY。有效流程是保留旧失败目录、先 `npm install --package-lock-only --prefer-offline --ignore-scripts --legacy-peer-deps`，再 `npm ci --prefer-offline --ignore-scripts --legacy-peer-deps`。隔离 unit 最终采用 MemoryHigh=1500M、MemoryMax=1800M、MemorySwapMax=256M、CPUQuota=150%，NODE_OPTIONS=--max-old-space-size=384、npm_config_maxsockets=2。全安装752包，约1.4GiB内存峰值和256MiB swap；锁文件留在release。不能把这些安装峰值当成DSH日常运行占用，也不应在受限服务器源码构建。

Linux Office WASM 小文档转换约5秒，转换后RSS约740MiB，进程峰值约1.3GiB，因此my43 profile使用 `office-to-pdf.config.maxConcurrentConversions: 1`。只看PDF签名和文字提取不足以验收中文：机器原来没有中文字体，PDF可以提取中文但画面空缺。安装 `fonts-noto-cjk` 与 `fontconfig`，重建转换器后中文实际渲染通过。字体为系统运行依赖，不打包macOS引擎。

## 0.1.7-alpha.1 迁移契约

V4的工具结果是独立tool角色，按消息层toolCallId匹配，不能再按旧内容块计数。request/injections仍为required声明快照，并加入V3相邻迁移白名单；声明载荷保持原plugin来源，物化时转为RequestInjectionMessage，属于RequestMessage而不属于持久Message。两种模型适配器均把它作为外部assistant历史，不能伪装成带重放状态的模型输出。

creative的bundle patch必须同时列入package.json的files，发布验收直接检查tar成员；源码可加载不代表安装包完整。同版本重新打包时，tarball文件名加入构建提交号；移走旧node_modules与lock后生成新lock，安装后逐文件比对，避免npm沿用旧文件依赖integrity。

creative由packages/bundle/web-app/presets/creative.patch.yml注册；每次升级对比standard的完整plugins配置，保持id不变。unrestricted升级补丁my43-unrestricted-017a1.patch以线上alpha2安装副本为基线，迁移为Config volatile字段与客户端configForms接口。部署前须完成插件适配，再允许旧settings.yaml自动导入；先将agent-presets.default转换为agent-preset-registry.selectedDefault，避免旧section无法匹配新entry。逐项比较导入值，保留原默认模型及凭据。旧agent-team-web-profile退出bundles，新的agent-team-profile同时提供Host与Web。

settings首次导入在loader.await后异步进行，网页端口与bootstrap就绪不代表迁移完成；实机新副本曾在端口开放约4.8秒后才完成6个section。启动验收必须有界轮询settings/describe逐项比对原值，并验证unrestricted/status后才判定就绪；不能仅检查settings.yaml.imported存在，该文件在第一项写入前就已生成。默认日志级别下也没有完成info日志，不能靠等待该日志作为就绪条件。

V4升级失败后须停服保全新home，再恢复一致的旧home/profile和旧release。不可只切current软链接而让alpha2读取V4或已迁移的profile；切换后的用户新增数据必须保留供人工决策。发布备份、制品标识及实际验收见当前任务文档。

0.1.7的模块解析改为运行时拦截，不再以旧healProfilesModuleFallback复制链接作为就绪依据。生产共享profiles/node_modules保留490个旧release链接；新版对于解析表内包会覆盖这个物理层，内置包的profile链接也可能被移除。上游profile-resolution的两个“uses the installation DSH package ... while a stale shared link remains”测试验证Host与插件的CJS/ESM实际选择当前安装，专项重跑2项通过。不能仅见旧共享链接就判断正在混用旧代码，也不要无范围地清理历史共享目录；需核对当前runtime解析、自定义插件安装副本和实际组合行为。

## 017rc1部署约束

LibreOffice kit与WASM均固定0.1.0，Linux仍使用WASM。发布产物要包含CLI及完整依赖闭包；普通Node启动时Office skill自动解析当前Node和CLI绝对路径。服务器的腾讯npm镜像可能滞后，发布安装按进程指定官方registry，不修改全局配置。Office继续并发1，完整Web转换实测unit峰值约1.65GiB；隔离测试MemoryHigh不能低于转换峰值，1.2GiB软限制会使预览超时，已验证1.8GiB软限制/2.2GiB硬限制组合可用。生产unit保持既有配置。

Team状态改由session/projections的agentTeam字段及follow共享投影提供，旧agentTeams/view已删除，验收脚本必须跟随此接口。插件加载前检查显式DSH peerDependencies；当前unrestricted没有声明该范围，不需要豁免。工作详情未显式配置时默认从compact改为standard；必须区别默认变化与用户显式值丢失。

## 017rc2 配置与请求更新

DeepSeek API key运行插件从`@deepseek-ai/dsh-llm-deepseek`拆分为`@deepseek-ai/dsh-llm-deepseek-api-key`，profile补丁若同时指定id和旧name会导致模型配置覆盖失配。迁移时只替换name，保留`llm-deepseek`的id和完整models列表，逐项比较settings/describe。原modeSelectionEnabled删除，由ui-settings代码工作工具开关控制；该字段可以从比较基线移除，其余设置不放宽。

新动态工具更新必须和请求注入同时验证：工具增加/移除时，原生toolUpdate与降级重建请求都要保留单一system、plugin assistant注入位置、toolHistory与请求系列边界。以动态工具三轮请求回归及真实六步调用验证，不以无冲突合并作为兼容证据。Linux Office kit/WASM均更新到0.1.1，仍需独立验收CLI与Web预览，不能复用rc1转换结果。
