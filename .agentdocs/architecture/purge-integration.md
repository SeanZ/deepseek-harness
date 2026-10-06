# purge 集成与交付约束

## 维护范围

dev 在原分支历史上维护固定版本的 purge 集成、制品构建和脱敏验收。推送只到 origin/dev；upstream 只读取固定 tag。packages、apps、vendor、native 必须与 scripts/purge/lock.json 选定的官方提交一致。禁止恢复私有 request/injections 核心实现或自有 creative 业务提示。

purge 原样提供业务内容与 UI，仅有启动行为适配：autoApplyOnStart=false 时跳过启动、延迟自愈、客户端和桌面清理写入；autoUpdateOnStart=false 禁止自动更新。手动应用/更新属于独立运行时修改，不能据此继续声称制品未变化。所有规则及缺失/不适用状态由锁文件逐条固定，升级必须审查变更后重新验收。

## 构建与本地验收

使用 Node 22.21.1 或支持 zstd 的更新版本、仓库声明的 pnpm。先 pnpm install --frozen-lockfile --ignore-scripts，再 pnpm run purge:build --out dist/purge-release。构建复用官方 build:official 与 release:pack，并打包真实消费者解析到的 pnpm 补丁依赖。源码闭包包括 CLI、SDK 和 Agent Team，禁止未发布的 DSH/vendor 包回落 npm registry。

purge 在系统临时目录的独立运行时应用，不能位于名字包含 deepseek-harness 的路径中；purge 的桌面识别会误判该路径。脚本先核验官方 tarball 安装字节，再检查所有补丁目标均位于隔离 runtime/home。通过后将变更覆盖回原始跨平台 tarball，而非重打包 macOS 安装后的可选依赖，以保留 Linux 原生载荷。目标机仅安装封存制品，不在目标机应用补丁。

purge:build 包含单元、压缩历史、CLI/SDK 业务与 Web profile 验收。测试使用合成身份、文本和回环模型端点；模拟请求验证标准工具、purge 内容、重启恢复、客户端加载和延迟启动后无文件漂移。build:official 已通过且核心输入未变时才可使用 --skip-build。失败现场保留在输出提示的临时目录，禁止自动发布失败产物。

新增 MJS 需逐个 node --check，并使用现有 Prettier 格式检查及 node --test；不新增测试框架。仓库文档与门禁改动仍需 doc-sync、lint 和相应 Vitest；推送保留原有 hook。

## 上传与目标机验收

构建输出包含 manifest.json 和与其摘要绑定的 validation.json。执行 node scripts/purge/pack.mjs --dist dist/purge-release --out <新归档路径>，得到归档和 SHA-256 回执。上传后先核验整个归档摘要，再在新的 canary 目录解包。目标机执行 node scripts/purge/install.mjs --dist <解包目录>/dist --runtime <新运行时>，以及 node scripts/purge/test.mjs --dist <解包目录>/dist --runtime <新运行时>。

node scripts/purge/profile.mjs --runtime <新运行时> --home <新home> --previous <旧web-profile> 只读旧配置并生成新 profile，移除三个旧扩展，保留其它 bundle 与用户设置；已有目标 profile 拒绝覆盖。凭据只能复制至权限受限的隔离 home，不进脚本参数、日志或提交。真实请求、旧会话副本、平台原生依赖和实际 HTTP 入口仍须在 my43 验收；脱敏本地测试不能替代它们。

隔离服务绑定新的 loopback 端口，设置 DSH_HOME、DSH_BASE、DSH_SURFACE=web 和独立 DSH_AGENTS_HOME。生产 current、home、systemd 服务和入口均不随上传自动切换。现阶段任务是运行验收，正式切换另行明确。

## 一次性旧历史迁移

旧私有格式记录归档在 legacy-request-injections.md。它不属于官方接受的格式基线；恢复官方核心后从活跃持久化声明中退出，不能为了保留私有类型而修改官方 writer 版本。

对于 V0–V4 原始压缩数据，使用 node scripts/purge/legacy-export.mjs --source <原件目录> --destination <新输出目录> --legacy-runtime <保留的旧运行时> --runtime <新运行时> --expected-unreadable <已核实数量> --receipt <回执路径>。旧读取器只操作原件副本；含旧注入的会话导出官方 V4 generation，旧注入逐条改为 ignorable 的 plugin:legacy-request-injections 审计事件，保持载荷、seq、time、事件数和继承切点。它们不再参与模型请求重建，不能声称与旧提示语义等价。原件和旧运行时必须保留用于回退。

导出前后校验全部物理会话均已列出、所有可读会话的事件与聊天消息等价、既有损坏数量不扩大、源文件哈希不变。未知 required 事件和损坏 payload 不自动吞掉。V3/V4 的无旧读取器转换另由 history.mjs 覆盖；旧格式须使用 legacy-export。历史 creative ID 仅生成为当前 standard 的完整兼容别名，不自带业务提示。
