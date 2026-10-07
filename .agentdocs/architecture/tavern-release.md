# Tavern 固定源码制品

## 固定输入与职责

部署分支只维护 `scripts/deploy/`、`scripts/tavern-acceptance/` 和代理文档。官方宿主固定为 DSH 0.1.5-rc.2 / `fb2c4b9e698e30edb738bca4cf0618587db7d203`，Tavern 固定为 2.5.0 / `8480f7deb9b645d396bfbd75092810a8b8ad70b2`。purge 版本、提交和源码归档 SHA-256 以 `scripts/deploy/lock.json` 为唯一配置源，下载地址只允许 SeanZ fork 的不可变提交。

`source-host.mjs --source-root <official-checkout> --out <new-directory>` 在固定官方 checkout 中构建并调用官方 `scripts/release/pack.ts`，校验八个 Tavern 宿主文件的原始 SHA-256。部署脚本提交后必须显式传入固定官方 checkout；官方 checkout 不需要包含部署脚本。Node 22.21.1 已验证可复现八个原始文件。`--skip-build` 仅复用已构建输出，仍检查 Git HEAD、tracked / untracked 源码与根构建输入差异，以及八摘要。

`build.mjs --source-host <host-artifacts> --out <new-directory>` 从固定源码归档运行 Tavern 的 `build-tavern-client.mjs` 与 `build-plugin-package.mjs`，用 `npm pack --ignore-scripts` 封装聚合插件。官方源码 tarball 不封入现有 `node_modules`。`source-host.json` 保存原始源码制品摘要；`manifest.json` 区分源码宿主和官方 npm 字节来源，不能把 npm 回退输入描述为本地编译。

## 依赖闭包

`runtime-source-lock.json` 是最终源码部署闭包。所有官方 host overrides 和源码依赖、必需 peer 都显式展开，Tavern 的 React / ReactDOM 使用源码声明的固定版本。Cordis 及其插件固定为 rc.2 checkout 的 vendor 版本，不能采用 registry 的浮动新版本；旧宿主与新版 HMR 组合已出现真实启动失败。

源码模式使用已经物化的 peer 根依赖，避免 npm 10 对本地 tarball 和 overrides 组合反复解析。安装器逐个读取实际安装包的必需 peer 并检查可解析目录；锁中有条目不能替代已安装事实。`runtime-source-lock.json` 同时记录部署输入和 overrides，普通构建发现版本、归档或 overrides 漂移就失败。只有审查依赖变化后才能使用 `--update-lock`。

构建保存锁文件中全部平台的原始 tarball，包括非本机 `os` / `cpu` 可选依赖，并将 `resolved` 改为制品内相对路径。每个归档同时核对 npm integrity 和制品 SHA-256。目标机用空缓存 `npm ci --offline --ignore-scripts` 安装，不访问网络，不执行第三方安装脚本。Node 和 npm 是安装前提；本轮仅在 macOS arm64 / Node 22.21.1 / npm 10.9.4 运行验证，Linux 运行结果必须标为未验证。

## purge 部署期补丁

固定 purge 为 1.1.15-seanz.1 / `a679f10a3409a29c30a0aa08a8757eb38ebf6c55`，源码归档 SHA-256 为 `e8be70658f68fb905ea35cac92f841cb94cb5a121bde8c7da4a8ced80af61044`。该 fork 不改变 purge 默认提示词正文，只对 root 前台请求去重；Tavern、Mnemon 及其它第三方注入正文逐字保留。

最终组合只在构建期应用 purge 的 `#40 COMPLETE_PROMPT_KEEP_INJECT`，目标是 `@deepseek-ai/dsh-system-prompt/lib/index.js`，用于保留完整提示词场景中的 purge 注入。该文件不属于 Tavern 的八文件校验清单。`apply.mjs` 从固定 purge 源码读取实际补丁，要求首次命中、再次应用无变化，再重新封装该宿主 tarball。`manifest.patches` 和 `purge-patches.json` 保存补丁名、目标文件、前后摘要及归档摘要。

不迁移 purge 的 sandbox、权限、回退和启动器补丁。安装后再次检查 Tavern 八个原始摘要。新 home 由固定 purge 包的 `seedOverrideSync` 生成默认提示词，只记录摘要，不把提示词正文打印到日志。`autoApplyOnStart`、`autoUpdateOnStart`、`allowHostMutation` 和 `rewindEnabled` 均为 false，`stripMnemon` 为 false，`promptScope` 为 root。Mnemon 保留，回退使用 Tavern 原生入口。

## 安装与运行

`install.mjs --dist <artifact-directory> --runtime <new-runtime> --home <new-home>` 拒绝已有目标以及 dist/runtime/home 相互嵌套，先核对完整制品文件集合与摘要，再离线安装。profile 固定为 `tavern`，组合 base、web-app、Tavern 聚合包及启用的 purge。home/profile 中的 node_modules 仅指向这份 runtime。用户配置位于独立 home，不包含在公共归档或宿主文件清单中。

`profile.patch.yml` 的 Cordis config 是整行替换，不是字段合并；webserver 覆盖必须完整保留 port 等必需项。profile 使用 `patchReload: startup`，配置重启后生效。`start.mjs --runtime <runtime> --home <home> --port <port>` 先核对所有运行时文件和八摘要，再启动真实 `dsh --profile tavern`。只监听 `127.0.0.1`；`--port 0` 由实际宿主原子分配空闲端口。

`runtime-audit.json` 记录全部安装文件及 npm bin 链接。服务启动、重启和延迟后的检查必须一致；未知新增文件、文件损坏、bin 链接漂移均失败。安装失败保留独立现场，不自动覆盖或复用失败目录。

## 验收与封包

`smoke.mjs --runtime <runtime> --home <home> --report <report.json>` 以端口 0 启动，从宿主就绪 URL 读取实际监听地址并兑换 Cookie，验证真实页面 HTTP 200、进程持续存活、重启和运行时无漂移。回执绑定安装时记录的 manifest SHA-256、两份锁、runtime audit 与实际 profile patch 摘要，并读取 Tavern capabilities、purge 状态和被禁用入口的 403 响应。启动日志必须脱敏 token，报告与日志必须放在 dist 外。该回执只证明 profile 冒烟，不证明剧情、提示词工程、模型或浏览器业务通过。

`scripts/tavern-acceptance/` 负责合成卡和真实宿主 API 的业务验收。最终必须测试同一份已应用 #40、已启用 purge 的封存 runtime；不能把纯 Tavern 基准或 metadata mock 当作组合通过。确定性验收用真实 Chromium UI 开局和输入，只固定模型适配器的返回，工具与存储均为真实实现。真实模型验收使用明确物品规则的合成夹具，必须独立完成全流程才算通过；旧失败不再出现不构成通过证据，模型把其它物品误认为目标物品属于语义失败。

验收断言依赖以下宿主与插件契约：

- 固定 Tavern 的 `body.edit` 清空 `posture` 与 `lastSettle`，不重放结算。
- 原生分叉入口为 `/api/session/fork`，RPC payload 为 `{args:{request:{sessionId,atSeq}}}`。
- 原生前台会话的 `parentSession` 不能作为子代理判定依据。
- Mnemon 在本组合中是 Tavern 的 card-memory Source，不是全局 Mnemon hooks。
- 同一会话在原生 `turn/end` 之前拒绝下一条发送；验收必须等待晚于本轮 `turn/start` 的 `turn/end` 后再继续，`assistant/message` 投影不代表本轮结束。
- 分叉生成新会话，父会话状态保持不变；改卡请求不注入 purge PE。

`pack.mjs --dist <artifact-directory> --out <new-archive.tar.gz>` 要求与当前 manifest、锁及发行 profile patch 一致的真实 profile / 插件 API 双启动回执；purge 启用时必须确认 root 提示词作用域，再以固定 tar/gzip 元数据封包并输出 `.sha256`。公共内容只来自公开归档、锁、脚本、manifest 和脱敏 validation；禁止复制 home、运行日志、凭据、会话及工作区。主代理负责整体验收记录、GitHub Release 和重新下载校验，不在本任务操作 my43。
