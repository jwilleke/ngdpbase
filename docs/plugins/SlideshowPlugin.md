---
name: SlideshowPlugin
description: Bootstrap 5 image carousel / slideshow
dateModified: '2026-04-05'
category: plugins
code: src/plugins/SlideshowPlugin.ts
relatedModules:
  - PluginManager
version: 1.0.0
---

# SlideshowPlugin

Renders a responsive image carousel (slideshow) using Bootstrap 5's carousel
component.  Images are supplied as a comma-separated list of URLs or wiki
attachment paths.

__Source:__ `plugins/SlideshowPlugin.ts`

## Plugin Metadata

| Property | Value |
| --- | --- |
| Name | SlideshowPlugin |
| Author | ngdpbase |
| Version | 1.0.0 |
| JSPWiki Compatible | No (new plugin) |

## Usage

### Minimal

```wiki
[{SlideshowPlugin images='/attachments/photo1.jpg,/attachments/photo2.jpg'}]
```

### Full Example

```wiki
[{SlideshowPlugin images='/attachments/a.jpg,/attachments/b.jpg,/attachments/c.jpg'
                  captions='Sunset,Sunrise,Midday'
                  alts='Sunset over the lake,Sunrise in the mountains,Midday in the valley'
                  interval='3000'
                  controls='true'
                  indicators='true'
                  height='350px'
                  cssclass='my-gallery'}]
```

## Parameters

| Parameter | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `images` | string | — | __Yes__ | Comma-separated image URLs or attachment paths. |
| `captions` | string | — | No | Comma-separated captions, one per image. Shown as an overlay on medium+ screens. |
| `alts` | string | — | No | Comma-separated alt texts (accessibility). Falls back to `captions[i]` then filename. |
| `interval` | number | `5000` | No | Milliseconds between auto-advances. Set to `0` to disable autoplay. |
| `controls` | boolean | `true` | No | Show previous/next arrow buttons. `'false'` to hide. |
| `indicators` | boolean | `true` | No | Show slide-dot indicators. `'false'` to hide. |
| `height` | string | `400px` | No | CSS height of each slide image (e.g. `300px`, `50vh`). |
| `max` | number | `0` | No | Maximum number of slides to show. `0` means all. |
| `cssclass` | string | — | No | Extra CSS class added to the outer wrapper `<div>`. |

## Technical Implementation

### Output Structure

```html
<div id="ngdp-ss-N" class="carousel slide ngdp-slideshow [cssclass]"
     data-bs-ride="carousel|false">

  <!-- indicator dots (when indicators=true) -->
  <div class="carousel-indicators">
    <button ... data-bs-slide-to="0" class="active" ...></button>
    <button ... data-bs-slide-to="1" ...></button>
  </div>

  <!-- slides -->
  <div class="carousel-inner">
    <div class="carousel-item active" data-bs-interval="N">
      <img src="..." class="d-block w-100 ngdp-ss-img" alt="..."
           style="height:Npx;object-fit:cover;object-position:center;">
      <!-- optional caption block -->
      <div class="carousel-caption d-none d-md-block">
        <p>Caption text</p>
      </div>
    </div>
    ...
  </div>

  <!-- prev/next controls (when controls=true) -->
  <button class="carousel-control-prev" ...></button>
  <button class="carousel-control-next" ...></button>
</div>
```

### Unique Carousel IDs

A module-level counter increments on each `execute()` call, producing IDs
`ngdp-ss-1`, `ngdp-ss-2`, … so multiple carousels on one page each have
their own Bootstrap carousel instance.

### Autoplay

When `interval > 0` (default 5000 ms):

- `data-bs-ride="carousel"` activates Bootstrap's auto-advance.
- `data-bs-interval="N"` on each slide sets the per-slide delay.

When `interval = 0`:

- `data-bs-ride="false"` — no autoplay; user must use controls to advance.
- No `data-bs-interval` attribute is written.

### XSS Safety

| Value | Treatment |
| --- | --- |
| `images` (src) | Passed through `escapeHtml()` |
| `captions` | Passed through `escapeHtml()` |
| `alts` | Passed through `escapeHtml()` |
| `cssclass` | Passed through `escapeHtml()` |
| `height` | Non-CSS-unit characters stripped (`/[^a-zA-Z0-9.%-]/g`). No HTML entities needed — semicolons and quotes are removed before insertion into the `style` attribute. |

### `parseBool()` helper

Interprets string `'false'` or `'0'` as `false`; everything else (including
absent) uses the supplied default.  Never throws.

## Error Handling

| Condition | Output |
| --- | --- |
| `images` omitted or empty | `<span class="text-muted"><em>[SlideshowPlugin: no images provided]</em></span>` |
| Invalid `interval` (non-numeric / negative) | Falls back to `5000` ms |
| Invalid `height` value | Non-CSS-unit chars stripped; empty result falls back to `400px` |

## Tests

`plugins/__tests__/SlideshowPlugin.test.js` — 34 tests covering metadata,
missing-images guard, carousel structure, indicators, controls, interval/autoplay,
captions, alt text fallback chain, height, max parameter, cssclass,
XSS safety (src, caption, alt, cssclass, height), and unique IDs.

## Related Documentation

- [Plugin System Architecture](../architecture/Plugin-Architecture.md)
- [PluginManager](../managers/PluginManager.md)
- [pluginFormatters utility](../../src/utils/pluginFormatters.ts)

## Version History

| Version | Date | Changes |
| --- | --- | --- |
| 1.0.0 | 2026-04-05 | Initial implementation (#453) |
