[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / converters/ncm/fix/jspwikiInsert

# converters/ncm/fix/jspwikiInsert

JSPWiki's long plugin form → the short one (#1342).

JSPWiki accepts `[{INSERT Name WHERE a=1}]`, with `INSERT` and `WHERE`
optional, and a plugin named by its class in the default package,
`org.apache.wiki.plugin.Name`. Ours reads the first word as the plugin
name, so `[{INSERT CurrentTimePlugin …}]` renders nothing (a plugin called
INSERT) and `[{org.apache.wiki.plugin.RecentChangesPlugin}]` is "not
found". Both become `[{Name a=1}]`. Only the call's head changes; its
parameters are left as written.

Deliberately narrow:

- only the `org.apache.wiki.plugin.` package, the one JSPWiki searches by
    default; any other package names a plugin we do not have;
- an escaped call, `[[{INSERT …}]`, is an example and stays;
- never in code, an HTML block or an inline code span.

## Variables

- [jspwikiInsert](variables/jspwikiInsert.md)
