# Emoji Shortcodes

__Issue:__ #512  
__Commit:__ 50768cf8

## Overview

Emoji shortcodes let users type `:shortcode:` syntax in wiki content and have it converted to the corresponding Unicode emoji character at render time. The feature has two UI entry points — inline autocomplete in the editor textarea, and a modal picker triggered from the toolbar.

## Architecture

### Server-side conversion (MarkupParser step 0.7)

`src/parsers/MarkupParser.ts` runs shortcode conversion as __step 0.7__, after code-block extraction (step 0.5) and before all other markup processing. This ordering ensures that content inside backtick spans and fenced code blocks is never touched.

```
step 0.5 — extract code blocks / backtick spans (protected from all further processing)
step 0.7 — convertEmojiShortcodes() replaces :name: → Unicode
step 1+  — normal JSPWiki / Markdown markup processing
```

The conversion is a single `String.replace()` pass using `EMOJI_SHORTCODE_REGEX`:

```typescript
// src/parsers/data/emoji-map.ts
export const EMOJI_SHORTCODE_REGEX = /:([a-z0-9_+-]+):/g;

export function convertEmojiShortcodes(text: string): string {
  return text.replace(EMOJI_SHORTCODE_REGEX, (match, name) => EMOJI_MAP[name] ?? match);
}
```

Unknown shortcodes are left unchanged (the `?? match` fallback).

### Emoji map

`src/parsers/data/emoji-map.ts` is the single source of truth for the server side. It exports:

- `EMOJI_MAP` — frozen `Record<string, string>` mapping shortcode names to Unicode characters (~170 entries across five categories)
- `EMOJI_SHORTCODE_REGEX` — the regex used by the converter
- `convertEmojiShortcodes()` — the converter function

### Config flag

Shortcode conversion is enabled by default and can be disabled per-instance:

```json
"ngdpbase.markup.emoji.enabled": false
```

When disabled, `MarkupParser` skips step 0.7 entirely.

### Client-side autocomplete

`public/js/emoji-autocomplete.js` handles inline autocomplete in the editor textarea. It is a self-contained ES5 module (no bundler dependency) that:

1. Listens for `:` typed in the content textarea
2. Filters `EMOJI_CLIENT_DATA` (a local copy of shortcode data) against the typed fragment
3. Renders a positioned dropdown at the cursor using the same DOM pattern as `PageAutocomplete`
4. On selection, replaces the `:fragment` with the full `:shortcode:` text (the server then converts it on save/preview)

`EMOJI_CLIENT_DATA` is a parallel array to `EMOJI_MAP` — each entry is `[shortcode, char, category]`. __Both must be kept in sync.__ When you add a shortcode to `EMOJI_MAP`, add the matching entry to `EMOJI_CLIENT_DATA`.

### Picker modal

The emoji picker modal lives in `views/edit.ejs`. It renders a Bootstrap modal with emoji grouped by category. Each emoji button inserts `:shortcode:` at the cursor. The modal is triggered by a toolbar button (smiley-face icon) wired in the same file.

## Adding New Shortcodes

1. Add the entry to `EMOJI_MAP` in `src/parsers/data/emoji-map.ts`:

   ```typescript
   saluting_face: '🫡',
   ```

2. Add the matching entry to `EMOJI_CLIENT_DATA` in `public/js/emoji-autocomplete.js`:

   ```javascript
   ['saluting_face', '🫡', 'smileys'],
   ```

3. If the emoji belongs in the picker modal, add it to the appropriate category section in `views/edit.ejs`.

No build step is needed for the client-side data — `emoji-autocomplete.js` is served as a static file.

## File Map

| File | Role |
| --- | --- |
| `src/parsers/data/emoji-map.ts` | Server-side shortcode map and converter (source of truth) |
| `src/parsers/MarkupParser.ts` | Calls `convertEmojiShortcodes()` at step 0.7 |
| `public/js/emoji-autocomplete.js` | Client-side inline autocomplete (editor textarea) |
| `views/edit.ejs` | Picker modal HTML + toolbar button wiring |

## Testing

`src/parsers/__tests__/MarkupParser-emoji.test.ts` covers:

- Known shortcodes are converted
- Unknown shortcodes are left unchanged
- Content inside backtick spans is not converted
- Content inside fenced code blocks is not converted
- Conversion is skipped when `ngdpbase.markup.emoji.enabled` is false

## Related

- [Page Link Autocomplete](./PageLinkAutocomplete.md) — same dropdown pattern used for page-link and emoji autocomplete
- [MarkupParser](../parsers/MarkupParser.md) — full parser step reference
- End-user documentation: __Using Emoji__ (required page `7720bf08-0b25-4119-a7ba-3713045558f4`)
