# my43 alpha 升级

## 目标与边界

基于最新官方 alpha 迁移 my43 的持久化请求上下文注入能力，在本地独立 DSH_HOME 和端口验证后提交专用分支。最初阶段仅做本地验证；用户现已明确授权本地构建制品、上传并升级 my43，外部 Node 依赖允许在服务器安装。生产切换前必须通过隔离试运行并保留一致备份；仍不推送 Git。旧 dsh-context 插件可以移除，不需要兼容其 UI；需查明真正消费核心补丁的配套插件。禁止影响本地其他 DSH 实例或复用默认 home。

## 已核实基线

- 本地基线 `b2e3b2a0125854567a4a5fcba75782e42fe84901`，官方 `dsh-v0.1.5-alpha.2`；npm alpha 标签仍是 alpha.1，按官方最新 release 源码锁定。
- my43 源码 `f16899949cc87e090eddbb4ef6fa68663a9d58ee`，分支 `feature/request-message-injection`，版本 `0.1.2-rc.1`；基于 `76fda72979` 加 `eea3da9ac0` 和 `f16899949c` 两笔补丁。
- 专用本地分支 `feature/my43-alpha-request-injections`。
- my43 systemd 从源码构建目录启动 web，监听 `127.0.0.1:3080`，使用 `--trusted-host`；Caddy 先做 Authelia forward_auth，再保留 Host/Origin/Fetch Metadata 代理 DSH，并删除 Authorization。
- Caddy 对根页面 401 重定向到单独的 `/_dsh/bootstrap`，该页面用于取得 DSH 自己的浏览器认证 cookie，禁止缓存。需要检查生成机制与重启后令牌有效性。

## 分阶段计划

- [x] 阶段一：只读审计两笔补丁、插件消费者、相关 Codex 会话、运行配置和鉴权引导机制；建立保留/替代/退役清单。
- [x] 阶段二：按 alpha 当前请求组装与会话格式适配最小改动，补充旧日志迁移、注入位置、清空、重试/取消、token 统计测试及必要文档。
- [x] 阶段三：运行相关单元、真实 Loader/SDK 集成、记录回放、类型/lint/文档检查；独立 home/端口启动 Web，验证认证与模型请求。
- [x] 阶段四：检查 diff、清理本任务进程、确认无密钥和生产数据入库，提交专用分支并给出后续构建/部署边界。
- [x] 阶段五：本地打包 DSH/vendor 与适配插件，校验安装清单和哈希；服务器仅安装外部依赖，禁用安装脚本以避免源码编译。
- [x] 阶段六：my43 独立 release、home、端口完成原生依赖、Web、注入、历史会话与保留插件验证。
- [x] 阶段七：停服一致备份，切换产物与插件，验证 systemd、Caddy/Authelia 引导、cookie、API 与真实请求，失败回滚。
- [x] 阶段八：提交部署约束与可复用检查，清理本任务进程，交付制品与备份位置。
- [ ] 用户人工验收确认后归档任务文档。

## 验证设计

核心补丁保持模型可见内容可从持久日志重建，assistant 上下文不变成用户消息或普通聊天气泡；支持固定深度和最新 user 前锚定，不切断 tool-call/result。新版系统消息在历史中，必须保证注入不破坏 system 位置和请求缓存序列。旧日志含自定义 required event，需在 alpha 的 V0/V1/V2→V3 迁移路径验证可读，并保留原始 generation。仅在隔离副本上验证。

网络验证覆盖 loopback、trusted Host、未知 Origin、未认证入口、引导令牌换取 cookie、WebSocket/RPC 认证；真实 Caddy/Authelia 运行时配置只读，使用本地等价链路或现有源码测试验证，不把本地模拟视为远端部署成功。

## 当前状态

用户授权的远端部署已完成。当前线上使用 `/home/ubuntu/dsh-releases/20260910-alpha2-1769db27`，systemd 通过 current 软链接启动；切换前完整备份位于 `/home/ubuntu/dsh-backups/20260910-095810-pre-alpha2`。核心版本为 `0.1.5-alpha.2`，保留协议 v2 与适配后的自定义 dsh-unrestricted 0.3.0。

原始四阶段仅提交本地迁移代码；随后按用户授权执行制品安装和线上切换。保留用户人工验收项，不推送 Git。隔离 Web、SSH 转发和临时浏览器页已停止或关闭。

相关回归共 1832 项（64 文件基础回归 1831 项通过，追加的一项投影测试及其所在 20 项测试均通过）；TS SDK 快照回放、Python SDK 独立 home 集成、原插件及新增状态测试 10 项通过。完整构建、全量 lint 及后续改动的增量 lint、34 项 doc-sync 和 16 项 hygiene 均通过。真实 DeepSeek 连续六次工具调用成功；插件面板状态读取正常，状态 API 的匿名、合法 cookie、错误 Origin 分别为 401、200、403。Caddy 配置与线上匿名入口只读检查通过，生产状态未变更。

生产日志副本 73 个中 68 个可读，含全部 5 个注入会话；其余 5 个因既有旧格式约束拒绝，原件保留。凭据值与待提交文件比对通过，生产数据与凭据均在 Git 忽略目录。长期约束见 [架构与运行契约](../architecture/my43-request-injections.md)。Planning Tool 未在本会话提供，以此文档维护分阶段计划和 TODO 状态。

## 制品安装与线上验收

- 本地正式构建通过：265 个 DSH 包、9 个 vendor 包、自定义插件与仅携带 Linux x64 预编译文件的补丁版 node-pty，共 276 个制品。远端 SHA-256 全部一致，安装后逐文件核对 3623 个文件无差异。根 manifest 的 overrides 将所有本地包固定到对应 tarball。
- 服务器 npm 安装禁用生命周期脚本，由临时 systemd unit 限制内存、swap 与 CPU；成功完成，峰值内存 1018.8 MiB、swap 峰值 0。没有在 my43 执行源码构建。
- Linux x64/Node 22.23.2 上 flock、koffi、PTY、ripgrep 实测通过，Landlock 探测为 partial，不能描述为全部 ABI 能力完全生效。隔离端口43806，home 位于 `/home/ubuntu/dsh-canary/20260910-alpha2`；不复制生产 scheduled_tasks 数据，避免重复调度。
- 最终 Linux 制品重跑 zx-n、agent、apps 各3个会话的迁移、追加和重开，9/9通过，73个原 generation 字节不变。真实模型连续6次读取工具成功，返回 MY43_ALPHA_OK，持久日志含1条注入快照。插件状态面板显示已开启，浏览器无页面错误；定时任务页面正常且测试 store 为空。
- 首次验收脚本误将请求 headers 当作响应 headers，误判没有 Set-Cookie，自动回滚旧服务并保留失败 home。修正并独立复测认证后，第二次切换成功。不是产品认证缺陷，没有削弱 Host/Origin 或 cookie 校验；首次现场保留在 `/home/ubuntu/dsh-backups/20260910-095450-pre-alpha2`。
- 第二次切换后 MAINPID 1984765，systemd running、NRestarts=0，bootstrap 按该 PID 刷新。匿名根入口401、令牌兑换303、旧cookie200、可信Host/Origin API200、错误Origin403；列表73个会话，无运行中任务。公网浏览器跳转至 Authelia 登录页，没有现成用户登录态，未声称已代用户完成公网登录。
- 切换后与停服快照逐字节比较：73个旧会话文件、settings.yaml、credentials、scheduled_tasks.json 均未变；Caddy 配置未变。保留侧栏与定时任务插件，移除 web profile 的旧 dsh-context bundle/dependency；旧核心和插件源码仓库不改动。
- 命令行 dsh 原先仍为全局0.1.2-rc.1，现已备份原链接并同步指向 current 中的新 CLI；旧全局 npm 包保留。Web 与命令行均报告0.1.5-alpha.2。
- 证据位于本地 `.artifacts/my43-deploy` 和远端 release 的 artifacts.json、SHA256SUMS、installed-integrity.json、production-check.json、deployment-state.json。真实会话、凭据和带令牌日志不提交。回滚须协调 service drop-in、profile 和 home 快照，先保留新版新增数据，不保证旧程序可读新增 generation。
