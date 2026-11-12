[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/data/emoji-map](../README.md) / EMOJI\_MAP

# Variable: EMOJI\_MAP

> `const` __EMOJI\_MAP__: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: src/parsers/data/emoji-map.ts:12

Emoji shortcode map for MarkupParser Step 0.7 (Issue #512)

Keys are shortcode names (without colons).
Values are Unicode emoji characters — no image assets needed.
Shortcode names follow the de-facto standard used by GitHub, Slack, and Twemoji.

To add emojis: extend EMOJI_MAP here AND add matching entries to
EMOJI_CLIENT_DATA in public/js/emoji-autocomplete.js (client-side picker).
