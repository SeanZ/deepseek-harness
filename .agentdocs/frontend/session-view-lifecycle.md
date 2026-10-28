# 会话视图与绑定生命周期

`ui-conversation` 收集的 Provider 绑定不一定仍是 Session Controller 的当前绑定。Controller 在引用释放时同步撤销所有权，Provider 的 effect 清理随后完成；同一会话 ID 也可以在旧绑定清理结束前产生新绑定。

视图注册、语言或开发者设置变更触发刷新时，仅当 `sessions.binding(binding.sessionId) === binding` 才恢复该绑定的视图。仅检查会话 ID 存在不足以区分同 ID 的新旧绑定。Provider 集合仍由原来的 effect 回收，不另加延时或第二套所有权状态。

`UiConversation.binding` 对未知会话继续保持显式报错；刷新入口负责排除已经失去所有权的绑定，不在底层查询中吞掉真实错误。修复不改变持久化内容、会话引用计数、有效会话的视图选择或模型行为。

回归由 `packages/client/ui-conversation/tests/apply-wiring.client.spec.tsx` 覆盖释放中、同 ID 替换和有效绑定，使用真实插件装配与测试运行时的引用生命周期。完整宿主浏览器恢复另行验证，组件测试不能代替安装制品验收。
