# 固定 Tavern 制品

## 目标

固定 DSH 0.1.5-rc.2、Tavern 2.5.0 与 purge fork 1.1.15-seanz.1；公共 Release 仅包含固定公开源码与依赖，不包含运行 home、凭据、会话或工作区。主代理负责最终验收、合并及发布。

## 阶段

- [x] 核查官方宿主八文件摘要、聚合插件与 purge 原版限制。
- [x] 官方源码 build:official 及 release:pack；八个构建字节与 Tavern 清单完全一致。
- [x] 完整跨平台 tarball 闭包、严格摘要、空缓存离线安装及实际必需 peer 审计。
- [x] 原版纯 Tavern 基准：真实 profile 页面两次 HTTP 200，启动、重启与所有 runtime 字节不漂移。
- [x] 固定 purge fork 与配置门控；只在构建期应用 #40，记录前后摘要，新 home 准备默认提示词。
- [x] 最终 final 目录的源码、脚本与 manifest 已冻结；13 项部署单元 / 真实 npm 测试、语法、Prettier 和 oxlint 通过。
- [x] 最终归档空缓存离线安装、双启动、Tavern / purge API、禁用入口 403、8 个固定官方摘要及 31964 个运行文件无漂移，回执为 `/Users/bytedance/workspace/seanz/.artifacts/dsh-tavern-release/evidence/final-api-smoke.json`；归档解包后另行安装到 `/private/tmp/dt-release-final-e2e-runtime`。
- [x] 确定性完整 12 步业务验收通过，回执为 `/private/tmp/dt-acceptance-final-10/validation.json`；验收脚本语法、格式、lint 与 6 项测试通过。
- [x] 代理文档门禁：`pnpm run doc-sync` 在 Node v24.21.0（`pnpm dlx node@24`，子进程与 tsx 均为该版本）下 34 项全部通过；5 份改动的 Markdown 经 `pnpm dlx prettier@3.6.2` 格式化并检查通过。
- [x] 真实模型正式 live 验收通过，主代理已逐项验收：回执 `/private/tmp/dt-live-acceptance-final-r2/validation.json` 为 `status=passed`、12 步、`pending=[]`；运行于最终归档新安装的 `/private/tmp/dt-release-final-e2e-runtime`，其 runtime-audit SHA-256 `14491e45503955aae6f13f265c6f4cc5db09800577ceacc2d045604578dc15b3`，与 31964 个运行文件一致，结束时无漂移。公开候选回执为 `/Users/bytedance/workspace/seanz/.artifacts/dsh-tavern-release/tavern-release-assets/live-validation.json`，只含合成字段，不含私有路径。
- [ ] 主代理提交部署分支、创建 Tavern Release 并重新下载校验。
- [ ] 用户人工确认后归档本任务。

## 当前制品

最终归档为 `/Users/bytedance/workspace/seanz/.artifacts/dsh-tavern-release/dsh-tavern-0.1.5-rc.2-purge-1.1.15-seanz.1.tar.gz`，SHA-256 `4fcf205dca547f6b8316efc5631322daec1f1ed91aa09946a877d4711d8455d3`。归档、锁与 manifest 已冻结，后续发布必须上传同一份字节，不重新封包。purge 源码由 tag `v1.1.15-seanz.1` 指向 `a679f10a3409a29c30a0aa08a8757eb38ebf6c55`。

真实模型回执覆盖的完成状态：`mvu_submit_update`、`posture_submit`、`tavern_memory_preference`、`tavern_memory_search` 四个真实工具均有成功事件；MVU 状态按 1 → 2 → 重生成 3 → 分叉 4 推进，分叉后父会话保持 3；改卡请求 PE 注入为 0；记忆步骤前后 content SHA-256 均为 `4890eaea13349804805058d2a758b08b23aed801bb3ea126cbf3da55de768d1a`；`synthetic-history.png` 显示编辑后的正文与历史可见。

## 固定决策

原版 purge 1.1.15 无回退关闭开关，纯 Tavern 基准封存但不加载它；基准与原版 purge 隔离运行只作对照，不代替组合验收。宿主源码编译可复现八个官方字节，后续不得放宽摘要校验。

最终组合只采用 #40 提示词补丁；sandbox、权限、rewind、启动器补丁不迁移。官方 npm 的宽 vendor 范围会引入 Cordis/HMR 漂移，因此使用固定源码 vendor。所有必需 peer 检查实际安装目录，避免缺失 Mnemon 的 UI / React 依赖。

真实模型旧 live04 前七步通过，但 DOM 定位测试超时；live03 把徽章误判为灯笼，属于语义失败。当前合成夹具已明确物品规则，正式 live 需独立完成全流程，旧失败消失不等于通过。通过结论只来自 final-r2 的完整回执。首个 final 尝试的记忆发送被 API 拒绝，原因是验收脚本只看到 assistant/message 投影就发送下一条，此时原生 turn/end 尚未到达；修复只改验收脚本的等待条件，业务断言和发行归档不变。

固定 rc.2 源码的 `verify-md-wrap` 在 Node 22.21.1 下失败：`fs.globSync` 匹配 `snapshots/**/system-prompt.expected.md` 时，把指向文件的跟踪符号链接 `snapshots/acp/image-compaction/system-prompt.expected.md` 当作目录遍历，抛出 `ENOTDIR`。该问题与 `.agentdocs/` 无关，不修改官方源码或符号链接，文档门禁使用符合 engines 的 Node 24 运行。

Linux 没有 docker、podman、colima 或 qemu，本轮只封存对应原生可选载荷，运行验收标记 not-tested，不部署 my43。
