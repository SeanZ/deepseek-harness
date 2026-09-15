---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-15-my43-request-injections

[English](2026-09-15-my43-request-injections.md) | 中文

## 概述

将 dev 分支已有的 request/injections 事件登记到新版上游持久类型历史。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-09-15-my43-request-injections
baseline: false
changes:
  - root: "event:request/injections"
    previous: null
    after: "c4e08977eb72fc08d58f827cc9c5b302ef39632dd32c3bc9ca7b71e907a0ced7"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

该事件携带完整的请求专用注入快照。已有补丁版 V3 会话无需改写事件即可读取。未识别该事件的官方构建会拒绝相应日志；回退必须保留数据及补丁版制品。现有事件载荷没有变化。

<a id="verification"></a>
## 验证

Session、agent-loop 请求注入、token-meter、preset 和迁移回归共650项通过；Messages及图片卸载回归共153项通过。

<a id="dev-note"></a>
## 开发备注

无。
