[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / AUDIT\_RESULTS

# Variable: AUDIT\_RESULTS

> `const` __AUDIT\_RESULTS__: readonly \[`"success"`, `"failure"`, `"allow"`, `"deny"`, `"error"`, `"logout"`\]

Defined in: src/utils/auditEvents.ts:67

The result vocabulary, as a runtime value (#1237).

The type alone could not be offered as filter options, so the audit page
hand-kept its own list — and it offered `allow`, `deny`, `error` while the
log holds `success` (5,859), `deny` (896) and `failure` (79). Two of the
three options matched zero records and the largest value was unfilterable.
Exactly the #1115 failure, one field over.
