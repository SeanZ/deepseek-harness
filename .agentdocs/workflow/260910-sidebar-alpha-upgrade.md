# Better Sidebar 对齐 DSH alpha

## 目标与约束

将 my43 的 dsh-better-sidebar 0.18.0 升级至固定版本 0.19.0-alpha.1，统一官方右栏与插件文件、终端页面。保留现有 patched DSH、unrestricted、定时任务和 Caddy/Authelia。使用已发布制品，服务器不源码构建。

## 实施阶段

- [x] 核验 npm 发布版本、包完整性及 native sidebar 适配代码。
- [x] 本地独立 home 验证面板入口、文件预览/下载和真实终端。
- [x] 远端独立 release 与 canary 验证 Linux 依赖和鉴权。
- [x] 停服备份、切换 release/profile；验证生产和回退路径。
- [x] 更新部署约束，保留证据并交用户验收。

## 验收边界

使用隔离工作区和新会话操作文件及终端；不执行生产定时任务。生产切换前检查运行中会话，保留旧 release、profile 和 home 快照。插件布局升级后的持久状态需随备份保留。官方右栏应只保留一个入口，插件保留底部工作台入口。终端验证真实输出及断线重连，下载验证原始字节。

## 下载兼容补丁

0.19.0-alpha.1 的原生文件资源允许相对路径，但 `/sidebar/file` 仍要求绝对路径，导致交付卡片生成的二进制下载返回 400。`scripts/patches/my43-sidebar-alpha-download.patch` 同步修改 Host 源码与已发布 JS：先依据会话权威 cwd 解析相对路径，再执行既有 realpath 与 workspace fence。制品标记 `0.19.0-alpha.1+my43.1`，未改客户端 bundle。

隔离 HTTP 回归覆盖相对/绝对路径同字节下载、目录穿越与软链接越界 403、错误 Origin 403；真实 PTY 断连重连后转录和 shell 变量均保留。插件媒体路由本身允许可信 loopback 无 cookie 请求，公网边界由既有 Caddy/Authelia 提供，不应把它与核心 API 的 cookie 鉴权混为一谈。

## 部署与验收状态

生产已切换至 `/home/ubuntu/dsh-releases/20260910-alpha2-sidebar019`，备份为 `/home/ubuntu/dsh-backups/20260910-110047-pre-sidebar019`。3896 个核心文件与 unrestricted 插件与前一 release 相同；安装峰值 208.2 MiB，无源码构建。上线前无运行中会话，上线后 85 个既有数据文件字节不变，74 个会话可列出，旧 cookie 200、bootstrap 303、可信 Origin 200、不可信 Origin 403，注入协议仍为 v2。公网匿名下载路径重定向 Authelia。systemd、Caddy 与 bootstrap 配置哈希不变。

本地和 Linux 隔离实例均通过下载及 PTY 实测；浏览器确认文件卡片进入插件预览、顶部只有一个右栏入口和一个底栏入口、终端实际输出、Linux 下载入口成功触发下载且无前端错误。原版相对下载 400 已先复现，再由补丁修复。可重复下载测试位于 `scripts/fixtures/my43-sidebar-download.mjs`；完整操作证据位于忽略目录 `.artifacts/sidebar-upgrade/` 和远端 canary。等待用户刷新生产页面人工验收；确认后归档本任务文档。

下载回归的 5 个子用例在 macOS/Linux 均通过；独立 Oxlint 检查 1 个 fixture 文件、96 条规则，无诊断，发布 JS 语法检查与补丁反向校验通过。文档 33 个门禁首轮通过，doc-typecheck 因 PATH 缺 npm 未执行，补齐既有 Node/npm 路径后单独重跑通过（81 个代码块）。制品 SHA-256 为 `e26655c345733a40df8224ca143b2ddcdf438ad5d2053998cd66e6be24e30067`。
