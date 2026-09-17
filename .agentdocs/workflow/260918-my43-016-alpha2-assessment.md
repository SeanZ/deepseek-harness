# 0.1.6-alpha.2 升级评估

## 范围与阶段

用户已授权尝试升级 my43；iPhone 问题明确不纳入本次验收。按本地适配与验证→本地构建制品→Linux隔离验证→一致备份与生产切换推进，沿用 dev 的 commit/push 约定。Caddy、Authelia、模型和生产数据保持既有约束。

- [x] 获取官方发布标签并核对 fork / upstream master。
- [x] 比较手机输入与布局、creative、请求注入、插件接口、历史与制品边界。
- [x] 核对远端实际插件插槽，给出升级前必做项。
- [x] 阶段一：合并固定alpha2标签，解决生成目录冲突，适配creative和unrestricted源码/制品。
- [x] 阶段二：核心注入、历史迁移、插件启停/设置、SDK及真实creative请求、页面/终端回归；lint、类型和文档检查。
- [ ] 阶段三：commit，本地正式构建与打包，Linux npm隔离安装；Office、PTY、认证、历史及产物一致性验收。
- [ ] 阶段四：确认无运行会话，备份与切换生产，回读服务、认证、数据和插件状态；push dev，等待用户页面验收。

## 固定版本与合并结果

官方标签 dsh-v0.1.6-alpha.2 为 ddefc45fbc；2026-09-18 本轮 fetch 后 origin/master 和 upstream/master 均指向此标签。评估起点为 dev c90b2d7361，此前产品补丁提交194d2b5603；合并与正式构建提交为56de5799d8。两个官方标签之间2622文件变化，含大量生成目录、版本与文档，不能将此数量理解为独立功能数。

`git merge-tree --write-tree HEAD dsh-v0.1.6-alpha.2` 返回冲突；冲突位于持久类型/事件目录、翻译记录及仓库引用检查测试。核心源码未发生文本冲突。预合并树314ffc755596e85c790e437e1f89ebb51397b0f6仅用于审计，含冲突内容，不可运行或交付。

核心 agent.ts、session surface.ts、token-meter index/projection、session-persistence-jsonl index 的 alpha1→alpha2 上游内容未变，预合并结果也与 patched HEAD 相同。agent-loop index另增加Inbox projection注册。此证据仅表明补丁仍保留，不替代运行测试；新版Inbox恢复、provider Messages历史参数容错、客户端会话多实例仍需回归。

## 必须适配的自用项

预合并组合经 YAML 结构比较确认 creative 与 standard 不再相等：standard 新增 `tool-plugin-manager`，入口 `@deepseek-ai/dsh-plugin-manager/tools`，默认 disabled:true。同步时保留默认关闭，避免无意给 creative 开放安装插件的工具。官方 Creator（cordis preset）改用持久插件管理，与自用 creative 不是同一个预设。

远端 systemctl dsh 为 active，current 仍为20260915-alpha1-prompt-fix。实际加载的 dsh-unrestricted 0.3.0 client bundle包含 `settings.plugin.item`；alpha2 已移除该插槽声明/消费入口。其配置卡片必须改用新版合适入口；外部 bundle优先评估 `plugins.bundle.config`（按包名）或 `plugins.row.config`（按包名#行id），不要机械注册进面向官方配置项的 `plugins.item`。源码与发布bundle一起适配，覆盖显示、读写和卸载重载。此界面不兼容不等同主机注入失效，主机注入仍需独立测试。

alpha2 默认 profile resolutionMode=runtime，并引入插件管理、热卸载与重组。必须验证 file依赖安装副本、插件依赖声明、外部unrestricted和scheduled-tasks实际加载、重复启停无残留；此前仅检查共享node_modules软链接的验收不足以证明新解析正常。vendor/loader与logger也变更，构建不能复用旧vendor当作完整新版。

## 手机问题证据边界

`compositionend` 内 `editor.update(() => {}, { onUpdate: syncComposition })` 保留；该文件主要新增Shift+Tab菜单退出分流，未撤回候选确认更新。alpha2 packages/client自有源码仍无visualViewport处理。全局height基础规则未改为键盘可见高度协同方案。

新版有会话宽度拖拽热区由40px缩至10px、层级下移、新建会话保留导航按钮、上下文计量移到输入框底部等改动，不能据此声称修复iPhone候选确认后输入框下沉。用户此前问题在桌面Chromium/WebKit模拟未复现，真机最终验证仍必需。本轮未重复模拟或安装手机插件。

## 数据、部署和页面体验

新增回合文件改动卡片及逐文件审阅，默认web组合加载workspace-changes，产生未标记ignorable的workspace/changes事件；alpha1已知事件集合没有该类型，既有读取器拒绝未知required事件。虽然结构版本仍V3，新增日志不能保证直接由alpha1继续读取。升级前保留一致快照与新写入日志，不能承诺仅切回current无损回滚。

新增插件管理页、Office预览、右侧浏览器页、子Agent会话页、计划预览、工作区目录树分组、右栏布局持久化和终端重连改进。浏览器页是客户端iframe，不代理目标；手机输入127.0.0.1指向手机，而非my43，受目标站点嵌入策略限制。不能作为服务器本地服务代理方案。

Office provider依赖libreoffice-kit 0.0.1；本标签平台决策说明当前Linux选WASM，不能打包macOS原生引擎上传Linux。默认2并发、结果缓存128MiB等应用层限制不包含引擎RSS，在4GB主机需对实际Office文件做内存与耗时验证，可据结果调整并发。

Web用户终端调整为系统用户权限，独立于Agent沙箱。host/webserver与credentials源码在本次标签间未变，但CLI启动/profile加载及新增远端API仍须在真实制品上验证Caddy→Authelia→bootstrap→cookie，沿用现有公网保护，不加免鉴权入口。

内置模型列表移除V4 Flash与Vision Exp，保留V4 Pro；线上此前显式settings需在实施时再次读回，不能覆盖用户模型配置。

## 实施前的静态审计范围

已执行Git fetch、标签/分支核对、merge-tree合并预检、5个关键文件逐内容比较、creative/standard YAML结构比较、远端插件安装副本与服务状态只读核验。这一静态审计阶段未运行alpha2单元/集成测试、构建或浏览器；随后实施验证见下节。保留本轮之前已有mobile调查文档及index改动，不归档尚未验收的手机任务。

## 本地实施证据

合并已完成代码适配，未提交时先完成普通构建。核心首轮160项通过，仓库引用检查11项通过；扩展回归2426项通过，剩余终端bundle测试在构建后通过，插件管理真实安装测试固定可执行pnpm11.7.0后通过。Corepack在临时目录默认选择10.34.5，Homebrew还有9.14.4，测试必须显式选本任务toolbin中的pnpm.mjs；不能把旧版本结果当成产品失败。上游已补齐webworker夹具的get方法，删除本分支合并产生的重复字段。

unrestricted13项通过，类型检查通过，新入口测试用旧线上bundle作负对照失败、新bundle通过。全构建、lint通过；doc-sync39项通过，另外两项为生成事件表中英同步与架构文档超2词，修复后分别复验通过。TypeScript SDK快照和Python SDK注入/请求/通知/持久化夹具通过。真实V4 Pro/Low完成六次文件读取、一个initial头、一份system和一份注入。页面验证新版配置卡片可见，设置开关写入及刷新持久化通过，页面错误为零；实际组合两轮卸载/重载通过。Linux制品和真实历史样本阶段尚在进行。


## Linux 隔离验收进展

正式核心制品提交56de5799d8已push dev。首次304包4668文件一致，Linux原生文件锁、koffi、PTY和ripgrep通过；landlock为既有partial能力。复制113个生产日志文件，前后哈希一致。旧格式9样本迁移和近期三个工作区各3样本追加重开全部通过，近期含用户指明的session-84e60464；5条已有不支持旧格式记录保持原件，未修写。

真实creative六次读取通过：一个initial头、一份system、一份注入。unrestricted两轮卸载/重载通过。页面配置开关与刷新持久化通过，原生终端输入及刷新同一PID/环境保留通过。定时任务客户端首次失败与真实执行返回events不可迭代已定位并适配；最终插件包0.2.4+my43.alpha2.1待再次真实执行验收。最终安装库存增加到305包4709文件，制品一致性需在最后一次插件替换后复验。

Office已验证WASM转换、缓存复用、共享Remote文件读取和PDF返回；实际图片验收发现中文缺字，补装Noto CJK与fontconfig后画面正常。profile限制Office并发1。安装内存限制、失败残留与锁文件流程见架构文档；当前生产尚未切换。
