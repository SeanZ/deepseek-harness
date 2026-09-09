# my43 请求注入与运行契约

## 补丁边界

当前分支在官方 `dsh-v0.1.5-alpha.2` 上保留 `agentLoop.requestInjectionsVersion = 2` 与 `agent/request-injections` waterfall。声明是完整快照，空数组清空；生产者 key 必须唯一，只接受带插件来源的 assistant 文本。最新人类输入前锚定不会随连续工具调用漂移，depth 定位按完整工具交互计数，且不得越过开头的 system 消息。

`request/injections` 是 required 持久事件，不属于聊天历史节点。发送前记录、按日志重建；重试重新读取声明，准备阶段取消不提交用户输入或注入。存在注入或快照改变时开始新请求序列，让 alpha 的系统消息策略与可能发生位置变化的请求一致；因此不能承诺跨请求前缀缓存连续性。token-meter 将注入计入请求占用，单独保留历史节点计量；声明变化使旧 usage 锚点失效。

`creative` 使用当前 standard 的完整组合，独立标识用于外部插件选择，不自行提供注入文本。两者解析后相等由测试锁定。alpha 不提供 preset 继承，因此维护 standard 时需同步 creative。`dsh-unrestricted` 0.3.0 的主机逻辑和六次真实工具调用已验证。其旧独立 RPC 状态入口在 alpha 返回 HTTP 405；[兼容补丁](../../scripts/patches/my43-unrestricted-alpha.patch) 将主机和客户端状态读取迁到共享 `/api/unrestricted/status`，浏览器显示已开启且无操作错误，插件测试验证状态随设置变化。它不修改注入文本。旧 `dsh-context` 不在验证 profile 中；sidebar、scheduled-tasks 外部插件未加入该隔离 profile，不能将核心通过理解为这些插件已经完成升级兼容测试。

## 配套插件兼容补丁

补丁对象为 my43 的 `dsh-unrestricted` 0.3.0 源码目录，包含 node 入口、现有 client bundle 和状态测试。未来部署时先保留插件原目录副本，在新插件副本内执行 `git apply --unidiff-zero --check <本仓库绝对路径>/scripts/patches/my43-unrestricted-alpha.patch`，成功后再 `git apply --unidiff-zero <同一补丁路径>`；回退使用 `git apply --unidiff-zero --reverse`。只有校验成功才应用；其他版本不可盲套。已在本地原版副本上验证正向应用，修改后验证反向检查，并通过原有插件测试与新增状态测试。

不恢复旧 authority 参数，不新增 Caddy 放行路径，不输出密钥。共享 API 执行既有 Host、Origin、cookie 校验。当前补丁直接适配原插件已构建 client.js；未来若重建插件，需同步其 controller 源码中的 channel 与 endpoint，避免旧调用重新出现。

## 历史日志边界

V0/V1/V2 读取器显式识别 my43 的 `request/injections` 事件，并通过当前校验器校验 payload；不改变其他未知事件的拒绝策略。读取保留旧 generation，首次写入创建 V3 generation。三个历史版本的集成测试同时验证恢复、再读和旧文件字节不变。

my43 日志只复制到忽略目录后离线审计：73 个会话中 68 个通过，其中全部 5 个注入会话通过，共读取 41040 个事件。另 4 个会话的旧 permission/preset 数据含不接受的 origin，1 个含不支持的 subagent/descriptor version 2。这 5 个不自动丢字段修复；后续部署须保留原 home 与旧运行版本作为恢复来源，逐案处理，不承诺全部旧历史无损可继续。

## Caddy 与 Authelia

生产实例监听 `127.0.0.1:3080`，外部域名 `zxh.tackd.net` 通过 `--trusted-host` 显式许可。Caddy 先调用 Authelia `/api/authz/forward-auth`，再代理到 DSH；保留 Host、Origin、Fetch Metadata，删除 Authorization。不要伪造 localhost Host 或清空 Origin。

Authelia 放行不等同于取得 DSH cookie。根入口的 DSH 401 跳转到 `/_dsh/bootstrap`，该路径同样受 Authelia 保护。systemd `ExecStartPost` 运行 `/usr/local/libexec/dsh-caddy-bootstrap $MAINPID $INVOCATION_ID`：按本次 invocation 和进程查找启动令牌，原子写入 `/run/dsh-browser-bootstrap/index.html`，权限 root:caddy 0640，页面跳转到 HTTPS 的令牌兑换地址。Caddy 对 bootstrap 与根响应禁止缓存；不要恢复把 bootstrap 静态页直接绑定 `/` 的旧方案。

alpha 的 loopback 启动 URL 格式兼容现有脚本，本地真实 CLI 测试证明 cookie 可跨进程重启复用。未来打包运行时必须确认 systemd MAINPID 对应实际输出启动 URL 的 Node 进程；保留同一 credentials 的 browser-session 记录和原 ExecStartPost。远端 Caddy validate 与服务状态均只读检查通过；未重启服务，也未模拟真实外部登录完成部署验收。

## 本地验证入口

隔离 home 为仓库下 `.artifacts/my43-canary`，端口 `43805`，绑定 loopback；凭据文件权限 0600，目录 0700，只保存在 Git 忽略目录。该 home 的 web profile 只包含 base、web 与本地复制的 dsh-unrestricted；不复用用户默认 home。构建产物可用以下已执行入口启动：

```sh
DSH_HOME="$PWD/.artifacts/my43-canary" DSH_AGENTS_HOME="$PWD/.artifacts/my43-canary/agents" DSH_TELEMETRY_DISABLED=1 node apps/cli/lib/bin.js web --host 127.0.0.1 --port 43805 --trusted-host dsh-my43.test --no-open
```

应用构建与实际请求使用 Node 22.21.1。文档检查使用已有 Node 24.19.0，避开 Node 22.21.1 在既有 snapshot Markdown 路径上的 glob 扫描异常。真实请求选择 `deepseek-official/deepseek-v4-flash`，creative 连续六次只读文件工具调用成功并返回 `LOCAL_ALPHA_OK`。本地 HTTP 同时验证令牌兑换、可信 Host、cookie 和不可信 Origin 拒绝。

确定性回归由 session、agent-loop、token-meter、历史格式迁移测试、`snapshots/sdk/request-injections` 与 Python SDK fixture 承担。Python fixture 使用真实 SDK、独立临时 home 和本地 HTTP 模型桩；通过 `PYTHONPATH=python/sdk/src <含 pydantic 的 Python> scripts/fixtures/request-injections-python.py --node <Node 绝对路径>` 执行。禁止将真实会话、密钥、启动令牌或完整生产配置加入提交。

本轮交付只有专用分支上的源码提交，不打包、不推送、不部署。后续打包与 my43 部署验收仍为独立步骤。
