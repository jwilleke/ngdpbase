[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / AuditRecordOutcome

# Type Alias: AuditRecordOutcome

> __AuditRecordOutcome__ = `"recorded"` \| `"not-enabled"` \| `"no-sink"` \| `"dropped"`

Defined in: src/utils/auditEvents.ts:437

What became of a record (#1205). Never silent: a caller can tell "recorded"
from "switched off in configuration" from "no sink on this instance".

- `recorded`    — the sink accepted it (and, for a refuse-on-failure event, flushed it)
- `not-enabled` — `enabled: false` in `ngdpbase.audit.events`; a decision on the record
- `no-sink`     — auditing is off or not yet initialised; visible through #1118's posture
- `dropped`     — the sink failed on a continue-on-failure event; counted in the drop statistics

An event declared on-failure: refuse that cannot be recorded does not
return: it throws, so the caller abandons the action.
