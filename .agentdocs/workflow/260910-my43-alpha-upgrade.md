# my43 alpha 升级

## 目标与边界

基于最新官方 alpha 迁移 my43 的持久化请求上下文注入能力，在本地独立 DSH_HOME 和端口验证后提交专用分支。my43 全程只读，本轮不打包、不推送、不部署。旧 dsh-context 插件可以移除，不需要兼容其 UI；需查明真正消费核心补丁的配套插件。禁止影响本地其他 DSH 实例或复用默认 home。

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
- [ ] 用户人工验收确认后归档任务文档。

## 验证设计

核心补丁保持模型可见内容可从持久日志重建，assistant 上下文不变成用户消息或普通聊天气泡；支持固定深度和最新 user 前锚定，不切断 tool-call/result。新版系统消息在历史中，必须保证注入不破坏 system 位置和请求缓存序列。旧日志含自定义 required event，需在 alpha 的 V0/V1/V2→V3 迁移路径验证可读，并保留原始 generation。仅在隔离副本上验证。

网络验证覆盖 loopback、trusted Host、未知 Origin、未认证入口、引导令牌换取 cookie、WebSocket/RPC 认证；真实 Caddy/Authelia 运行时配置只读，使用本地等价链路或现有源码测试验证，不把本地模拟视为远端部署成功。

## 当前状态

四个实施阶段完成，保留用户人工验收项。专用分支提交包含核心迁移、确定性快照、历史迁移测试及配套插件兼容补丁；本轮未打包、推送或部署。隔离 Web 进程已停止。

相关回归共 1832 项（64 文件基础回归 1831 项通过，追加的一项投影测试及其所在 20 项测试均通过）；TS SDK 快照回放、Python SDK 独立 home 集成、原插件及新增状态测试 10 项通过。完整构建、全量 lint 及后续改动的增量 lint、34 项 doc-sync 和 16 项 hygiene 均通过。真实 DeepSeek 连续六次工具调用成功；插件面板状态读取正常，状态 API 的匿名、合法 cookie、错误 Origin 分别为 401、200、403。Caddy 配置与线上匿名入口只读检查通过，生产状态未变更。

生产日志副本 73 个中 68 个可读，含全部 5 个注入会话；其余 5 个因既有旧格式约束拒绝，原件保留。凭据值与待提交文件比对通过，生产数据与凭据均在 Git 忽略目录。长期约束见 [架构与运行契约](../architecture/my43-request-injections.md)。Planning Tool 未在本会话提供，以此文档维护分阶段计划和 TODO 状态。
