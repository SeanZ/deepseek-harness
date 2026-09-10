# my43 rc.1 升级

## 范围与版本

用户授权审核 fork master 后升级 my43。合并 `origin/master` 的 `aa8262ec091698bae9a6b04773a6b5b06ad4aef2`；它与官方 `dsh-v0.1.5-rc.1` 的运行代码一致，额外改动为文档。保留 dev 的注入协议 v2、历史迁移和两个外部插件补丁。本地构建全部内部包，远端仅安装依赖，不运行源码构建。

## 分阶段计划

- [x] 审计上游差异、线上版本、插件安装和配置。
- [x] 合并 master，验证补丁、模型与侧栏相关测试、构建和仓库检查。
- [x] 打包传输，隔离 home/端口验证 Linux、历史会话、真实请求、下载与终端。
- [x] 确认无活跃运行后，一致备份并切换；验证鉴权、配置与已有数据，失败回滚。
- [x] 更新长期约束，提交并推送 dev，清理本任务进程。
- [ ] 用户人工验收确认后归档。

Planning Tool 未提供，以本文件维护分阶段状态。

## 风险与验收契约

上游未修改注入、会话格式和鉴权源码；补丁重叠仅 token-meter 文档。侧栏调整涉及文件预览与滚动容器，须实测 Better Sidebar 接管、二进制下载、终端及重连。继续使用已修补的 `0.19.0-alpha.1+my43.1` 与 unrestricted 0.3.0。

线上显式默认模型为 `deepseek-v4.1-flash-expires-on-0910`，自定义模型列表会覆盖新默认目录。已询问模型偏好但尚无回复，当前保留线上默认值与完整 settings；正式版 `deepseek-flash` 和旧实验模型均已通过真实隔离请求。正式模型只在本次隔离 home 中加入目录并设为默认，未提前修改线上。设置如需改动，单独备份并记录预期字段差异。

生产 Caddy、Authelia、systemd 和 bootstrap 不改动。隔离环境不复制定时任务 store。切换前保存完整 home、profile、旧 release 链接；保留既有会话字节与新增数据。复用 `.artifacts/my43-deploy` 与 `.artifacts/sidebar-upgrade` 的已验收工具，调整版本与路径后再运行。

本地第一轮 61 文件 821 项相关回归、请求注入 SDK 快照、unrestricted 10 项测试通过；完整构建、lint、34 项 doc-sync 和16项 hygiene 通过。真实本地 Web 下载边界、PTY执行与重连通过。

发布构建提交 `2c122992a9b5ba9ff5ca0c5ee23b05ae80c7c228` 已推送 dev。265 个内部包上传校验通过，Linux 安装逐文件核对3732项一致，三个插件与 node-pty 字节不变；npm安装38秒、171MiB峰值、无swap。隔离端口43812，home `/home/ubuntu/dsh-canary/20260910-rc1`；真实 deepseek-flash 连续六次工具调用与注入、下载、PTY重连均通过。旧源样本9项迁移通过、73个原件不变；新鲜快照87个文件中三个工作区各3个近期会话追加重开通过，源快照字节不变。5个已知旧日志仍因原有字段/descriptor版本约束拒绝。

## 生产状态与回退

生产 release 为 `/home/ubuntu/dsh-releases/20260910-rc1-2c122992`，Web 和 CLI 均报告0.1.5-rc.1，PID2051801、NRestarts=0。切换前无运行中会话，完整一致快照 `/home/ubuntu/dsh-backups/20260910-142508-pre-rc1/dsh-home.tar` 与旧 profile 保留。原89个会话/配置文件字节不变；75个会话可列出。三个插件链接同步切换，settings 与默认模型不改。

DSH 匿名入口401、bootstrap令牌兑换303、旧cookie200、可信HTTPS Origin API200、不可信Origin403；注入协议v2保持。公网首页、bootstrap、媒体下载与终端入口的匿名访问均302到Authelia。没有可复用的公网用户登录态，不将上述检查描述为代用户完成公网登录。Caddy、systemd与bootstrap脚本保持原配置。

本地43811与远端43812隔离实例已停止，临时浏览器已关闭。制品上传遇到一次SSH超时，断点续传后整体SHA-256一致；没有切换不完整产物。Python SDK用Python3.12通过；系统Python3.9不满足现有SDK类型依赖。任务只剩用户刷新页面后的人工验收，确认无改动再归档。
