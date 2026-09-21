---
name: ACLManager
description: Renamed — ACLManager is now the PolicyInformationPoint (#1431 step 8)
dateModified: '2026-09-21'
category: managers
code: src/security/PolicyInformationPoint.ts
---

# ACLManager — renamed

`ACLManager` is now the __PolicyInformationPoint__, registered as `PolicyInformationPoint` and living in `src/security/PolicyInformationPoint.ts`. It was renamed in [#1431](https://github.com/jwilleke/ngdpbase/issues/1431) step 8.

See [PolicyInformationPoint.md](PolicyInformationPoint.md).

This page used to describe page-body ACL markup, availability checks and role-based checks. All three have since been removed from it, so its old content is not kept here: it described a component that no longer behaves that way.
