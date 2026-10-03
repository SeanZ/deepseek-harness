# my43 021alpha1 升级评估

## 范围与阶段

用户已授权适配、测试、构建并升级my43到0.2.1-alpha.1。使用upgrade/my43-021alpha1隔离分支；主dev既有未提交文档保持原样。保持Caddy/Authelia启动参数，本地构建、服务器仅安装依赖。

- [x] 拉取官方与fork引用，确认生产仍为020rc2。
- [x] 检查用户可见变化及核心/预设/插件/历史/鉴权差异。
- [x] 验证补丁合并冲突与静态兼容阻断项。
- [x] 给出升级建议和后续验收范围；等待用户决定是否实施。

- [x] 解决合并冲突、同步creative并完成本地检查。
- [ ] 制品打包、本地与Linux独立home/端口验收。
- [ ] 一致备份、生产切换及配置/历史/鉴权读回。
- [ ] commit/push dev，同步本地，停止测试进程。
- [ ] 用户人工验收后归档。

## 固定基线

本地dev为8548074888，my43 current为20260929-020rc2、实际CLI版本0.2.0-rc.2，dsh/caddy/authelia active，dsh NRestarts=0。目标标签dsh-v0.2.1-alpha.1为5badb15009；fetch时origin/master、upstream/master均指向该标签。4190文件变化含大批生成文档与版本号，按实际运行模块审阅。

## 用户可见变化

Web默认内置Schedule服务和自动化任务页面；standard/cordis/ptc有时间上下文及四个schedule工具，delegated children被拒绝。此前卸载的第三方scheduled-tasks插件与此不是同一组件，不装回旧插件。插件入口加入创建插件与来源说明；关闭Coding Tools只隐藏内置ptc/minimal，不隐藏命名的自定义creative。输入草稿初始化保留结构化引用，工具准备阶段可渐进显示参数且优化增量开销，会话列表分片处理，Markdown预览展示YAML frontmatter，Office Kit升至0.1.5。

Claude Code mods为实验性可选桥接，支持部分事件、工具守卫、提示词改写与AbovePrompt横幅；不直接读取plugin.json/hooks.json，不支持所有Claude接口。prompt.submit上下文属于user消息，不等价于我们的assistant-role request/injections，不替换dsh-unrestricted。

## 自用补丁与兼容风险

git merge-tree只生成预览对象，未合并dev：7个冲突文件，其中3个文档、agent-loop/session两个invariant文件，以及scope生成表和对应测试。上游整体移除运行时不变式插件，应顺应删除并保留/迁移确定性行为覆盖，不能恢复整套旧模块。生产profile和unrestricted补丁未引用被删除模块；插件实际版本仍0.3.0+my43.017a1，入口导出为包根/client/package.json，不依赖此次废弃的子路径展示清单。

creative必须同步standard新增的time-context、tool-schedule及spawn/fork四项schedule deny列表；否则标准/创作预设能力出现静默分叉。预设挂载的全局集合改由registry实例持有，插件管理/HMR更新运行时模块解析，均需重新验证预设切换、插件卸载重载、请求注入快照及历史重建。

核心agent-loop/src/agent.ts、DeepSeek和pi-ai请求序列化/重放、token-meter/src/index.ts及session-format-status与rc2上游一致；merge预览保留requestInjectionsVersion=2和waterfall。未发现新的会话结构版本迁移，仍V4，但不因此承诺降级。pi-ai仍0.87.1，继续携带pnpm补丁tarball。Cordis/vendor升级，Office Kit 0.1.5需重新打包和Linux转换验收。

## 部署注意

新增publicUrl只影响对外宣告的URL、DSH_WEB_URL和部分提示，不改变监听/Host-Origin鉴权。my43现有bootstrap helper仅从http://127.0.0.1:<port>/?token=提取令牌，主动配置https publicUrl会使其失配；后续升级应保持参数不变。若另外启用publicUrl，必须先适配helper并验证Authelia/bootstrap/cookie完整路径。Node要求仍^22.19或>=24，当前远端22.23.2满足；构建新增TypeScript type-stripping环境检查及DevTools源码产物，打包须检查新增资源完整性。

## 实施与验收证据

已按官方删除不变式模块并重新生成目录/双语文档，creative与standard的time-context、Schedule及子Agent deny列表保持一致。SDK注入快照只更新上游工具描述和参数顺序；Python验证夹具同步现有Messages协议和V4文件，三轮续聊、仅一次注入/initial header的预期回放通过。

本地锁定安装与完整构建通过；核心/注入/会话/迁移等26文件522项通过，插件/UI等30文件784项通过（有重叠，不合计）；creative新增断言通过；预设端到端24项通过；SDK request-injections回放通过。lint通过，doc-sync 42门禁通过。近期9会话、旧格式9会话恢复/追加/重开通过，源文件147与73份哈希不变。扫描保留早期V0不支持字段/descriptor日志，未删字段伪造兼容。

隔离本地真实GLM5.3和当前DeepSeek Flash各完成6次顺序工具调用，均仅1个initial header、1次system与1次request/injections；pi-ai 298个流片段和最终参数精确校验通过。插件两轮卸载重载和浏览器开关持久化通过，页面无JS错误。

制品与Linux业务验证尚未完成，生产仍020rc2。iPhone真机问题没有明确修复证据，不宣称已解决；人工验收前不归档。
