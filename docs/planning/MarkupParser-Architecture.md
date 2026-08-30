# MarkupParser Architecture Design

## Executive Summary

This document outlines the architecture for implementing a comprehensive MarkupParser in ngdpbase to achieve full JSPWiki enhancement compatibility while maintaining modern JavaScript architecture principles.

## Current State Analysis

### Existing Parsing Pipeline (Limited)

```javascript
// Current RenderingManager.js flow
1. Macro expansion (basic variables)
2. JSPWiki table processing  
3. Wiki link processing
4. Markdown conversion (Showdown)
5. Post-processing
```

### Supported Enhancements (9/19 - 47%)

✅ __Currently Supported:__

- Basic Plugin Syntax: `[{PluginName param=value}]`
- Wiki Variables: `[{$variable}]`
- Wiki Links: `[PageName]`, `[Display|Target]`
- JSPWiki Tables: `%%table-striped`
- ACL Syntax: `[{ALLOW action user}]`
- Basic Image Plugin: `[{Image src='' alt=''}]`
- Some Attachment Handling
- Variable Manager integration
- Plugin Manager integration

❌ __Missing JSPWiki Enhancements:__

- WikiTags (JSP-like): `<wiki:If>`, `<wiki:Include>`
- WikiForms: `[{FormOpen}]`, `[{FormInput}]`, `[{FormClose}]`
- Advanced Inline Attachments: `[{ATTACH file.pdf}]`
- InterWiki Links: `[Wikipedia:Java]`
- Advanced Page Metadata Processing
- RSS/Atom Feed Generation markup
- Search Plugin: `[{SearchPlugin}]`
- Filter Pipeline System
- Complex Plugin Parameter Parsing
- WikiStyles: Advanced CSS class assignments

## Proposed MarkupParser Architecture

### Core Design Principles

1. __Phase-based Processing__: Multi-stage parsing pipeline
2. __Extensible Plugin System__: Easy addition of new syntax handlers
3. __JSPWiki Compatibility__: 100% syntax compatibility
4. __Performance Optimized__: Caching and efficient parsing
5. __Error Resilient__: Graceful degradation for malformed syntax

### Architecture Overview

```javascript
// src/parsers/MarkupParser.js
class MarkupParser extends BaseManager {
  constructor(engine) {
    this.phases = [];
    this.syntaxHandlers = new Map();
    this.filterChain = [];
    this.cache = null;
  }
}
```

### Processing Phases

#### Phase 1: Preprocessing

- Escape handling
- Code block protection
- Comment extraction
- Character normalization

#### Phase 2: Syntax Recognition

- Plugin syntax parsing: `[{PluginName ...}]`
- WikiTag parsing: `<wiki:TagName ...>`
- Form syntax parsing: `[{Form...}]`
- Variable syntax: `[{$variable}]`
- InterWiki links: `[WikiName:PageName]`
- Attachment syntax: `[{ATTACH ...}]`

#### Phase 3: Context Resolution

- Variable expansion
- Plugin parameter resolution
- Context-aware processing
- Permission checks

#### Phase 4: Content Transformation

- Plugin execution
- WikiTag processing
- Form generation
- Link resolution
- Attachment handling

#### Phase 5: Filter Pipeline

- Content filters (spam, profanity, custom)
- Validation filters
- Security filters
- Enhancement filters

#### Phase 6: Markdown Conversion

- Showdown processing
- Table processing
- Final HTML generation

#### Phase 7: Post-processing

- HTML cleanup
- CSS class application
- Schema.org generation
- Final validation

## Detailed Component Design

### 1. Core MarkupParser Class

```javascript
// src/parsers/MarkupParser.js
class MarkupParser extends BaseManager {
  async initialize(config = {}) {
    // Initialize syntax handlers
    this.registerSyntaxHandlers();
    
    // Initialize filter chain
    this.initializeFilters();
    
    // Setup caching
    this.cache = this.engine.getManager('CacheManager').region('MarkupParser');
  }

  async parse(content, context) {
    // Multi-phase processing
    const cacheKey = this.generateCacheKey(content, context);
    
    if (this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;
    }

    let processedContent = content;
    
    // Execute processing phases
    for (const phase of this.phases) {
      processedContent = await phase.process(processedContent, context);
    }

    if (this.cache) {
      await this.cache.set(cacheKey, processedContent, { ttl: 300 });
    }

    return processedContent;
  }
}
```

### 2. Syntax Handler System

```javascript
// src/parsers/handlers/BaseSyntaxHandler.js
class BaseSyntaxHandler {
  constructor(pattern, priority = 100) {
    this.pattern = pattern;
    this.priority = priority;
  }

  async handle(match, context) {
    throw new Error('Must be implemented by subclass');
  }
}

// src/parsers/handlers/PluginSyntaxHandler.js
class PluginSyntaxHandler extends BaseSyntaxHandler {
  constructor() {
    super(/\[\{(\w+)\s*([^}]*)\}\]/g, 90);
  }

  async handle(match, context) {
    const [fullMatch, pluginName, paramString] = match;
    const params = this.parseParameters(paramString);
    
    const pluginManager = context.engine.getManager('PluginManager');
    return await pluginManager.executePlugin(pluginName, params, context);
  }
}
```

### 3. WikiTag Handler

```javascript
// src/parsers/handlers/WikiTagHandler.js
class WikiTagHandler extends BaseSyntaxHandler {
  constructor() {
    super(/<wiki:(\w+)([^>]*?)(?:\/>|>(.*?)<\/wiki:\1>)/gs, 95);
  }

  async handle(match, context) {
    const [fullMatch, tagName, attributes, content] = match;
    
    switch (tagName) {
      case 'If':
        return await this.handleIfTag(attributes, content, context);
      case 'Include':
        return await this.handleIncludeTag(attributes, context);
      case 'UserCheck':
        return await this.handleUserCheckTag(attributes, content, context);
      default:
        return this.handleCustomTag(tagName, attributes, content, context);
    }
  }
}
```

### 4. Form Handler

```javascript
// src/parsers/handlers/FormHandler.js
class FormHandler extends BaseSyntaxHandler {
  constructor() {
    super(/\[\{Form(Open|Input|Select|Textarea|Close)\s*([^}]*)\}\]/g, 85);
  }

  async handle(match, context) {
    const [fullMatch, formElement, paramString] = match;
    const params = this.parseParameters(paramString);
    
    switch (formElement) {
      case 'Open':
        return this.generateFormOpen(params, context);
      case 'Input':
        return this.generateFormInput(params, context);
      case 'Close':
        return this.generateFormClose(params, context);
    }
  }
}
```

### 5. Filter Pipeline

```javascript
// src/parsers/filters/FilterChain.js
class FilterChain {
  constructor() {
    this.filters = [];
  }

  addFilter(filter) {
    this.filters.push(filter);
    this.filters.sort((a, b) => a.priority - b.priority);
  }

  async process(content, context) {
    let processedContent = content;
    
    for (const filter of this.filters) {
      processedContent = await filter.process(processedContent, context);
    }
    
    return processedContent;
  }
}

// src/parsers/filters/SpamFilter.js
class SpamFilter extends BaseFilter {
  constructor() {
    super(100); // Priority
  }

  async process(content, context) {
    // Spam detection logic
    return content;
  }
}
```

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)

- [ ] Create MarkupParser base class
- [ ] Implement phase-based processing system
- [ ] Create BaseSyntaxHandler interface
- [ ] Setup handler registration system
- [ ] Implement caching integration
- [ ] Add comprehensive error handling

### Phase 2: Basic Syntax Handlers (Week 2)

- [ ] Enhanced PluginSyntaxHandler
- [ ] WikiTagHandler (If, Include, UserCheck)
- [ ] FormHandler (FormOpen, FormInput, FormClose)
- [ ] InterWikiLinkHandler
- [ ] AdvancedAttachmentHandler
- [ ] WikiStyleHandler

### Phase 3: Filter System (Week 3)

- [ ] FilterChain implementation
- [ ] SpamFilter
- [ ] ProfanityFilter
- [ ] SecurityFilter
- [ ] ValidationFilter
- [ ] Custom filter plugin system

### Phase 4: Advanced Features (Week 4)

- [ ] Complex parameter parsing
- [ ] Context-aware processing
- [ ] RSS/Atom markup generation
- [ ] Search plugin integration
- [ ] Metadata processing enhancements
- [ ] Performance optimizations

### Phase 5: Integration & Testing (Week 5)

- [ ] RenderingManager integration
- [ ] Comprehensive test suite
- [ ] Performance benchmarking
- [ ] JSPWiki compatibility testing
- [ ] Documentation updates
- [ ] Migration from current system

## JSPWiki Compatibility Mapping

### Syntax Compatibility Matrix

| JSPWiki Enhancement | ngdpbase Handler | Implementation Status |
| --------------------- | ----------------- | ---------------------- |
| `[{PluginName}]` | PluginSyntaxHandler | ✅ Enhanced |
| `<wiki:If>` | WikiTagHandler | 🚧 New |
| `<wiki:Include>` | WikiTagHandler | 🚧 New |
| `[{FormOpen}]` | FormHandler | 🚧 New |
| `[{ATTACH}]` | AttachmentHandler | 🚧 Enhanced |
| `[Wikipedia:Java]` | InterWikiLinkHandler | 🚧 New |
| `%%class text/%` | WikiStyleHandler | 🚧 New |
| `[{SearchPlugin}]` | SearchPluginHandler | 🚧 New |
| `[{$variable}]` | VariableHandler | ✅ Enhanced |
| RSS/Atom markup | FeedHandler | 🚧 New |

### Configuration Compatibility

```javascript
// config/markup-parser.json
{
  "ngdpbase.markup.enabled": true,
  "ngdpbase.markup.caching": true,
  "ngdpbase.markup.cache-ttl": 300,
  "ngdpbase.markup.handlers": {
    "plugin": { "enabled": true, "priority": 90 },
    "wikitag": { "enabled": true, "priority": 95 },
    "form": { "enabled": true, "priority": 85 },
    "interwiki": { "enabled": true, "priority": 80 }
  },
  "ngdpbase.filters": [
    "SpamFilter",
    "SecurityFilter",
    "ValidationFilter"
  ],
  "ngdpbase.markup.interwiki": {
    "Wikipedia": "https://en.wikipedia.org/wiki/%s",
    "JSPWiki": "https://jspwiki-wiki.apache.org/Wiki.jsp?page=%s"
  }
}
```

## Performance Considerations

### Caching Strategy

- __Parse Result Caching__: Cache final parsed content with TTL
- __Handler Result Caching__: Cache expensive plugin/tag results
- __Pattern Compilation__: Pre-compile all regex patterns
- __Context Caching__: Cache context-dependent resolutions

### Optimization Techniques

- __Lazy Loading__: Load handlers only when needed
- __Parallel Processing__: Process independent syntax in parallel
- __Stream Processing__: Handle large content efficiently
- __Memory Management__: Proper cleanup and garbage collection

## Security Considerations

### Input Validation

- Sanitize all plugin parameters
- Validate WikiTag attributes
- Escape user-generated content
- Prevent code injection

### Permission Checks

- Integrate with PolicyManager
- Context-aware access control
- Plugin permission validation
- Form submission authorization

## Error Handling & Recovery

### Graceful Degradation

- Malformed syntax fallback
- Plugin execution failures
- Handler registration errors
- Cache failures

### Debugging Support

- Comprehensive logging
- Parse tree visualization
- Performance metrics
- Error reporting

## Integration Points

### Existing Managers

- __RenderingManager__: Primary integration point
- __PluginManager__: Plugin execution
- __VariableManager__: Variable resolution
- __CacheManager__: Performance caching
- __PolicyManager__: Security integration
- __UserManager__: Context information
- __AttachmentManager__: File handling

### New Dependencies

- Parser libraries (if needed)
- HTML sanitization libraries
- Performance monitoring tools

## Testing Strategy

### Unit Tests

- Individual handler testing
- Filter chain testing
- Error condition testing
- Performance benchmarks

### Integration Tests

- End-to-end parsing tests
- JSPWiki compatibility tests
- Real-world content testing
- Security testing

### Performance Tests

- Large content handling
- Concurrent parsing
- Memory usage profiling
- Cache effectiveness

## Migration Strategy

### Backward Compatibility

- Support existing RenderingManager API
- Gradual feature migration
- Configuration migration
- Content migration validation

### Rollout Plan

1. __Development Environment__: Full testing
2. __Staging Environment__: Real content testing
3. __Production Rollout__: Gradual deployment
4. __Legacy Support__: Maintain old system temporarily
5. __Full Migration__: Complete transition

## Success Metrics

### Compatibility Goals

- __100% JSPWiki Syntax Support__: All documented enhancements
- __Performance Improvement__: 20% faster rendering
- __Error Reduction__: 90% fewer parsing errors
- __Feature Parity__: Match JSPWiki 2.12.x capabilities

### Technical Metrics

- Parse success rate > 99.9%
- Average parse time < 10ms
- Cache hit ratio > 80%
- Memory usage optimization

## Conclusion

The MarkupParser architecture will transform ngdpbase from a basic wiki with limited enhancements to a fully JSPWiki-compatible system with modern architecture. This design provides:

1. __Complete Enhancement Support__: All JSPWiki syntax patterns
2. __Extensible Architecture__: Easy addition of new features
3. __Performance Optimization__: Caching and efficient processing
4. __Security Integration__: Built-in permission and validation
5. __Modern JavaScript__: Clean, maintainable codebase

The phased implementation approach ensures minimal disruption while achieving full compatibility and enhanced functionality.
