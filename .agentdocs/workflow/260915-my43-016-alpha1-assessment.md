# 0.1.6-alpha.1 适配与部署

## 范围与计划

用户已在评估后确认暂时卸载 Better Sidebar，要求仔细适配 creative 并充分测试；执行补丁迁移、隔离验证和 my43 制品升级。起点 dev `b4615a5226`；生产只读核验仍为 patched rc.2、Better Sidebar `0.19.0-alpha.1+my43.1`，默认 V4 Pro / Low，服务 active、NRestarts=0。官方目标 `dsh-v0.1.6-alpha.1` / `0a15e36e7f`；fork master `0d1f50007f` 另含5个标签后提交，不纳入本次评估。

- [x] 核验发布范围及原生侧栏、插件的功能和接口。
- [x] 检查补丁合并、模型协议、会话及认证迁移风险。
- [x] 形成可执行的升级建议，记录验证范围和未验证项。
- [x] 用户选择移除 Better Sidebar，开始实施。
- [x] 合并正式 alpha.1 标签，迁移 creative 与请求注入，补充回归。
- [x] 完成单元/集成/SDK/构建/隔离真实模型及原生侧栏验证。
- [x] 本地制品上传，Linux历史样本、模型、原生PTY与认证验收。
- [x] 一致备份，移除web profile的Better Sidebar并切换，提交推送dev。
- [ ] 用户页面人工验收后归档。

Planning Tool 未提供，以本文跟踪阶段。隔离源码工作树位于 `.artifacts/016-alpha1/source`，dev补丁提交fab89ae1d1已推送，生产已切换。官方标签相对rc.2包含550个非merge提交、3942个文件变化（包含生成物和版本号），不按小版本补丁处理。

## 侧栏取舍

| 能力 | 官方 alpha.1 | 现有 Better Sidebar |
|---|---|---|
| 文件树与预览 | 文件树、Markdown/代码/HTML/图片/PDF；文件、Skill、交付链接默认走侧栏；切换tab保留文件树滚动 | 接管官方文件类型，支持编辑器与多种预览 |
| 文件下载 | 文件树和预览代码未提供通用下载入口，已知不支持的二进制容器只显示不支持 | 原始字节下载、中文文件名；my43相对路径补丁保留 |
| 编辑及文件管理 | 只读；无搜索、改名、拖拽管理或文件树右键菜单 | 编辑保存、搜索、上传、改名等 |
| 用户终端 | 多标签、Shell选择、改名、刷新重连、输入控制权；默认每会话8个 | 独立PTY服务、转录回放，底部工作台；可选模型terminal工具 |
| 终端恢复边界 | 浏览器刷新可恢复Host保留进程，服务重启不能恢复；回放有界，输出不进入Agent | 上次已测浏览器断线重连及shell变量保留；不是跨服务重启保证 |
| Git及工作台 | 没有与插件等价的Git变更/暂存/提交工作台，也没有同等底部面板 | Git、本轮文件变动、diff、底部工作台、浏览器和侧聊等 |

依据：目标标签的 [终端说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.1/packages/client/ui-sidebar-terminal/README.md)、[终端控制器](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.1/packages/api/terminal-controller/README.md)、[文件树](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.1/packages/client/ui-sidebar-files/README.md)、[预览器](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.1/packages/client/ui-sidebar-documentpreview/README.md)。链接固定官方标签，清理隔离工作树不影响定位。

### 接管关系与可选组合

Better Sidebar 原生适配器将 `files`、`terminal` 和文件资源查看器注册为 extension 优先级。官方注册器允许builtin与extension共存，但同kind仅extension生效；不是简单出现两个独立终端按钮。用alpha.1真实注册器及当前插件注册字段运行隔离探针，确认terminal由插件接管、官方multiple字段不继承，注销插件注册后恢复原生定义。探针只验证注册选择，不代表完整插件/UI或PTY生命周期通过。

插件的 `tabsEnabled.terminal=false` 会撤销其terminal注册，可让原生终端成为主入口；`tabsEnabled.editor=false` 会同时撤销文件资源查看器和files接管。单独关闭交付卡片拦截不能解除通用资源查看器的优先级。保留编辑器意味着一般文件链接仍主要打开插件查看器；若要原生预览优先、插件编辑/下载作为显式操作，需要另做适配，不能声称一个现有开关即可兼得。关闭插件终端不等于卸载其Host逻辑或隐藏底部按钮。

用户最终选择暂时卸载Better Sidebar，接受其下载、编辑及Git能力暂时不可用。部署仅移除当前web profile的加载与依赖，不删除插件历史设置、旧release或备份；后续需要时可重新安装。

npm当前latest为 `0.19.1`、alpha仍为 `0.19.0-alpha.1`；0.19.1文档的实机验收止于DSH rc.2，peer下限 `^0.1.5-rc.1` 不代表接受0.1.6-alpha.1。实际打包源码仍采用同样kind接管策略。插件新注册字段缺少guide条目id，终端未声明multiple，完整UI兼容尚需验证；同步历史读取仅被弃用，alpha.1仍保留，不能误报为已删除导致必然崩溃。

## 升级前必须处理

1. `git merge-tree --write-tree dev dsh-v0.1.6-alpha.1` 报20个冲突文件。核心手写冲突在agent-loop与Session；生成目录和翻译记录另行处理。请求注入必须保留完整快照、历史重建、token-meter计量，并适配 `surface.contentGeneration` 与新的image投影；不能保留旧 `replaceGeneration` 或直接选一边覆盖。
2. 自定义creative仍引用已删除的 `@deepseek-ai/dsh-workflow-worker-thread`。检查其28个包引用，发现该项在目标标签不存在；需跟随standard改为workflow-ptc并同步相关组合，否则creative不可原样运行。新版默认关闭Ralph，不能因旧creative副本继续开启而偏离standard。
3. DeepSeek默认协议从chat-completions变为messages，默认地址相应改变。线上settings没有显式协议，模型名称及Low不变也不能证明发送行为不变。`protocol`由Cordis配置选择，升级时应明确是否暂保留chat-completions，再对Messages测试助手注入、工具结果紧邻关系、历史重放与六步真实请求。不要把普通agent.inject当成请求专用assistant注入替代。
4. `session-log-deepseek.enabled` 的源码默认从false改为true，随官方请求增量发送完整规范会话事件（包含日志中的注入快照），不是只发模型messages；建议升级时显式false以保留现有未自动上传日志的行为，待用户决定是否启用。它与OTel反馈上传是两条独立路径。
5. Session逻辑格式仍是V3，但新增image/offload及消息投影、fork行为，不能据版本号承诺旧二进制可读取所有新增日志。沿用三工作区近期样本、旧迁移副本、注入重建与完整备份；不修改此前5条未知字段不兼容历史。
6. `agent/session-start` 变为异步串行 `agent/created`，插件生命周期及PTC改名需逐项审计。现有unrestricted节点只监听自用request-injections事件，不直接命中此次生命周期改名，但依赖核心补丁先迁好。scheduled-tasks静态搜索未命中此次旧事件名，仍须完整安装/运行验证，不能只看peer范围。
7. 原生终端使用现有Remote控制及流式传输，由session的subprocess/sandbox提供PTY；不应新增Caddy匿名放行路径。插件自己的 `/sidebar/file`、`/sidebar/ws/terminal` 仍需Authelia保护。初步评估只核对源码，后续独立实例终端与公网认证检查结果见下文；完整个人登录仍留待用户验收。

## 验证与证据边界

已完成fetch、官方release阅读、标签源码对比、三项线上插件及默认模型只读核验、无工作树改写的merge-tree、creative包引用扫描、真实侧栏注册器探针和0.19.1发布包源码检查。探针使用现有兼容依赖加载目标注册器，不是新版完整构建。

忽略目录 `.artifacts/016-alpha1` 保存源码工作树、changed-files、commits、merge-check、registry-probe与结果、最新插件元数据及发布包。已完成alpha.1本地构建、浏览器挂载与真实模型请求；生产已切换alpha.1。后续实施按既有[my43运行约束](../architecture/my43-request-injections.md)执行，先独立home/端口，本地构建，再限内存安装制品。

实施约束：模型保持V4 Pro / Low；先验证新版Messages和注入组合，失败则修复或显式保留chat-completions。profile叠加session-log-deepseek.enabled=false，保持原有不自动上传日志行为。所有构建在本地进行；先独立home/端口验证，通过后才停服备份、移除插件加载并切换。


## 适配约束与本地验收

creative 的 agent-plane 组合与目标 standard 相同，保留独立 preset 标识供 unrestricted 选择；workflow-worker-thread 替换为 workflow-ptc，Ralph 随上游默认关闭。请求循环沿用完整注入快照，改用 contentGeneration 判断图片卸载及表面替换导致的请求序列变化。注入存在或切换时归一化系统提示，避免 Messages 的历史内 system 更新与 assistant 注入位置冲突。同步历史读取仅保留升级前已有恢复调用，使用逐行弃用说明，不为新功能增加同步历史入口。

Session 原有观察器异常隔离抽到 event-observers，保留本地 collectSessionCallbacks 以供事件目录的语义扫描识别。Session 入口控制在1000行内。持久类型登记器新引入，因此为分支已有 request/injections 补登记；没有修改其载荷或提升格式版本。用户规定的 .agentdocs 部署手册须保留实际提交标识，引用检查仅允许该目录使用提交，仍检查其中禁用的组织链接，普通文档规则不变。

确定性回归包括：Messages 首轮/第二轮/六次续传及并行工具结果邻接；系统提示变更与注入开关；图片卸载后的请求投影、注入占用和重放。SDK快照只更新上游关闭Ralph导致的系统段落与工具表，既有Session JSONL没有改写。Python SDK 模型桩显式声明 chat-completions，并禁止会话自动上传；Messages另有适配器回归与真实请求验证。

本地独立home/43815已验证 V4 Pro / Low creative 六次文件工具、七步请求完成，持久注入快照一份。CUA页面确认“勇于创作”、中文Markdown预览、原生PTY输入输出和刷新后同一Shell变量保留；Better Sidebar未加载。macOS默认Shell启动尝试写个人zsh历史被工作区权限拒绝，但命令和重连正常，未放宽权限。

完整测试首次遇到系统Python3.9、旧Git不支持禁止懒加载、Node22实验fixture钩子兼容及已删除包残留lib。复测使用已有Node24、Python3.12和Homebrew Git；旧构建目录移到忽略目录retired-builds。一个上游实验测试夹具缺少新增可选ctx.get，补齐空注册器并复测，生产逻辑不改。构建原生N-API模块仍用带headers的Node22。构建制品测试必须在doc-sync的Host重建完成后执行，避免入口短暂移除导致伪失败。

本地验收结果：完整Vitest为1388文件、24311用例通过，13文件/135用例按上游条件跳过，1项既定预期失败；Node22构建制品集成为29项通过；TypeScript SDK录制回放1项、Python SDK端到端和unrestricted10项通过；doc-sync41项通过，lint通过。仓库hygiene中15项通过，剩余constraints仅报两处无package.json的旧构建目录，已与其他旧产物一起隔离，针对性复查后提交。

Linux制品包含285个DSH包、9个vendor包和2个保留原生/插件包，共296包4447文件逐字节核对。依赖安装仅npm、禁用脚本、内存上限1200MiB；实际峰值484.9MiB，无swap。Linux文件锁、koffi、PTY、ripgrep正常，Landlock仍为主机内核已有partial能力。9条旧样本和9条近期样本全部回放通过，73/87个源文件哈希不变；原有5条不兼容日志仍报告并保留。隔离完整插件组合中tasks列表可读，creative七步/六工具完成，注入快照一份。生产切换前preflight显示75会话、无运行中会话；公网根、bootstrap、原生终端API、unrestricted API及旧插件路径均由Authelia拦截。

生产切换成功：release为20260915-alpha1，制品提交fab89ae1d1；一致备份20260915-181822-pre-alpha1。systemd active/running、NRestarts=0；89个原文件未变，没有需要放行的恢复标记。Better Sidebar已从profile依赖、bundle和链接移除，自动会话上传显式false；默认模型和服务/认证配置未变。Linux浏览器原生终端输出NATIVE_PTY_linux，刷新后粘贴命令输出RECONNECT_linux。逐字自动输入经SSH隧道会因上游逐次RPC排队而较慢，粘贴可整批提交；本次没有修改原生终端队列。公网浏览器停在Authelia登录页，完整个人登录验收留给用户。两个隔离服务及SSH隧道均已停止，保留测试数据用于复核。

上线链接复查发现共享profiles/node_modules仍有三个指向rc.2的已删除包链接。确认新release不含这些包后，将链接与目标清单移入一致备份下retired-shared-links；不删除旧release。再次检查75会话、无运行中会话、注入协议2、旧cookie和Origin边界均正常，服务未额外重启。
