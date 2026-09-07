---
name: Audit developer guide
description: How to add or change an audit event — the configuration entry, the names module, the emitter, the on-failure rule, the actor, the tests, and the checks that fail
dateModified: 2026-09-06
category: guides
relatedModules: [AuditManager, FileAuditProvider]
---

# Audit developer guide

What a developer has to do so that an action leaves a record. The decisions behind this are in [audit-posture.md](../audit-posture.md); this page is the practice.

## The three parts of an event

| Part | Where | Owns |
| --- | --- | --- |
| The declaration | `ngdpbase.audit.events` in `config/app-default-config.json` | The name, `on-failure` (`refuse` or `continue`), `enabled`, `description`. Configuration is authoritative; an operator may change any of it and the change is itself recorded. |
| The name in code | `src/utils/auditEventNames.ts` | Every name the code may emit, once, typed. `AuditEvent.eventType` is `AuditEventName`, so a typo or an undeclared name does not compile. |
| The emitter | The manager door for the action, or the route only where no manager can tell the action apart (`page-read`, `page-export`, `secret-reveal`) | Building the record and calling `recordAuditEvent`. |

`npm run lint:audit` holds the three together: an emitted name with no declaration, a declared and enabled name nobody emits, a name outside `{target}-{action}`, or an emitter the script cannot resolve is red. `npm run docs:audit:check` holds the generated tables to the map. Both run in `lint`, `lint:ci` and the pre-commit hook.

## Adding an event

1. __Name it__ `{target}-{action}`, hyphens only. Where the action is the one a permission authorizes, use the permission's slug: `page-read` authorizes, `page-read` records. Never a dot, never an underscore, never a role name.
2. __Declare it__ in `ngdpbase.audit.events`: `on-failure`, `enabled` if it should ship switched off, `description` (one line, shown in the admin filter). Same change as the emitter, never a later one.
3. __List it__ in `AUDIT_EVENT` in `auditEventNames.ts`. The key is the name upper-cased with underscores; a test holds the module equal to the map in both directions.
4. __Emit it__ through `recordAuditEvent(sink, event, onError)`, where the sink is `engine.getManager('AuditManager')`. Never call `logAuditEvent` directly: that skips the `enabled` switch, the on-failure rule and the outcome.
5. __Decide `on-failure`.__ `refuse` means the action must not complete unless the record does: record first, then act, so a failed record refuses the action rather than leaving it done and unrecorded (`AgentTokenManager.mint`, `ShareManager.issue`, `UserManager.deleteUser` are the pattern). `continue` means the action proceeds and the loss is counted. This is failure handling, not importance; importance is `severity` on the record.
6. __Carry the actor.__ The record's `user` and `ipAddress` come from the context the caller was given ([security-posture.md](../security-posture.md) P1). Where nothing was given, say so: `user: 'unknown'` and `actorMissing: true` in metadata. Never invent an identity from imported content or a default.
7. __Record names, never values.__ A password field changed is `fields: ['password']`; a secret revealed is the key, not the value; an audit export is who, format and filter, never the content.
8. __Regenerate the docs__: `npm run docs:audit`.
9. __Test it, then sabotage it.__ One test that the record is written with the actor and the metadata; for `refuse`, one that a failing sink refuses the action and leaves the state untouched. Then break the emitter on purpose and watch the test go red before trusting it; write what you broke in the test's comment.

## What `recordAuditEvent` returns

| Outcome | Meaning |
| --- | --- |
| `recorded` | The sink accepted it; for a `refuse` event, flushed to the device first |
| `not-enabled` | `enabled: false` in configuration — a decision on the record |
| `no-sink` | Auditing is off or not yet initialised; visible in the audit posture |
| `dropped` | A `continue` event the sink refused; counted and surfaced on the dashboard |

A `refuse` event that cannot be recorded does not return; it throws, and the caller must let that propagate.

## How you know you are done

```bash
npm run lint:audit
npm run docs:audit:check
npm run audit:coverage
npm run audit:verify
```

At boot the log says which provider loaded and whether the posture changed since the previous start; `/admin/audit` lists every declared event in its filter.

## See also

- [audit-posture.md](../audit-posture.md)
- [security-developer-guide.md](security-developer-guide.md)
- [AuditManager](../managers/AuditManager.md)
- `src/utils/auditEventNames.ts`, `src/utils/auditRegistry.ts`

## Known gaps

- [#1209](https://github.com/jwilleke/ngdpbase/issues/1209)
- [#1237](https://github.com/jwilleke/ngdpbase/issues/1237)
