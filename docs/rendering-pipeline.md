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

**Component**: `MarkupParser.phasePreprocessing()`
**Purpose**: Normalize content and prepare for processing

- Normalizes line endings and whitespace
- Handles character encoding
- Prepares initial parse context (`ParseContext` object)
- Sets up `context.pageName`, `context.timestamp`, `context.variables`

### Phase 2: Syntax Recognition

**Component**: `MarkupParser.phaseSyntaxRecognition()`
**Purpose**: Identify and categorize wiki syntax elements using registered handlers

**Processing**: Each handler's `process()` method is called in priority order:

- Recognizes JSPWiki plugins: `[{PluginName param=value}]`
- Identifies system variables: `[{$variablename}]`
- Detects escaped syntax: `[[{syntax}]`
- Finds wiki links, attachments, and other markup

**Handler Components** (priority order, highest to lowest):

1. **EscapedSyntaxHandler** (Priority: 100) - `src/parsers/handlers/EscapedSyntaxHandler.js`
   - Processes `[[{syntax}]` → `[{syntax}]` literal display
2. **WikiTagHandler** (Priority: 95) - `src/parsers/handlers/WikiTagHandler.js`
   - Handles JSPWiki-style tags and markup
3. **PluginSyntaxHandler** (Priority: 90) - `src/parsers/handlers/PluginSyntaxHandler.js`
   - Executes plugins via `PluginManager.execute()`
4. **WikiFormHandler** (Priority: 85) - `src/parsers/handlers/WikiFormHandler.js`
   - Processes form elements and input handling
5. **InterWikiLinkHandler** (Priority: 80) - `src/parsers/handlers/InterWikiLinkHandler.js`
   - Resolves links to external wikis
6. **AttachmentHandler** (Priority: 75) - `src/parsers/handlers/AttachmentHandler.js`
   - Processes file attachments and media
7. **WikiStyleHandler** (Priority: 70) - `src/parsers/handlers/WikiStyleHandler.js`
   - **DEPRECATED / unregistered (#907).** Historical string-based `%%…/%` style processor. All style markup — block classes, inline `%%(css)`, `%%sup/sub/strike` — now extracts to DOM nodes in `MarkupParser` Phase 1; see [WikiDocument guide → Style syntax is DOM-native too](WikiDocument-Complete-Guide.md#style-syntax--is-dom-native-too-907). Retained for reference only; add no new style behaviour here.
8. **WikiLinkHandler** (Priority: 50) - `src/parsers/handlers/WikiLinkHandler.js`
   - Creates internal wiki page links

### Phase 3: Context Resolution

**Component**: `MarkupParser.phaseContextResolution()`
**Purpose**: Build relationships and resolve references

- **RenderingManager**: Provides `getLinkGraph()` for page relationships
- **VariableManager**: Resolves variable references and dependencies
- **PluginManager**: Validates plugin dependencies and parameters
- Builds context for cross-references and navigation

### Phase 4: Content Transformation

**Component**: `MarkupParser.phaseContentTransformation()`
**Purpose**: Execute plugins and transform content with HTML protection

**Sub-components**:

- **PluginManager**: Executes JSPWiki-compatible plugins
- **VariableManager**: Processes system variables like `[{$pagename}]`
- **HTML Protection System**: `MarkupParser.protectGeneratedHtml()`

#### HTML Protection System

The HTML Protection System is crucial for preventing double-encoding of generated HTML:

```javascript
// Before Protection:
content = '<img src="test.jpg" alt="Test" />'

// After Protection:
content = 'HTMLTOKEN0HTMLTOKEN'
context.protectedBlocks = ['<img src="test.jpg" alt="Test" />']
```

**Protected Elements**:

- `<ul>` and `<ol>` lists with nested `<li>` and `<a>` elements
- `<a>` anchor tags (standalone)
- `<img>` self-closing tags (from Image plugin)
- `<span>`, `<div>`, `<strong>`, `<em>`, `<code>` tags

### Phase 5: Filter Pipeline

**Component**: `MarkupParser.phaseFilterPipeline()`
**Purpose**: Apply security, validation, and content filters through FilterChain

**Main Component**: `FilterChain` orchestrates all filters

**Filter Components** (priority order, highest to lowest):

1. **SecurityFilter** (Priority: 110) - `src/parsers/filters/SecurityFilter.js`
   - XSS prevention and CSRF protection
   - HTML sanitization with configurable allowed tags/attributes
   - **HTMLTOKEN preservation** for HTML Protection System integration
2. **SpamFilter** (Priority: 100) - `src/parsers/filters/SpamFilter.js`
   - Link count limits and blacklisted domain detection
   - Content pattern matching for spam prevention
3. **ValidationFilter** (Priority: 90) - `src/parsers/filters/ValidationFilter.js`
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

**Component**: `MarkupParser.phaseMarkdownConversion()`
**Purpose**: Convert remaining markdown to HTML

**Sub-components**:

- **Showdown.js**: Third-party markdown processor
- **Markdown Extensions**: Custom extensions for wiki-specific syntax
- **Configuration**: Uses `this.config.markdown` settings

**Processing**:

- Converts standard markdown syntax (headers, lists, links, etc.)
- Preserves HTMLTOKEN placeholders during conversion
- Applies markdown extensions for enhanced functionality

### Phase 7: Post-processing

**Component**: `MarkupParser.phasePostProcessing()`
**Purpose**: Final HTML cleanup and token restoration

**Sub-components**:

- **HTML Token Restoration**: `MarkupParser.restoreProtectedHtml()`
- **Link Processing**: Finalizes link attributes and CSS classes
- **HTML Cleanup**: `MarkupParser.cleanupGeneratedHtml()`

**Processing Steps**:

1. **Token Restoration**: Replaces HTMLTOKEN placeholders with original HTML
2. **Link Finalization**: Adds proper CSS classes to wiki links
3. **HTML Normalization**: Removes processing artifacts
4. **Final Validation**: Ensures clean, valid HTML output

```javascript
// Token Restoration Example:
processedContent = processedContent.replace(/HTMLTOKEN(\d+)HTMLTOKEN/g, (match, index) => {
  return context.protectedBlocks[parseInt(index)] || match;
});
```

## JSPWiki Compatibility Features

### Plugin System

- **Normal Execution**: `[{Image src='test.jpg' alt='Test'}]` → `<img src="test.jpg" alt="Test" class="wiki-image" />`
- **Escaped Syntax**: `[[{Image src='test.jpg' alt='Test'}]` → `[{Image src='test.jpg' alt='Test'}]` (literal)

### System Variables

- `[{$pagename}]` - Current page name
- `[{$totalpages}]` - Total number of pages
- `[{$uptime}]` - Server uptime
- `[{$applicationname}]` - Application name
- `[{$baseurl}]` - Base URL
- `[{$timestamp}]` - Current ISO timestamp

### Supported Plugins & Components

- **Image** (`plugins/ImagePlugin.js`): Display images with customizable attributes
- **SessionsPlugin** (`plugins/SessionsPlugin.js`): Show active session count via UserManager
- **TotalPagesPlugin** (`plugins/TotalPagesPlugin.js`): Display total page count via PageManager
- **UptimePlugin** (`plugins/UptimePlugin.js`): Show server uptime from process statistics
- **ReferringPagesPlugin** (`plugins/referringPagesPlugin.js`): List pages that reference current page via RenderingManager.getLinkGraph()

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

- **Parse Results Cache**: TTL 300s
- **Handler Results Cache**: TTL 600s
- **Pattern Cache**: TTL 3600s
- **Variable Cache**: TTL 300s

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
│   ├── AttachmentHandler
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
