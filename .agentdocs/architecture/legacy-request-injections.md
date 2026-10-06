# 已退役的私有请求注入格式记录

该记录属于 fork 的私有扩展，不属于官方格式验收基线。dev 切回固定官方核心后，它不再参与当前核心的持久化类型比较；原始记录和完整类型快照保留如下。生产旧日志仍需旧运行时读取后离线导出，不能直接交给官方读取器。

## 原文件 2026-09-15-my43-request-injections.zh.md

````markdown
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

````

## 原文件 2026-09-15-my43-request-injections.schema.json

````json
{
  "formatVersion": 1,
  "roots": [
    {
      "key": "event:request/injections",
      "kind": "event",
      "event": "request/injections",
      "surface": false,
      "digest": "c4e08977eb72fc08d58f827cc9c5b302ef39632dd32c3bc9ca7b71e907a0ced7",
      "schema": {
        "root": 0,
        "nodes": [
          {
            "kind": "object",
            "properties": [
              {
                "name": "data",
                "type": 1,
                "optional": false
              },
              {
                "name": "ignorable",
                "type": 14,
                "optional": true
              },
              {
                "name": "seq",
                "type": 9,
                "optional": false
              },
              {
                "name": "time",
                "type": 9,
                "optional": false
              },
              {
                "name": "type",
                "type": 15,
                "optional": false
              }
            ],
            "indices": []
          },
          {
            "kind": "object",
            "properties": [
              {
                "name": "injections",
                "type": 2,
                "optional": false
              }
            ],
            "indices": []
          },
          {
            "kind": "array",
            "element": 3
          },
          {
            "kind": "object",
            "properties": [
              {
                "name": "key",
                "type": 4,
                "optional": false
              },
              {
                "name": "placement",
                "type": 5,
                "optional": false
              },
              {
                "name": "role",
                "type": 11,
                "optional": false
              },
              {
                "name": "source",
                "type": 12,
                "optional": false
              },
              {
                "name": "text",
                "type": 4,
                "optional": false
              }
            ],
            "indices": []
          },
          {
            "kind": "primitive",
            "type": "string"
          },
          {
            "kind": "union",
            "types": [
              6,
              8
            ]
          },
          {
            "kind": "object",
            "properties": [
              {
                "name": "kind",
                "type": 7,
                "optional": false
              }
            ],
            "indices": []
          },
          {
            "kind": "literal",
            "value": "before-latest-user"
          },
          {
            "kind": "object",
            "properties": [
              {
                "name": "depth",
                "type": 9,
                "optional": false
              },
              {
                "name": "kind",
                "type": 10,
                "optional": false
              }
            ],
            "indices": []
          },
          {
            "kind": "primitive",
            "type": "number"
          },
          {
            "kind": "literal",
            "value": "depth"
          },
          {
            "kind": "literal",
            "value": "assistant"
          },
          {
            "kind": "object",
            "properties": [
              {
                "name": "kind",
                "type": 13,
                "optional": false
              },
              {
                "name": "plugin",
                "type": 4,
                "optional": false
              }
            ],
            "indices": []
          },
          {
            "kind": "literal",
            "value": "plugin"
          },
          {
            "kind": "literal",
            "value": true
          },
          {
            "kind": "literal",
            "value": "request/injections"
          }
        ]
      }
    }
  ],
  "types": []
}

````

## 原文件 2026-09-15-my43-request-injections.i18n.yaml

````yaml
# Bilingual-pair consistency record for 2026-09-15-my43-request-injections.md (docs/i18n/README.md): per heading
# section, a hash of its English and Chinese blocks outside code blocks and generated regions.
# After editing either side, bring the other along and re-record with:
#   pnpm run verify-translation-pairing --write docs/persistence-changes/2026-09-15-my43-request-injections.md
/:
  en: 3d5a424ae7d7e46b
  zh: c22a8e4a62d8cc1a
/2026-09-15-my43-request-injections:
  en: 5caa8a7829ccbe91
  zh: 5c3f63735a10cc82
/2026-09-15-my43-request-injections/summary:
  en: aa8e41549dd91ee1
  zh: 37ae9acdbbad8d4e
/2026-09-15-my43-request-injections/table-of-contents:
  en: 6cf314a069ceb451
  zh: 9adff678e9ecab3b
/2026-09-15-my43-request-injections/declaration:
  en: 6907136f28e48c90
  zh: 02f8298485f3d8e7
/2026-09-15-my43-request-injections/compatibility:
  en: 9dd88d1dbaed716d
  zh: 4cad3311bd326826
/2026-09-15-my43-request-injections/verification:
  en: d2d1fc47e0e3cd9d
  zh: 375e22da2ef1b3e1
/2026-09-15-my43-request-injections/dev-note:
  en: b75c8458928b72b9
  zh: 003ba4e17b4b5269

````

## 原文件 2026-09-15-my43-request-injections.md

````markdown
---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-15-my43-request-injections

English | [中文](2026-09-15-my43-request-injections.zh.md)

## Summary

Records the existing dev-branch request/injections event in the new upstream persistence type history.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

The optional event type carries a complete request-only injection snapshot. Existing patched V3 sessions remain readable without rewriting events. Official builds without this event refuse logs that contain it; reverting requires preserved data and the patched release. No existing event payload changes.

<a id="verification"></a>
## Verification

Session, agent-loop request injection, token-meter, preset and migration regressions: 650 tests passed; Messages and image-offload regressions: 153 tests passed.

<a id="dev-note"></a>
## Dev Note

None.

````
