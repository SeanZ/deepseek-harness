# my43 0.1.7-alpha.1 升级评估

## 范围与阶段

用户已确认开始升级，包括本地构建、my43隔离验收、备份与生产切换及dev提交推送。保留已有手机调查改动，固定官方标签；迁移先在专用upgrade分支进行，再快进dev，不改写既有补丁历史。

- [x] 阶段一：发布、生产与接口评估。
- [x] 阶段二：迁移核心注入、V4历史、creative与unrestricted配置，完成单元/集成/类型检查。
- [ ] 阶段三：本地构建制品；隔离home验证真实历史、模型、Team、设置、浏览器、Office及原生依赖。
- [ ] 阶段四：备份、生产切换、鉴权与数据回读，提交推送dev。
- [ ] 用户页面人工验收后归档。

## 固定版本

目标 `dsh-v0.1.7-alpha.1` / `c36a83ff6bb95e3f82cf79f9be7c724270a8aa61`；本轮fetch后origin/master和upstream/master均为该提交。dev仍为eade9a055d，my43仍为20260918-alpha2。生产已安装Team的Host与Web profile，旧Context、Better Sidebar、scheduled-tasks未恢复。

## 评估入口

本轮产物在忽略目录 `.artifacts/017-alpha1`；merge-tree为不修改工作区的合并预检。冲突不仅涉及生成文档，还涉及Session核心及被上游删除的agent-presets测试。升级必须重新适配语义，不能直接接受自动合并结果。

## 已确认的兼容阻断

1. V4将工具结果从user消息中的tool-result内容块提升为独立tool角色，工具调用标识放在消息层。现有request-injections.ts的balancedCuts仍仅遍历内容块计数，原样接收V4工具结果会抛出unanswered tool call。最小探针injection-v4-probe.ts已运行：同一组完整交互的V3对照通过，V4结果触发断言预期的错误。此探针验证现有补丁的表示不兼容，不是新版完整应用测试。
2. request/injections是本分支required事件，官方标签无此类型。V4仍拒绝未知required事件。必须把事件校验、V0到V4相邻迁移、快照回放、消息来源及新developer/system表示一起适配，不能改为ignorable绕过。会话首次写入发布后继generation，不覆盖旧代际，但新V4进度不能承诺用alpha2继续。
3. settings已由独立register/get/watch服务改为Cordis Config投影和profile配置写入。线上unrestricted/src/node.js仍调用ctx.settings.register，不能直接加载新版。须迁移插件Config、热更新声明、设置UI和开关持久化，保留当前enabled:true、targetPresets:[creative]、includeSubagents:false。
4. settings.yaml在首次导入前即改名为settings.yaml.imported；每个section失败仅记录日志，不自动重试，未成功值仅留在改名文件。因此适配插件Config必须先于导入，不能假设启动成功代表所有设置迁移成功。当前生产deepseek设置仅有models、无protocol；删除官方protocol选项暂无已观察到的直接配置冲突。模型与reasoningEffort以本轮生产读回为准，不套用上次升级默认值。
5. agent-presets旧目录机制被agent-preset-registry/agent-preset与bundle patches取代。保留creative id供历史会话引用，按新版standard组合重新声明；旧creative目录文件即便自动合并留存，也不能证明被新版注册。
6. agent-team-web-profile已删除，UI并入agent-team-profile。生产当前恰好启用了旧的两个bundle，需同步清单与安装副本，不能继续携带旧Web包。新版任务看板只读，成员状态统一；roster的live?.options.model ?? root.options.model回退仍存在，旧模型显示问题不能宣称修复。

## 页面变化与部署约束

有价值的页面变化包括会话置顶/归档筛选、长对话加载、过程组折叠、预览自动刷新、分栏diff、表格只读预览、缩放与后台任务输出。系统关联应用打开文件不能理解为服务器文件直接在远端用户电脑用本地软件打开。Team任务板移除人工修改入口，属于行为变化。

浏览器鉴权的token兑换保留签名与cookie结构，但303 Location由/改为./，并保留应用挂载路径；my43使用根路径，静态审计未发现必须改Caddy的原因。仍需实测Authelia、bootstrap脚本、本次invocation、旧cookie、Host/Origin及二进制Remote。不要新增公网免鉴权路径。

本轮不调查或承诺修复iPhone问题。4GB远端继续只装运行依赖，本地构建DSH/vendor和插件；保留Office并发1与已有中文字体，旧Context、Better Sidebar和外部定时任务插件不恢复。

## 后续升级顺序与验收

如进入实施，先在隔离分支和独立home/端口迁移核心注入、V4历史与SDK，再迁移creative声明和unrestricted配置，最后同步Team组合。必须让最终插件schema就绪后才运行旧settings导入。

验收至少覆盖：单元与类型检查；V3工具结果到V4及注入锚点、连续工具交互、system/developer卡片不重复；zx-n、agent、apps各3条近期历史及原9条旧格式样本、Team父子关系、源文件不变和追加后重开；settings每个section和默认模型读回、失败导入可恢复；creative六次真实工具调用与一份注入；Team创建/互发/冷恢复/新只读面板；新Remote、PTY、Office和完整Caddy认证。所有测试使用复制数据，不能让新源码直接打开生产home。

切换前一致备份home、profile、凭据和运行配置；回退要同时恢复配置与兼容数据，明确保全升级后新写入，不只切current软链接。

## 实施证据与剩余验收

核心迁移完成：注入物化返回RequestMessage而非扩展持久Message，插件assistant来源单独声明；工具结果按V4 toolCallId配对；V3迁移显式识别required request/injections。creative使用Web bundle独立patch，与本版standard配置逐项相同，保留creative标识与勇于创作名称。

unrestricted以线上0.3.0+my43.alpha2安装副本为基线，改用Config volatile引用和客户端configForms.get，版本0.3.0+my43.017a1。增量补丁scripts/patches/my43-unrestricted-017a1.patch同时携带源码、bundle与13项测试；旧bundle作为负对照会因settingsScope.bind接口失效而失败。注入文本保持原样。

已完成：核心相关1792项测试；会话/循环集成1207项通过1项平台跳过；Team/token-meter246项；新增11项聚焦测试；插件13项与类型检查；完整Host/Client构建与全库lint。文档门禁首次发现类型、目录、JSDoc、历史格式索引、双语和字数问题，已逐项修正并补验，不能把首次失败算通过。

真实历史：从my43复制113个近期文件，复制前后哈希相等；zx-n、agent、apps各3条近期会话及原9条旧格式样本均通过读取、V4写入、追加、重开和模型历史/注入相等检查，原文件未改变。扫描仍拒绝原有5条不兼容旧日志，不删除字段或放宽规则。包括用户曾报告系统卡片问题的session-84e60464-d4c4-431d-8f67-9ff5b105fd11。

本地完整组合已启动于随机loopback端口，独立home下的6个旧settings section已进入新profile。旧agent-presets.default必须先显式转换为agent-preset-registry.selectedDefault，新版内置导入不会替我们转换；其余原样导入。真实模型、Linux制品、浏览器、认证与生产切换仍在后续阶段。
