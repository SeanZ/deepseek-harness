# my43 0.1.7-rc.1 升级评估

## 范围与阶段

用户先要求pull并check，随后明确授权升级my43。目标固定为rc1，沿用长期dev分支commit/push、本地制品构建与远端依赖安装流程。保留已有手机调查文件和索引改动。

- [x] 核对发布标签并同步远端与本地master。
- [x] 比较alpha.1到rc.1真实增量、试合并及兼容探针。
- [x] 记录升级阻断、测试边界与后续验收要求。

## 固定基线

当前dev为93fcec43ba，官方alpha.1为c36a83ff6b；目标dsh-v0.1.7-rc.1为46a7f68b0922371ce7144b668b90e377d8e799f4，本次origin/master、upstream/master与本地master一致。RC发布说明含更早alpha累计变化，不能全部作为alpha.1后的新增功能。

## 证据入口

忽略目录.artifacts/017-rc1保存路径差异、merge-tree预检和探针结果。merge-tree仅产生Git对象，不修改dev工作区。

## 合并与兼容结论

正确配置Node和翻译合并驱动后的merge-tree预检仅有3个冲突：docs/event-producer-consumer的md、zh.md、i18n.yaml，均为生成文档；产品源码没有文本冲突。最初缺少Node时的6个冲突结果无效，以merge-preview-ready.txt为准。28个定制源码文件在试合并树8aef0772b005a8da5f2a28ccd76fb768917e4eee中与dev的blob完全一致，见patch-preservation.json；这不等于跨模块运行回归通过。

creative.patch.yml原样保留，同时存在于Web bundle的patch声明和files发布清单。官方standard preset在此次版本区间未变；既有V4会话、注入与浏览器认证相关定制没有发现需要重写的直接差异。后续仍须测试真实历史副本、连续工具注入及Caddy/Authelia链路。

RC1插件加载前新增DSH peerDependencies兼容性检查。线上dsh-unrestricted为0.3.0+my43.017a1，没有声明DSH peerDependencies，按新规则允许加载。使用RC1原始评估器的5项探针通过：真实manifest接受、固定旧版本拒绝、精确版本豁免生效、旧运行版本豁免不能沿用、alpha版本范围接受rc1。首次探针因隔离目录无法解析semver而未执行；补上本地已有semver的隔离软链接后通过，最终结果见compatibility-probe.log。没有给生产添加豁免。

## 部署需要调整的部分

1. LibreOffice Kit由0.0.1升级至0.1.0，Office skill新增独立CLI解析及运行路径。npm元数据确认Linux仍使用WASM，且要求Node >=22.19.0；my43现有Node22.23.2满足。旧assemble.py固定libreoffice-kit-wasm为0.0.1，不能直接复用，必须与kit一起升级并检查完整依赖闭包、CLI路径、中文字体、预览及4GB机器内存。仍可本地构建DSH制品，服务器npm安装依赖，不需要在服务器编译源码。
2. Team UI改为消费共享session projection，删除旧agentTeams/view RPC；上一轮verify-team.mjs相关探针要迁移，不能把旧接口失效直接视为产品故障。验收需覆盖实时成员/任务状态、父子跳转及已有Team冷恢复。
3. spill-policy配置由maxInlineBytes改为maxInlineTokens，输出预算同时考虑文本和图片。只读扫描my43的profiles/web/cordis.yml与cordis.patch.yml，均无旧或新键覆盖，因此未发现该配置的迁移负担。
4. RC1安装与插件元数据变化较多，应从同一提交生成完整制品及新的安装锁文件，继续使用带提交标识的tarball文件名，避免上轮遇到的npm缓存串包。

## 用户可见增量与验证边界

相对alpha.1的实际增量包含4档工作详情展示、文件修改工具准备进度、图片链接悬停/内联放大、Team面板实时投影及交互调整；后台包含流式取消引用保留和插件安装进程超时修复。发布说明中的更早alpha功能不重复计为本次新增。没有证据证明此前iPhone候选词确认导致输入框移位的问题已修好。

本轮完成Git同步、源码差异/合并预检、5项插件兼容断言、5项creative发布清单及Linux Office引擎断言、只读生产元数据和配置检查。没有实际合并dev、构建RC1、运行RC1 Linux服务、测试Office转换或部署my43，不能据此宣称运行验收完成。当前生产仍为20260922-017a1，dev保持93fcec43ba。后续实施应先处理生成文档冲突，再做独立home/端口回归，通过后才切换生产；既有手机调查文件不受本轮影响。

## 升级实施阶段

- [x] 合并RC1、生成文档冲突处理、聚焦测试和构建检查。
- [ ] 本地制品及隔离实例验证，真实历史副本与creative注入回归。
- [ ] 上传安装、Linux隔离Office/原生能力/Team/插件验证。
- [ ] 确认生产无活动任务，备份切换、认证与会话读回。
- [ ] 提交推送dev、更新运行约束与验收证据，等待用户人工验收。

## RC1实施中的验收发现

合并仅重生成event-producer-consumer文档，并同步中文表格与配对哈希。555项聚焦测试和外部插件13项通过；完整Node22构建、Host/Client类型检查、全库lint通过。文档检查41项通过，唯一失败是Node24工具路径缺少npm，已在完整构建后单独补跑doc-typecheck:contracts-ready并通过。SDK注入快照原先固定了旧bash超时文案、子智能体状态/tool参数及旧system/runtime-context来源和版本元数据，已审阅并刷新两份预期文件；没有改动注入文本或历史会话fixture。

本地近期9条和原旧格式9条真实历史副本均通过，源文件分别128/73个保持原样；扫描仍拒绝此前已知的5条不兼容旧日志。creative真实连续6工具调用只记录1份注入、1份system message、initial请求头。Team真实创建成员、发送消息、建立并完成任务通过，共享projection与浏览器成员/任务面板正常，插件设置开关刷新后保持。

生产未显式配置ui-chat.transcriptView；alpha.1默认compact，RC1默认standard，因此运行设置对比仅允许这一条已核实的默认值变化，其余17个namespace的既有值逐项比较。用户的显式模型配置以本轮生产快照为准，不套用旧文档中的Flash名称。Office和最终Linux制品验收仍待完成。
