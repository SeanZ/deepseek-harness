## 架构与运行约束

`architecture/my43-request-injections.md` - 注入协议、历史日志兼容边界、插件安装副本、Linux 产物构建约束、Caddy/Authelia 引导与隔离验证入口；后续升级、打包、部署时必读。

## 当前任务文档

`workflow/260911-my43-rc2-upgrade.md` - 官方 rc.2 标签与 master 的范围区别、构建验收和生产升级。

`workflow/260910-my43-rc1-upgrade.md` - rc.1 合并、默认模型风险、隔离验证与生产切换。

`workflow/260910-sidebar-alpha-upgrade.md` - Better Sidebar 原生右栏适配、下载与终端验收及插件部署回退。

`workflow/260910-my43-alpha-upgrade.md` - my43 请求上下文补丁迁移到最新 alpha；修改请求组装、历史迁移或验证部署兼容性时读取。

## 项目约束

仓库架构与测试要求以根目录 `AGENTS.md`、`docs/architecture.md`、`docs/testing.md` 和各目录指令为准。此目录记录本分支的实施约束与验收状态。

## 长期分支约定

`dev` 是自用补丁与 my43 制品的长期维护分支，推送到 `SeanZ/deepseek-harness` 的同名分支；原 `feature/my43-alpha-request-injections` 保留为本次迁移的阶段性记录。`dev` 同时保存核心请求注入改动与外部插件兼容补丁，插件补丁入口见架构文档。

本地 `upstream` 指向官方仓库 `https://github.com/deepseek-ai/deepseek-harness.git`。当前基线为 官方 `dsh-v0.1.5-rc.2` / `fb2c4b9e698e30edb738bca4cf0618587db7d203`（master 含发布标签之外的开发改动，不随本次升级合并）。后续跟进时先 fetch 并明确选定上游 tag 或提交，再合并到 dev，保留已推送的补丁历史；不直接用上游覆盖 dev。冲突解决后按变更范围运行核心、插件、历史迁移与构建检查，制品部署另做隔离验收和备份。分支同步本身不代表自动升级生产服务。
