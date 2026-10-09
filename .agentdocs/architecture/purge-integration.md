# purge 集成与交付约束

## 维护范围

purge 唯一构建下载源为 SeanZ/dsh-purge，固定提交和 SHA-256，不配置原作者地址为备用源。主部署线固定 1.1.66 / 09bac57f2cfbf22dbc2e896063de161ac0e6b81d，归档摘要见 scripts/purge/lock.json。fork master 与 v1.1.66 标签已经回读一致。旧宿主的 compat/dsh-015rc2-tavern 继续保留，不随主线升级。

deploy/purge 在原分支历史上维护固定版本的 purge 集成、制品构建和脱敏验收。推送只到 origin/deploy/purge；upstream 只读取固定 tag。当前官方基线为 dsh-v0.2.1-alpha.2，packages、apps、vendor、native 必须与 scripts/purge/lock.json 选定的官方提交一致。禁止恢复私有 request/injections 核心实现或自有 creative 业务提示。

purge 原样提供业务内容与 UI，集成适配限于启动写入控制与官方版本的补丁匹配。autoApplyOnStart=false 时跳过启动、延迟自愈、客户端、备份恢复和桌面清理写入；autoUpdateOnStart=false 禁止自动更新。封存部署从 ALL_PATCHES 排除 OVERLAY_RESTORE_FROM_BAK：该规则在配置加载前恢复宿主文件，无法受插件启动开关控制，缺失 overlay 必须按官方行为报错。手动应用/更新仍属于独立运行时修改，不能据此继续声称制品未变化。

REWIND_DROP_SENT_ON_APPEND 同时适配官方条件清空的匹配串和替换串，保留 purge 的回退行为。COMPLETE_PROMPT_KEEP_INJECT 增加 alpha.2 的 required context 匹配，在保留 purge 和工作区说明的同时，保留官方对必需运行上下文的筛选。真实 SystemPrompt、CLI/SDK 和回退持久化测试覆盖这些语义。

所有规则及缺失/不适用状态由锁文件逐条固定，比较编号、名称、顺序和状态。1.1.66 的规则编号 77 替代旧版重复的 74。未安装的 Liangshen、unrestricted 与官方可选 Hooks 包按缺失记录；MINIMAL_OFFICIAL_TOOLSET 只撤销旧工具扩展，干净的官方 minimal 无需命中。不能为提升计数安装无关插件或恢复已退役的扩展。

1.1.66 默认注入来自磁盘 prompt-inject.md，缺文件或仍为插件管理的旧默认时同步当前内置默认；用户自定义内容保留。设置框提交会持久化到磁盘，跨进程重启后仍生效；无需通过点击保存激活默认内容。提示词文件属于用户 home 状态，不属于封存宿主载荷。撤回仍追加历史标记并过滤被撤回轮次，原始事件保留。

## 构建与本地验收

使用 Node 22.21.1 或支持 zstd 的更新版本、仓库声明的 pnpm。先 pnpm install --frozen-lockfile --ignore-scripts，再 pnpm run purge:build --out dist/purge-release。构建复用官方 build:official 与 release:pack，并打包真实消费者解析到的 pnpm 补丁依赖。源码闭包包括 CLI、SDK 和 Agent Team，禁止未发布的 DSH/vendor 包回落 npm registry。

purge 在系统临时目录的独立运行时应用，不能位于名字包含 deepseek-harness 的路径中；purge 的桌面识别会误判该路径。脚本先核验官方 tarball 安装字节，再检查所有补丁目标均位于隔离 runtime/home。通过后将变更覆盖回原始跨平台 tarball，而非重打包 macOS 安装后的可选依赖，以保留 Linux 原生载荷。目标机仅安装封存制品，不在目标机应用补丁。

purge:build 包含单元、压缩历史、CLI/SDK 业务与 Web profile 验收。测试使用合成身份、文本和回环模型端点；模拟请求验证标准工具、purge 内容、重启恢复、客户端加载和延迟启动后无文件漂移。build:official 已通过、核心输入未变且客户端构建记录的 DSH_CLIENT_COMMIT_HASH 匹配当前提交时才可使用 --skip-build；即使仅提交文档，提交戳变化后也需重新构建。失败现场保留在输出提示的临时目录，禁止自动发布失败产物。

新增 MJS 需逐个 node --check，并使用现有 Prettier 格式检查及 node --test；不新增测试框架。仓库文档与门禁改动仍需 doc-sync、lint 和相应 Vitest；推送保留原有 hook。

## 发布与验收范围

两条部署线使用本地脱敏验收、封包和 GitHub Release 交付。固定发布标签以 deploy-purge- 开头，完整封包、SHA256SUMS、manifest.json 和 validation.json 必须一起发布，发布后重新下载比较摘要。新的分支文档提交不意味着旧包由该提交重新构建，manifest 保留原构建提交。Tavern 线由 deploy/tavern-015rc2 独立维护，使用 deploy-tavern- 标签。

2026-10-09 用户明确要求主 DSH 与 purge 联合升级部署。该次任务必须完成 my43 的 Linux 原生、真实供应商、配置副本与历史兼容验收，并在一致备份后切换；Tavern 不在变更范围。仅做本地发布的后续任务不能复用这次授权升级生产。

## 上传与目标机验收

构建输出包含 manifest.json 和与其摘要绑定的 validation.json。执行 node scripts/purge/pack.mjs --dist dist/purge-release --out <新归档路径>，得到归档和 SHA-256 回执。上传后先核验整个归档摘要，再在新的 canary 目录解包。目标机执行 node scripts/purge/install.mjs --dist <解包目录>/dist --runtime <新运行时>，以及 node scripts/purge/test.mjs --dist <解包目录>/dist --runtime <新运行时>。

node scripts/purge/profile.mjs --runtime <新运行时> --home <新home> --previous <旧web-profile> 只读旧配置并生成新 profile，移除三个旧扩展，保留其它 bundle 与用户设置；已有目标 profile 拒绝覆盖。已部署的 creative 历史别名含旧 standard 的完整插件列表；升级须先核对旧列表与旧运行时 standard 一致，再同步为新 standard，保留 creative ID 和其它用户字段。未知自定义别名拒绝覆盖。凭据只能复制至权限受限的隔离 home，不进脚本参数、日志或提交。未来实际部署时，真实请求、旧会话副本、平台原生依赖和实际 HTTP 入口须按部署范围验收；未完成的目标机检查不得以本地验收代替。

隔离服务绑定新的 loopback 端口，设置 DSH_HOME、DSH_BASE、DSH_SURFACE=web 和独立 DSH_AGENTS_HOME。生产 current、home、systemd 服务和入口均不随上传自动切换。正式切换须由用户明确指定目标实例；本次 zxh 切换已获授权，当前路径见下节。

## 一次性旧历史迁移

旧私有格式记录归档在 legacy-request-injections.md。它不属于官方接受的格式基线；恢复官方核心后从活跃持久化声明中退出，不能为了保留私有类型而修改官方 writer 版本。

对于 V0–V4 原始压缩数据，使用 node scripts/purge/legacy-export.mjs --source <原件目录> --destination <新输出目录> --legacy-runtime <保留的旧运行时> --runtime <新运行时> --expected-unreadable <已核实数量> --receipt <回执路径>。旧读取器只操作原件副本；含旧注入的会话导出官方 V4 generation，旧注入逐条改为 ignorable 的 plugin:legacy-request-injections 审计事件，保持载荷、seq、time、事件数和继承切点。它们不再参与模型请求重建，不能声称与旧提示语义等价。原件和旧运行时必须保留用于回退。

导出前后校验全部物理会话均已列出、所有可读会话的事件与聊天消息等价、既有损坏数量不扩大、源文件哈希不变。未知 required 事件和损坏 payload 不自动吞掉。V3/V4 的无旧读取器转换另由 history.mjs 覆盖；旧格式须使用 legacy-export。历史 creative ID 仅生成为当前 standard 的完整兼容别名，不自带业务提示。

## zxh 正式部署与回退

2026-10-09 升级前，zxh.tackd.net 的 dsh.service 使用 /home/ubuntu/dsh-releases/20261007-release-purge-1，current 与 /usr/local/bin/dsh 指向该版本，生产 home 仍为 /home/ubuntu/.dsh、agents 为 /home/ubuntu/.agents，监听 127.0.0.1:3080。Caddy、Authelia、trusted-host 和启动后 bootstrap 机制保持原配置。正式 release 安装本地验收后的同一封存制品，不复制隔离测试会话。

切换前须再次确认无运行中会话、读取最新有效配置和默认模型。停服后复制非历史状态到新 home，并用上一正式运行时读取最新历史，导出及比较通过后才同时切换 home 和 current。105 个原会话均保留，100 个可恢复、5 个既有失败；本次不修复既有损坏。旧原件完整保留在 /home/ubuntu/dsh-backups/20261007-pre-purge-1160/original-home；对应旧运行时为 /home/ubuntu/dsh-releases/20261006-source-r2。

回退必须先停服务、保全升级后新 home，再恢复 original-home 和对应旧 release；不能只回切 current，也不能覆盖升级后的新增聊天。本次维护脚本与回执位于 /home/ubuntu/dsh-maintenance/20261007-purge-production。切换脚本初次检查失败时自动恢复旧状态，后续已产生正式新数据时须先评估数据差异再回退。

DSH 登录 Cookie 的名称和签名 audience 绑定 Host authority。验证 zxh 的可信 Origin 时必须用同一域名 Host 兑换 Cookie；不能把 127.0.0.1 的 Cookie 混用于 zxh。Node fetch 的 Host 处理也可能使代理腿测试失真，低层 HTTP 测试应显式保留 Host。服务端域名校验和匿名 Authelia 跳转均不能代替本人登录后的公网浏览器验收。

清理已移除 20261003-021alpha1、20261006-101516-pre-source-r2 备份和旧验收 canary，历史文档中的这些路径不再可回退。保留本节当前及上一版 release、最新原始 home、两版正式安装包与 dist、维护回执及 npm 缓存。后续清理必须重新核对现场引用，不能重放此次清单。验收后的用户新会话与模型选择作为新现场保留，不能用旧验收基线覆盖。
