# my43 rc.1 升级

## 范围与版本

用户授权审核 fork master 后升级 my43。合并 `origin/master` 的 `aa8262ec091698bae9a6b04773a6b5b06ad4aef2`；它与官方 `dsh-v0.1.5-rc.1` 的运行代码一致，额外改动为文档。保留 dev 的注入协议 v2、历史迁移和两个外部插件补丁。本地构建全部内部包，远端仅安装依赖，不运行源码构建。

## 分阶段计划

- [x] 审计上游差异、线上版本、插件安装和配置。
- [x] 合并 master，验证补丁、模型与侧栏相关测试、构建和仓库检查。
- [ ] 打包传输，隔离 home/端口验证 Linux、历史会话、真实请求、下载与终端。
- [ ] 确认无活跃运行后，一致备份并切换；验证鉴权、配置与已有数据，失败回滚。
- [ ] 更新长期约束，提交并推送 dev，清理本任务进程。
- [ ] 用户人工验收确认后归档。

Planning Tool 未提供，以本文件维护分阶段状态。

## 风险与验收契约

上游未修改注入、会话格式和鉴权源码；补丁重叠仅 token-meter 文档。侧栏调整涉及文件预览与滚动容器，须实测 Better Sidebar 接管、二进制下载、终端及重连。继续使用已修补的 `0.19.0-alpha.1+my43.1` 与 unrestricted 0.3.0。

线上显式默认模型为 `deepseek-v4.1-flash-expires-on-0910`，自定义模型列表会覆盖新默认目录。已询问是否切换正式版 `deepseek-flash`；先在隔离环境验证可用性，保留其它 provider 设置与历史会话选择。设置如需改动，单独备份并记录预期字段差异。

生产 Caddy、Authelia、systemd 和 bootstrap 不改动。隔离环境不复制定时任务 store。切换前保存完整 home、profile、旧 release 链接；保留既有会话字节与新增数据。复用 `.artifacts/my43-deploy` 与 `.artifacts/sidebar-upgrade` 的已验收工具，调整版本与路径后再运行。

本地第一轮 61 文件 821 项相关回归、请求注入 SDK 快照、unrestricted 10 项测试通过；完整构建、lint、34 项 doc-sync 和16项 hygiene 通过。真实本地 Web 下载边界、PTY执行与重连通过。
