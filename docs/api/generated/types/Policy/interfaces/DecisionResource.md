[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Policy](../README.md) / DecisionResource

# Interface: DecisionResource

Defined in: src/types/Policy.ts:111

The thing a decision is about.

Deliberately NOT a page name. The policies have always modelled resources as
`{ type, pattern }` — `ShareResource` says so in as many words: "Resource
type the evaluator knows: page, media, …" — while the call that asked for a
decision flattened it to a page name, which is why assets, media and
attachments each grew their own path.

Deliberately not the domain object either. A decision takes a REFERENCE, so
the PDP answers without loading anything — including when the answer is a
flat no. An `AssetRecord` or a page's frontmatter is an ATTRIBUTE source: a
PIP supplies it, and only when a policy actually depends on it. Passing the
record would make every caller load it first, teach the PDP about each
domain type in turn, and need a signature per type.

## Properties

### id

> __id__: `string`

Defined in: src/types/Policy.ts:130

Which one. A page's name or uuid; an asset's id.

An asset is identified by `id` AND `providerId` (`types/Asset.ts`), so a
reference to one must be provider-qualified or it is ambiguous.

***

### type

> __type__: `string`

Defined in: src/types/Policy.ts:123

The kind of thing. This is the __permission target__ — the left half of
every permission name: `page`, `asset`, `user`, `admin`, `comment`,
`profile`, `search`, `share`, `store`, `token`. One vocabulary, declared
once, rather than a second taxonomy beside the registry.

Two inconsistencies to settle as resources start being used (#1431):
shipped policies name only `page`, even on grants like `token-mint` and
`user-edit`, so the clause is decorative for nine targets; and shares use
`media` (`types/Share.ts`) where the permissions use `asset`.
