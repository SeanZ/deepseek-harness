# my43 020rc1 升级评估

## 范围与计划

用户已确认开始升级。沿用此前评估，在隔离worktree适配、验证后本地打包，上传my43验收并备份切换，最终commit/push dev。原工作区已有未提交文档须保留。

- [x] 获取官方与 fork 远端，核对标签及生产运行基线。
- [x] 对比发布变化、合并冲突、请求注入、creative 与插件配置契约。
- [x] 核对历史格式、模型协议、安装和鉴权边界，形成升级验证清单。
- [x] 完成文档检查并形成用户评审结论。

## 已确认基线

评估时官方目标 dsh-v0.2.0-rc.1 / 4878cdabd8；origin/master 与 upstream/master 均指向目标。当时 dev 为 d76661b3ad，保留既有未提交文档。my43 的 current 为 20260925-017rc2，dsh.service active，Node 22.23.2；系统盘可用约26G，新盘 /srv/cloud 可用约93G。后续部署状态见实施证据。

只读 merge-tree 结果保存于 .artifacts/020-rc1-assessment/merge-tree.txt。发现 agent-loop/src/agent.ts 与两份事件目录文档冲突；其它自动合并不等于语义兼容。

## 评估结论

可进入适配验证阶段，未发现必须放弃该版本的静态阻断。1109文件变化中的大规模删除主要来自生成的持久类型schema目录去重，并非删除会话数据或改变压缩格式。新旧Session writer均为V4，types及3→4迁移源码无变化；不据此承诺所有旧日志可读或无条件回退。

agent.ts的冲突仅为导入声明：保留本分支RequestMessageInjection及相关函数，同时加入上游ToolCallRecovery。后者在本轮步骤异常时、step/end前补记缺失工具结果，区分未开始与结果未知；已有关闭步骤中的历史仍不重写。DeepSeek serialize.ts未变化，因此此前Gemini空text跨模型错误不在本次修复范围。

目标standard未变化；merge-tree中的creative插件段与目标standard逐字相等，注册项和发布files均保留。配置表单源码未变化，config-editor改善继承配置计算；unrestricted的volatile配置仍须验证实际读写、卸载重载及刷新。官方Creator开发指引与我们的creative用途不同，不应混为一项功能。

新增通用设置Session Log上传开关，enabled改为volatile；只读生产检查确认现为false，升级须保留并核对真实请求不带日志扩展。新增产品统计仅默认启用于desktop profile，my43使用web。自动化迁至可选bundle，未启用时不引入；不恢复已卸载的第三方定时任务插件。

Web无显式工作过程设置时由standard改为detailed，旧normal也映射detailed；用户显式compact/standard/detailed应保留。Safari修复针对流式回复刷新后的JSON回读，不是此前iPhone键盘/输入框问题的修复证据。

webserver及gateway源码、release pack脚本无变化；Node要求未改，现有Node22.23.2适用。Koffi发布依赖固定3.1.1，修复某些Linux缺可选预编译包时npm失败；仍按本地构建、Linux只装依赖并禁用生命周期脚本验证。Office库依赖仍为0.1.1系列，生产maxConcurrentConversions为1。

## 升级验收清单

1. 在隔离checkout合并并处理导入冲突，重新生成事件目录和持久schema，验证自定义required事件不丢失。
2. 执行注入/动态工具/异常恢复/creative/配置继承定向回归、类型及lint检查；目标版本构建后验证发布files。
3. 重新取生产快照，在独立home回读近期与旧格式会话，包含e969；验证旧文件字节与事件保持，保留原有不兼容历史边界。
4. 本地及Linux canary真实多轮工具调用，验证system/injection无重复；测试unrestricted配置、Office/PTY/Team，以及上传关闭设置与模型配置。
5. 验证Caddy/Authelia→bootstrap→cookie/API及Origin边界，确认无活动任务后才执行后续授权的备份与生产切换。

## 验证边界

原只读评估输出为 .artifacts/020-rc1-assessment/static-checks.json；merge-tree仅产生Git对象，未合并dev或改变生产。该阶段不包含构建、历史回放或Linux运行证据；用户授权后完成的实施结果另列下文。

只读评估时dev的pnpm run test:docs通过20项、无跳过，git diff --check通过。这些仅验证评估文档，不代表目标版本运行回归通过。

## 实施阶段

- [x] 隔离合并、补丁及回归测试。
- [x] 本地构建、历史回放和真实模型验证。
- [x] Linux制品与独立实例验收。
- [x] 一致备份、生产切换、鉴权及数据核对。
- [x] 核心提交推送dev、清理隔离进程、记录验收边界。
- [ ] 用户人工验收，确认后归档任务文档。

## 本地适配证据

核心/注入/creative等185测试、历史迁移4测试通过；新增调度异常与注入共存回归包含失败后续聊和日志重建。上传配置及载荷54测试、SDK注入快照通过。全量build、lint及doc-sync 42门通过。近期9会话（含e969）139源文件、旧格式9会话73源文件的追加/重开/注入历史回放通过；原5条不兼容历史边界仍保持。

生产ui-chat.transcriptView=standard来自旧默认而非持久设置，新版原样加载时缺失此字段并显示detailed。为保持原体验，迁移仅新增ui-chat行，值取实际生产settings基线（standard、detailed统计、sidebar链接）；其它原profile补丁逐字保留。测试开始时默认模型为glm-5.3/low，不沿用旧测试文档中的high；最终生产值见下文。Session Log上传实测设置仍为false。

## 制品与Linux验收

合并提交402ef79bdd45ffd6f5af61393449edec9de5d34c完成后运行build:official及release:pack。329个tarball（318个DSH、9个vendor、2个外部包），3366个lib文件与构建一致；payload SHA256为0eccb7379aca215f6f855bcf72809476159cf53bae4476c64839a8eb99f22314。服务器只安装依赖，799包安装峰值591.1M、无swap，5339个安装文件逐字校验通过。unrestricted与Linux node-pty保持原制品字节。

Linux近期9会话、旧格式9会话回放通过，139/73个源文件不变。flock、koffi、PTY、ripgrep通过；Office CLI/API/Web转换、文件下载完整字节通过，无缺失字体。插件开关及刷新持久化、两轮卸载重载通过。GLM真实六步调用验证单一system和单一注入；本地DeepSeek同样通过。Team真实创建成员、共享任务并完成，重启后2成员与completed任务恢复，浏览器面板无异常。终端刷新后同一Shell和环境保留。未做真机iPhone测试。

## 生产切换与回退入口

2026-09-28 22:36切换至/home/ubuntu/dsh-releases/20260928-020rc1。备份/home/ubuntu/dsh-backups/20260928-223624-pre-020rc1保留完整home、agents及service配置；前版20260925-017rc2保留。回退必须先保全新home，再同步恢复备份home/profile和旧release，不能只改current。

停服前91会话均未运行。最终比对发现用户已将默认模型改为deepseek-official/deepseek-v4-pro/max；解析profile和全量settings确认只有这一项差异后保留最新配置并更新部署验收基线。切换后原139会话文件、凭据、Caddy/systemd/helper哈希不变。原Cookie200，bootstrap303，可信Origin200、不可信403；公网7条路径均302至Authelia。未替用户进行真实Authelia账号登录，不将匿名跳转称为完整登录验收。

部署证据位于忽略目录.artifacts/020-rc1及远端release内020-deployment-state.json。配置与启动日志含敏感信息，不加入Git。系统盘安装后可用约24G，挂载盘约93G；npm缓存及旧版本未清理。

生产浏览器打开原84e604会话，151个历史节点可渲染，creative和unrestricted设置正常、无pageerror；再次核对139个原历史文件未变化。dsh/caddy/authelia均active，dsh重启计数0。隔离服务已停止，本地测试隧道已关闭。源码合并已推送dev，本地dev同步且保留用户原有未提交文档；隔离worktree与私有测试证据保留供下一次升级使用。
