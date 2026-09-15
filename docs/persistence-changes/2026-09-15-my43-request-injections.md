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
