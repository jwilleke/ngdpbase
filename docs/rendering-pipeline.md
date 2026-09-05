# ngdpbase Rendering Pipeline

The ngdpbase rendering system uses a sophisticated 7-phase MarkupParser pipeline that provides 100% JSPWiki compatibility while maintaining extensibility and security.

## Overview

The rendering pipeline transforms wiki markup through seven distinct phases, each handling specific aspects of content processing:

> See src/parsers/MarkupParser.js

```text
Raw Wiki Content
       ↓
Phase 1: Preprocessing
       ↓
Phase 2: Syntax Recognition
       ↓
Phase 3: Context Resolution
       ↓
Phase 4: Content Transformation
       ↓
Phase 5: Filter Pipeline
       ↓
Phase 6: Markdown Conversion
       ↓
Phase 7: Post-processing
       ↓
Final HTML Output
```

## Phase Details & Components

### Phase 1: Preprocessing

__Component__: `MarkupParser.phasePreprocessing()`
__Purpose__: Normalize content and prepare for processing

- Normalizes line endings and whitespace
- Handles character encoding
- Prepares initial parse context (`ParseContext` object)
- Sets up `context.pageName`, `context.timestamp`, `context.variables`

### Phase 2: Syntax Recognition

__Component__: `MarkupParser.phaseSyntaxRecognition()`
__Purpose__: Identify and categorize wiki syntax elements using registered handlers

__Processing__: Each handler's `process()` method is called in priority order:

- Recognizes JSPWiki plugins: `[{PluginName param=value}]`
- Identifies system variables: `[{$variablename}]`
- Detects escaped syntax: `[[{syntax}]`
- Finds wiki links, attachments, and other markup

__Handler Components__ (priority order, highest to lowest):

1. __EscapedSyntaxHandler__ (Priority: 100) - `src/parsers/handlers/EscapedSyntaxHandler.js`
   - Processes `[[{syntax}]` → `[{syntax}]` literal display
2. __WikiTagHandler__ (Priority: 95) - `src/parsers/handlers/WikiTagHandler.js`
   - Handles JSPWiki-style tags and markup
3. __PluginSyntaxHandler__ (Priority: 90) - `src/parsers/handlers/PluginSyntaxHandler.js`
   - Executes plugins via `PluginManager.execute()`
4. __WikiFormHandler__ (Priority: 85) - `src/parsers/handlers/WikiFormHandler.js`
   - Processes form elements and input handling
5. __InterWikiLinkHandler__ (Priority: 80) - `src/parsers/handlers/InterWikiLinkHandler.js`
   - Resolves links to external wikis
6. __AttachmentHandler__ — __retired ([#1231](https://github.com/jwilleke/ngdpbase/issues/1231)).__ Every `[{ATTACH …}]` form is extracted by `JSPWikiPreprocessor` before Phase 2.6, and [AttachPlugin](plugins/AttachPlugin.md) renders them all; the handler never received the syntax.
7. __WikiStyleHandler__ (Priority: 70) - `src/parsers/handlers/WikiStyleHandler.js`
   - __DEPRECATED / unregistered (#907).__ Historical string-based `%%…/%` style processor. All style markup — block classes, inline `%%(css)`, `%%sup/sub/strike` — now extracts to DOM nodes in `MarkupParser` Phase 1; see [WikiDocument guide → Style syntax is DOM-native too](WikiDocument-Complete-Guide.md#style-syntax--is-dom-native-too-907). Retained for reference only; add no new style behaviour here.
8. __WikiLinkHandler__ (Priority: 50) - `src/parsers/handlers/WikiLinkHandler.js`
   - Creates internal wiki page links

### Phase 3: Context Resolution

__Component__: `MarkupParser.phaseContextResolution()`
__Purpose__: Build relationships and resolve references

- __RenderingManager__: Provides `getLinkGraph()` for page relationships
- __VariableManager__: Resolves variable references and dependencies
- __PluginManager__: Validates plugin dependencies and parameters
- Builds context for cross-references and navigation

### Phase 4: Content Transformation

__Component__: `MarkupParser.phaseContentTransformation()`
__Purpose__: Execute plugins and transform content with HTML protection

__Sub-components__:

- __PluginManager__: Executes JSPWiki-compatible plugins
- __VariableManager__: Processes system variables like `[{$pagename}]`
- __HTML Protection System__: `MarkupParser.protectGeneratedHtml()`

#### HTML Protection System

The HTML Protection System is crucial for preventing double-encoding of generated HTML:

```javascript
// Before Protection:
content = '<img src="test.jpg" alt="Test" />'

// After Protection:
content = 'HTMLTOKEN0HTMLTOKEN'
context.protectedBlocks = ['<img src="test.jpg" alt="Test" />']
```

__Protected Elements__:

- `<ul>` and `<ol>` lists with nested `<li>` and `<a>` elements
- `<a>` anchor tags (standalone)
- `<img>` self-closing tags (from Image plugin)
- `<span>`, `<div>`, `<strong>`, `<em>`, `<code>` tags

### Phase 5: Filter Pipeline

__Component__: `MarkupParser.phaseFilterPipeline()`
__Purpose__: Apply security, validation, and content filters through FilterChain

__Main Component__: `FilterChain` orchestrates all filters

__Filter Components__ (priority order, highest to lowest):

1. __SecurityFilter__ (Priority: 110) - `src/parsers/filters/SecurityFilter.js`
   - XSS prevention and CSRF protection
   - HTML sanitization with configurable allowed tags/attributes
   - __HTMLTOKEN preservation__ for HTML Protection System integration
2. __SpamFilter__ (Priority: 100) - `src/parsers/filters/SpamFilter.js`
   - Link count limits and blacklisted domain detection
   - Content pattern matching for spam prevention
3. __ValidationFilter__ (Priority: 90) - `src/parsers/filters/ValidationFilter.js`
   - Markup syntax validation and content length limits
   - Link and image validation

#### SecurityFilter Integration

The SecurityFilter now preserves HTML protection tokens:

```javascript
// Preserve HTMLTOKEN placeholders
const htmlTokens = [];
let secureContent = content.replace(/HTMLTOKEN\d+HTMLTOKEN/g, (match) => {
  const placeholder = `SECURITYPROTECTED${htmlTokens.length}SECURITYPROTECTED`;
  htmlTokens.push(match);
  return placeholder;
});

// Apply security filtering...

// Restore HTMLTOKEN placeholders
secureContent = secureContent.replace(/SECURITYPROTECTED(\d+)SECURITYPROTECTED/g, (match, index) => {
  return htmlTokens[parseInt(index)] || match;
});
```

### Phase 6: Markdown Conversion

__Component__: `MarkupParser.phaseMarkdownConversion()`
__Purpose__: Convert remaining markdown to HTML

__Sub-components__:

- __Showdown.js__: Third-party markdown processor
- __Markdown Extensions__: Custom extensions for wiki-specific syntax
- __Configuration__: Uses `this.config.markdown` settings

__Processing__:

- Converts standard markdown syntax (headers, lists, links, etc.)
- Preserves HTMLTOKEN placeholders during conversion
- Applies markdown extensions for enhanced functionality

### Phase 7: Post-processing

__Component__: `MarkupParser.phasePostProcessing()`
__Purpose__: Final HTML cleanup and token restoration

__Sub-components__:

- __HTML Token Restoration__: `MarkupParser.restoreProtectedHtml()`
- __Link Processing__: Finalizes link attributes and CSS classes
- __HTML Cleanup__: `MarkupParser.cleanupGeneratedHtml()`

__Processing Steps__:

1. __Token Restoration__: Replaces HTMLTOKEN placeholders with original HTML
2. __Link Finalization__: Adds proper CSS classes to wiki links
3. __HTML Normalization__: Removes processing artifacts
4. __Final Validation__: Ensures clean, valid HTML output

```javascript
// Token Restoration Example:
processedContent = processedContent.replace(/HTMLTOKEN(\d+)HTMLTOKEN/g, (match, index) => {
  return context.protectedBlocks[parseInt(index)] || match;
});
```

## JSPWiki Compatibility Features

### Plugin System

- __Normal Execution__: `[{Image src='test.jpg' alt='Test'}]` → `<img src="test.jpg" alt="Test" class="wiki-image" />`
- __Escaped Syntax__: `[[{Image src='test.jpg' alt='Test'}]` → `[{Image src='test.jpg' alt='Test'}]` (literal)

### System Variables

- `[{$pagename}]` - Current page name
- `[{$totalpages}]` - Total number of pages
- `[{$uptime}]` - Server uptime
- `[{$applicationname}]` - Application name
- `[{$baseurl}]` - Base URL
- `[{$timestamp}]` - Current ISO timestamp

### Supported Plugins & Components

- __Image__ (`plugins/ImagePlugin.js`): Display images with customizable attributes
- __SessionsPlugin__ (`plugins/SessionsPlugin.js`): Show active session count via UserManager
- __TotalPagesPlugin__ (`plugins/TotalPagesPlugin.js`): Display total page count via PageManager
- __UptimePlugin__ (`plugins/UptimePlugin.js`): Show server uptime from process statistics
- __ReferringPagesPlugin__ (`plugins/referringPagesPlugin.js`): List pages that reference current page via RenderingManager.getLinkGraph()

## Configuration

The rendering pipeline is configured through `app-default-config.json` and can be overridden in `app-custom-config.json`:

```json
{
  "ngdpbase": {
    "markup": {
      "enabled": true,
      "useAdvancedParser": true,
      "handlers": {
        "plugin": { "enabled": true },
        "variable": { "enabled": true },
        "wikilink": { "enabled": true },
        "escaped": { "enabled": true }
      },
      "filters": {
        "enabled": true,
        "security": {
          "preventXSS": true,
          "sanitizeHTML": true,
          "allowedTags": "a,img,ul,ol,li,p,br,strong,em,code,pre,blockquote,h1,h2,h3,h4,h5,h6,hr,table,thead,tbody,tr,th,td",
          "allowedAttributes": "href,src,alt,title,class,id"
        }
      }
    }
  }
}
```

## Performance Features

### Caching System

The pipeline includes multi-level caching:

- __Parse Results Cache__: TTL 300s
- __Handler Results Cache__: TTL 600s
- __Pattern Cache__: TTL 3600s
- __Variable Cache__: TTL 300s

### Performance Monitoring

Tracks key metrics with configurable alerts:

- Parse time threshold: 100ms
- Cache hit ratio minimum: 60%
- Error rate maximum: 5%

## Architecture Benefits

### Modularity

Each phase is independent and configurable, allowing for:

- Easy extension with new handlers
- Granular feature control
- Custom filter development

### Security

Multi-layered security approach:

- HTML sanitization in SecurityFilter
- XSS prevention at multiple levels
- Content validation throughout pipeline

### Extensibility

- Plugin system for custom functionality
- Handler priority system for processing order
- Filter chain for content processing
- Configuration override system

## Error Handling

The pipeline includes comprehensive error handling:

- Graceful degradation when handlers fail
- Detailed error logging with context
- Fallback to legacy renderer when needed
- Security violation logging and alerts

## Integration Points

### Link Graph

Maintains relationships between pages for:

- ReferringPagesPlugin functionality
- Orphaned page detection
- Navigation assistance

### Search Integration

Pipeline output feeds into search indexing for:

- Full-text search capabilities
- Metadata extraction
- Content categorization

This rendering pipeline provides a robust, secure, and extensible foundation for JSPWiki-compatible wiki markup processing while maintaining high performance and comprehensive feature support.

## Component Integration Diagram

```text
MarkupParser (Main Controller)
├── Phase 1: phasePreprocessing()
├── Phase 2: phaseSyntaxRecognition()
│   ├── EscapedSyntaxHandler
│   ├── WikiTagHandler
│   ├── PluginSyntaxHandler → PluginManager.execute()
│   ├── WikiFormHandler
│   ├── InterWikiLinkHandler
│   ├── WikiStyleHandler
│   └── WikiLinkHandler
├── Phase 3: phaseContextResolution()
│   ├── RenderingManager.getLinkGraph()
│   ├── VariableManager
│   └── PluginManager
├── Phase 4: phaseContentTransformation()
│   ├── PluginManager.execute()
│   ├── VariableManager.expandVariables()
│   └── protectGeneratedHtml()
├── Phase 5: phaseFilterPipeline() → FilterChain
│   ├── SecurityFilter (with HTMLTOKEN preservation)
│   ├── SpamFilter
│   └── ValidationFilter
├── Phase 6: phaseMarkdownConversion() → Showdown.js
└── Phase 7: phasePostProcessing()
    ├── restoreProtectedHtml()
    └── cleanupGeneratedHtml()
```
