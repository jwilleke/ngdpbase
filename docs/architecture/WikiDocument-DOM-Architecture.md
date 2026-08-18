> __ARCHIVED__: This document is for historical purposes only. For the current and complete documentation, please see __[WikiDocument Complete Guide](../WikiDocument-Complete-Guide.md)__.

---

# WikiDocument DOM Architecture - Production Ready

- __UUID__: wikidocument-dom-architecture
- __Category__: documentation
- __Keywords__: architecture, parser, DOM, JSPWiki
- __Last Modified__: 2025-10-13
- __Status__: IMPLEMENTED

__Status:__ ✅ Phases 1-6 Complete (Issues #115, #116, #117, #118, #119, #120)
__Last Updated:__ 2025-10-13
__Test Coverage:__ 376+ tests passing
__Production Status:__ DEPLOYED (extraction pipeline active by default)

## Problem Statement

__Issue__: The `[[` escaping problem keeps recurring despite multiple fixes because our current string-based parsing pipeline is inherently fragile and order-dependent.

__Root Cause__: ngdpbase's MarkupParser processes content as __strings__ through multiple phases, making it impossible to reliably handle escaping, variables, plugins, and links without conflicts.

__Example of the Issue__:

```markdown
## Basic System Variables
- Application Name ( [[{$applicationname}] ) : [{$applicationname}]
```

__Expected Output__:

```text
Application Name ([{$applicationname}]) : ngdpbase
```

__Actual Output__:

```text
Application Name ([ngdpbase: ngdpbase
```

The `[[` escape is being processed incorrectly because string replacements happen in the wrong order.

## JSPWiki's Solution: WikiDocument Internal DOM

### Architecture Overview

JSPWiki solves this problem by __building an internal DOM tree__ (not string processing):

```text
Raw Wiki Markup
    ↓
MarkupParser (tokenizes and builds JDOM tree)
    ↓
WikiDocument (JDOM2-based DOM structure)
    ↓
Plugins/Variables/Filters (manipulate DOM nodes)
    ↓
XHTMLRenderer (serializes DOM to HTML)
    ↓
Final HTML Output
```

### Key Components from JSPWiki

#### 1. WikiDocument Class

```java
public class WikiDocument extends org.jdom2.Document {
    // Stores the DOM tree of a rendered WikiPage
    // Extends JDOM Document with JSPWiki-specific metadata

    private String pageData;           // Original wiki markup
    private WeakReference<Context> context;  // Rendering context

    public void setPageData(String data);
    public String getPageData();
    public void setContext(Context ctx);
    public Context getContext();
    public WikiPage getPage();
}
```

__Benefits__:

- DOM is cached separately from page metadata
- Context uses weak reference for garbage collection
- Internal representation is already XHTML

#### 2. MarkupParser (Abstract)

```java
public abstract class MarkupParser {
    // Token-based parsing that builds JDOM Elements

    protected abstract WikiDocument parse();  // Build DOM tree
    protected Element makeHeading(int level);  // Create DOM nodes
    protected int parseToken();  // CHARACTER, ELEMENT, or IGNORE
    protected void pushBack(int c);  // Lookahead support

    // Extensible hooks for processing
    addLocalLinkHook();
    addExternalLinkHook();
    addAttachmentLinkHook();
}
```

__Benefits__:

- Processes input character-by-character
- Creates DOM nodes (Elements) incrementally
- Supports lookahead via pushBack()
- Extensible via hooks

#### 3. XHTMLRenderer

```java
public class XHTMLRenderer {
    public XHTMLRenderer(Context context, WikiDocument doc);
    public String getString();  // Serialize DOM to HTML
}
```

__Benefits__:

- Trivial rendering: DOM is already XHTML
- Just dumps out the DOM tree
- No string manipulation needed

### Why This Works

1. __Structure Preservation__: DOM nodes have types (Element, Text, Attribute)
2. __No Order Dependency__: Variables, plugins, links are DOM nodes that can be processed independently
3. __Escaping is Natural__: Escaped content becomes Text nodes, not Elements
4. __Cacheable__: WikiDocument can be cached and reused
5. __Transformable__: DOM can be manipulated before rendering

## ngdpbase's Current Architecture (String-Based)

### Current Pipeline

```text
Raw Markdown
    ↓
Phase 1: Preprocessing (string replacement)
    ↓
Phase 2: Syntax Recognition (regex patterns)
    ↓
Phase 3: Context Resolution (variable expansion)
    ↓
Phase 4: Content Transformation (handler execution)
    ↓
Phase 5: Filter Pipeline (validation)
    ↓
Phase 6: Markdown Conversion (Showdown)
    ↓
Phase 7: Post-processing (cleanup)
    ↓
Final HTML (string)
```

### Problems with String-Based Approach

1. __Order Dependency__: Each phase must run in exact order
   - Variables before plugins? Or plugins before variables?
   - Escape before or after variables?
   - One change breaks everything

2. __State Loss__: After string replacement, you lose track of what was what
   - Was `[{$var}]` originally `[[{$var}]`?
   - Is this `[text]` a link or an escaped bracket?
   - Context is lost after replacement

3. __Fragile Escaping__: Escape sequences must survive ALL phases
   - `[[` → temporary token → hope it survives → convert back
   - Any phase can accidentally process escaped content
   - Leads to bugs like the one you're seeing

4. __Performance__: Can't cache intermediate results
   - Must reprocess entire string for each request
   - No way to cache "parsed but not rendered" state

5. __Hard to Debug__: String transformations are opaque
   - Can't inspect "what is this element?"
   - Can't trace "where did this come from?"

### Example of the Brittleness

```javascript
// Phase 1: Escape handling
content = content.replace(/\[\[/g, '___ESCAPED_BRACKET___');

// Phase 3: Variable expansion (WRONG! It processes the escaped content)
content = content.replace(/\[\{(\$\w+)\}\]/g, (match, var) => {
  return expandVariable(var);
});

// Phase 7: Unescape (too late, damage done)
content = content.replace(/___ESCAPED_BRACKET___/g, '[');
```

The problem: Phase 3 matches `___ESCAPED_BRACKET___{$var}]` because the `[` is now just part of a string!

## Implemented Solution: Pre-Extraction Strategy (Phases 1-4)

### Architecture Overview

__The solution was implemented using a pre-extraction strategy__ that separates JSPWiki syntax processing from markdown parsing:

```
┌─────────────────────────────────────────────────────────────┐
│                    INPUT: Wiki Markup                        │
│  "## Welcome\n\nUser: [{$username}]\n\nPage: [HomePage]"    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         PHASE 1: Extract JSPWiki Syntax                      │
│         MarkupParser.extractJSPWikiSyntax()                  │
│         (Issue #115 - ✅ COMPLETE)                           │
│                                                               │
│  • Scan for JSPWiki patterns: [{$var}], [{PLUGIN}], [Link]  │
│  • Extract each element with metadata                        │
│  • Replace with inline span placeholders                     │
│  • Return: { sanitized, jspwikiElements, uuid }             │
│                                                               │
│  RESULT: "## Welcome\n\nUser: <span data-jspwiki-           │
│           placeholder="uuid-0"></span>\n\nPage:              │
│           <span data-jspwiki-placeholder="uuid-1"></span>"   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         PHASE 2: Create DOM Nodes                            │
│         MarkupParser.createDOMNode()                         │
│         (Issue #116 - ✅ COMPLETE)                           │
│                                                               │
│  • For each extracted element, create WikiDocument DOM node  │
│  • Route to appropriate handler:                             │
│    - DOMVariableHandler.createNodeFromExtract()             │
│    - DOMPluginHandler.createNodeFromExtract()               │
│    - DOMLinkHandler.createNodeFromExtract()                 │
│  • Return: array of DOM nodes with data-jspwiki-id          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         PHASE 3: Showdown + Merge                            │
│         MarkupParser.parseWithDOMExtraction()                │
│         (Issue #117 - ✅ COMPLETE)                           │
│                                                               │
│  Step A: Let Showdown parse sanitized markdown              │
│    • Showdown.makeHtml(sanitized)                           │
│    • Result: "<h2>Welcome</h2><p>User: <span ...></span></p>" │
│                                                               │
│  Step B: Merge DOM nodes back into HTML                     │
│    • MarkupParser.mergeDOMNodes(html, nodes, uuid)          │
│    • Replace placeholders with rendered DOM nodes            │
│    • Sort by descending ID for nested syntax                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    OUTPUT: Final HTML                        │
│  "<h2 id="welcome">Welcome</h2>                              │
│   <p>User: <span class="wiki-variable">JohnDoe</span></p>   │
│   <p>Page: <a href="#HomePage">HomePage</a></p>"            │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Files

__Core Implementation__ (src/parsers/MarkupParser.js):

- `extractJSPWikiSyntax()` - Lines 1235-1393 (Phase 1)
- `createDOMNode()` - Lines 1395-1439 (Phase 2)
- `mergeDOMNodes()` - Lines 1441-1496 (Phase 3)
- `parseWithDOMExtraction()` - Lines 1498-1571 (Phase 3 - main entry point)

__DOM Handlers__:

- `DOMVariableHandler.js` - Variable node creation
- `DOMPluginHandler.js` - Plugin node creation
- `DOMLinkHandler.js` - Link node creation

__Reference-Only Code__ (Phase 4, Issue #118):

- `Tokenizer.js` - Token-based parsing (reference)
- `DOMParser.js` - Alternative parser approach (reference)
- `DOMBuilder.js` - DOM building from tokens (reference)

All reference files contain comprehensive architecture notes explaining why they're not actively used and what replaced them.

### Test Coverage

Total: 95 tests passing

- __Phase 1 Tests:__ 41 tests (MarkupParser-Extraction.test.js)
  - Variable extraction
  - Plugin extraction
  - Link extraction
  - Escaped text extraction
  - Edge cases and error handling

- __Phase 2 Tests:__ 23 tests (handler test files)
  - DOMVariableHandler.test.js
  - DOMPluginHandler.test.js
  - DOMLinkHandler.test.js

- __Phase 3 Tests:__ 31 tests (MarkupParser-MergePipeline.test.js)
  - Basic replacement
  - Markdown preservation
  - Multiple elements
  - Nested JSPWiki syntax
  - Edge cases
  - Performance

__Verification Test:__ test_markdown_heading_fix.js demonstrates the markdown heading bug is fixed:

```
✓ H2 headings present: YES ✅
✓ H3 headings present: YES ✅
✓ H4 headings present: YES ✅
✓ Variable resolved: YES ✅
✓ Plugin executed: YES ✅
✓ Link created: YES ✅
✓ No literal ## in output: YES ✅
```

### Key Design Decisions

#### 1. Inline Span Placeholders (Updated October 2025)

__Decision:__ Use `<span data-jspwiki-placeholder="uuid-id"></span>` format

__Rationale:__

- Inline HTML elements preserved by markdown parsers as inline content
- Don't interfere with markdown syntax
- Prevent block-level rendering issues (HTML comments caused unwanted line breaks)
- Valid HTML if replacement fails

__Previous Decision (Deprecated):__ HTML comments (`<!--JSPWIKI-uuid-id-->`)

- __Issue Found:__ Showdown treats HTML comments at start of line as block-level elements
- __Problem:__ `[{$pagename}] text` rendered as two blocks instead of inline
- __Fixed:__ Changed to inline span elements to maintain inline rendering

__Rejected Alternative:__ `__JSPWIKI_uuid_id__` (underscores interpreted as markdown)

#### 2. Reverse ID Order Merging

__Decision:__ Sort nodes by descending ID before merging

__Rationale:__ Handles nested JSPWiki syntax correctly (e.g., plugin containing variable)

#### 3. Keep Tokenization Code as Reference

__Decision:__ Keep Tokenizer/DOMParser/DOMBuilder with clear documentation (Phase 4)

__Rationale:__

- Preserves JSPWiki syntax pattern knowledge
- Educational value
- May be useful for future enhancements
- Clearer than deleting and losing context

### Benefits Achieved

1. __Markdown Heading Bug Fixed__ (#110, #93)
   - `## Heading` now correctly becomes `<h2>Heading</h2>`
   - Showdown handles ALL markdown without JSPWiki interference

2. __No Order Dependency__
   - JSPWiki syntax extracted before markdown parsing
   - Variables, plugins, links can't interfere with markdown

3. __Natural Escaping__
   - `[[...]]` handled during extraction phase
   - Creates text nodes, not parsed syntax

4. __DOM-Based Processing__
   - WikiDocument nodes for JSPWiki elements
   - Type-safe node creation
   - Inspectable structure

5. __Clean Architecture__
   - Clear separation: Extract → Create → Merge
   - Each phase has single responsibility
   - Testable components

### Usage Example

```javascript
const MarkupParser = require('./src/parsers/MarkupParser');

// Initialize parser with engine
const parser = new MarkupParser(engine);
await parser.initialize();

// Parse wiki markup using new pipeline
const content = `
## Welcome to ngdpbase

Hello [{$username}]!

Check out [HomePage] for more info.

[{TOC}]
`;

const context = { userName: 'JohnDoe' };
const html = await parser.parseWithDOMExtraction(content, context);

// Result:
// <h2 id="welcome-to-ngdpbase">Welcome to ngdpbase</h2>
// <p>Hello <span class="wiki-variable">JohnDoe</span>!</p>
// <p>Check out <a href="#HomePage">HomePage</a> for more info.</p>
// <div class="toc">Table of Contents</div>
```

---

## Original Proposed Solution (Pre-Implementation)

__Note:__ The section below was the original proposal. The actual implementation used a __pre-extraction strategy__ (documented above) rather than the full tokenization approach proposed here. The pre-extraction approach proved simpler and more effective.

### Original Architecture Overview (Proposed, Not Implemented)

```javascript
// New architecture
class WikiDocument {
  constructor(pageData, context) {
    this.root = new Element('div');  // Root JSDOM element
    this.pageData = pageData;
    this.context = new WeakRef(context);
    this.metadata = {};
  }

  getRootElement() { return this.root; }
  getPageData() { return this.pageData; }
  getContext() { return this.context.deref(); }
  toHTML() { return this.root.innerHTML; }
}

class MarkupParser {
  parse(content, context) {
    const doc = new WikiDocument(content, context);
    const root = doc.getRootElement();

    // Token-based parsing
    let pos = 0;
    while (pos < content.length) {
      const token = this.nextToken(content, pos);

      switch(token.type) {
        case 'TEXT':
          root.appendChild(this.createTextNode(token.value));
          break;
        case 'VARIABLE':
          root.appendChild(this.createVariableElement(token));
          break;
        case 'PLUGIN':
          root.appendChild(this.createPluginElement(token));
          break;
        case 'LINK':
          root.appendChild(this.createLinkElement(token));
          break;
        case 'ESCAPED':
          root.appendChild(this.createTextNode(token.unescapedValue));
          break;
      }
      pos = token.endPos;
    }

    return doc;
  }

  createVariableElement(token) {
    const el = this.createElement('span');
    el.setAttribute('data-variable', token.name);
    el.setAttribute('class', 'wiki-variable');
    el.textContent = this.resolveVariable(token.name);
    return el;
  }
}

class XHTMLRenderer {
  render(wikiDocument) {
    // Simple: DOM is already HTML-ready
    return wikiDocument.toHTML();
  }
}
```

### Benefits of DOM Approach

1. __No Order Dependency__:
   - Parse everything into DOM first
   - Then process nodes independently
   - Variables don't interfere with plugins

2. __Natural Escaping__:

   ```javascript
   // [[ becomes a text node with value "["
   // [{$var}] becomes a variable element
   // These can't interfere because they're different node types
   ```

3. __Cacheable__:

   ```javascript
   // Cache the WikiDocument, not the HTML
   cache.set(pageId, wikiDocument);

   // Later, render with different context
   const html = renderer.render(wikiDocument);
   ```

4. __Inspectable__:

   ```javascript
   // Can query the DOM
   doc.querySelectorAll('[data-variable]');  // All variables
   doc.querySelectorAll('.wiki-plugin');     // All plugins
   ```

5. __Transformable__:

   ```javascript
   // Plugins can manipulate DOM before rendering
   const pluginElements = doc.querySelectorAll('.wiki-plugin');
   for (const el of pluginElements) {
     await plugin.execute(el, context);
   }
   ```

## Implementation Status (Phases 1-7)

### Phase 1: Extraction (Issue #115) - ✅ COMPLETE

__Objective:__ Extract JSPWiki syntax before markdown parsing

__Status:__ Complete - `extractJSPWikiSyntax()` implemented with code block protection
__Test Coverage:__ 41 tests passing

### Phase 2: DOM Node Creation (Issue #116) - ✅ COMPLETE

__Objective:__ Create WikiDocument DOM nodes from extracted elements

__Status:__ Complete - Handler methods implemented (`createNodeFromExtract()`)
__Test Coverage:__ 23 tests passing

### Phase 3: Merge Pipeline (Issue #117) - ✅ COMPLETE

__Objective:__ Merge DOM nodes into Showdown HTML

__Status:__ Complete - `parseWithDOMExtraction()` implemented
__Test Coverage:__ 31 tests passing

### Phase 4: Document Reference Code (Issue #118) - ✅ COMPLETE

__Objective:__ Document tokenization code as reference-only

__Status:__ Complete - Architecture notes added to Tokenizer, DOMParser, DOMBuilder
__Documentation:__ Updated

### Phase 5: Comprehensive Testing (Issue #119) - ✅ COMPLETE

__Objective:__ Integration testing before production deployment

__Status:__ Complete - 55 comprehensive integration tests added
__Test Coverage:__ 376+ total tests passing
__Manual QA:__ Test plan created (docs/testing/Phase5-Manual-QA-Plan.md)

### Phase 6: Production Integration (Issue #120) - ✅ COMPLETE

__Objective:__ Deploy new pipeline to production

__Status:__ Complete - Integrated into `MarkupParser.parse()`

__Implementation:__

- ✅ Configuration property added (`jspwiki.parser.useExtractionPipeline = true`)
- ✅ Automatic routing to `parseWithDOMExtraction()` when enabled
- ✅ Fallback to legacy 7-phase parser on error
- ✅ Performance monitoring and logging
- ✅ Cache integration
- ✅ Metrics tracking

__Files Modified:__

- `src/parsers/MarkupParser.js` (lines 636-781): Updated `parse()` method
- `config/app-default-config.json`: Added configuration property

### Phase 7: Cleanup & Documentation (Issue #121) - ✅ COMPLETE

__Objective:__ Mark deprecated code and complete comprehensive documentation

__Status:__ Complete - Production-ready documentation suite created

__Implementation:__

- ✅ GitHub issue #121 created
- ✅ Legacy 7-phase parser marked as deprecated with clear warnings
- ✅ Complete API documentation created (docs/api/MarkupParser-API.md)
- ✅ Comprehensive migration guide created (docs/migration/WikiDocument-DOM-Migration.md)
- ✅ Architecture documentation updated
- ✅ All issues ready for closure

__Files Created:__

- `docs/api/MarkupParser-API.md` - Complete API reference with examples, troubleshooting, and migration guidance
- `docs/migration/WikiDocument-DOM-Migration.md` - Migration patterns, integration guide, common pitfalls, and FAQ

__Files Modified:__

- `src/parsers/MarkupParser.js` - Added @deprecated warnings to legacy code
- `docs/architecture/WikiDocument-DOM-Architecture.md` - Updated status and phase information

__Note:__ Legacy 7-phase parser code was KEPT (not removed) for backward compatibility and emergency fallback. It is clearly marked as deprecated with detailed migration guidance.

---

## Original Implementation Plan (Pre-Implementation Reference)

__Note:__ The section below was the original proposed implementation plan. The actual implementation followed a different approach (pre-extraction strategy, Phases 1-4 documented above). This is kept for historical reference.

### Original Phase 1: Add WikiDocument Class (Non-Breaking) - NOT IMPLEMENTED

```javascript
// New file: src/parsers/WikiDocument.js
class WikiDocument {
  constructor(pageData, context) {
    this.pageData = pageData;
    this.context = new WeakRef(context);
    this.dom = null;  // Will use jsdom or similar
  }

  // Methods to manipulate DOM
  createElement(tag) { /* ... */ }
  createTextNode(text) { /* ... */ }
  appendChild(node) { /* ... */ }
  querySelector(selector) { /* ... */ }
  toHTML() { /* ... */ }
}
```

### Original Phase 2: Refactor MarkupParser to Build DOM - NOT IMPLEMENTED

__Note:__ The actual implementation used extraction instead of tokenization.

```javascript
// Modify: src/parsers/MarkupParser.js
async parse(content, context) {
  // NEW: Build WikiDocument instead of string manipulation
  const wikiDoc = new WikiDocument(content, context);

  // Tokenize and build DOM
  await this.buildDOM(content, wikiDoc, context);

  // Process DOM nodes (variables, plugins, etc.)
  await this.processVariables(wikiDoc, context);
  await this.processPlugins(wikiDoc, context);
  await this.processLinks(wikiDoc, context);

  // Serialize to HTML
  return wikiDoc.toHTML();
}
```

### Original Phase 3: Update Handlers to Work with DOM - PARTIALLY IMPLEMENTED

__Note:__ Handlers were updated to create DOM nodes, but via `createNodeFromExtract()` methods instead of processing a full WikiDocument tree.

```javascript
// Handlers modify DOM nodes, not strings
class VariableHandler {
  async process(wikiDocument, context) {
    const variableNodes = wikiDocument.querySelectorAll('[data-variable]');
    for (const node of variableNodes) {
      const varName = node.getAttribute('data-variable');
      const value = await this.resolveVariable(varName, context);
      node.textContent = value;
    }
  }
}
```

### Original Phase 4: Add Renderer - NOT IMPLEMENTED

__Note:__ The actual implementation merges DOM nodes directly into Showdown's HTML output instead of using a separate renderer.

```javascript
// New file: src/parsers/XHTMLRenderer.js
class XHTMLRenderer {
  constructor(engine) {
    this.engine = engine;
  }

  render(wikiDocument, context) {
    // Optional: apply post-processing filters
    // But mostly just serialize the DOM
    return wikiDocument.toHTML();
  }
}
```

### Original Phase 5: Integrate with RenderingManager - PENDING (see Phase 6 above)

__Note:__ This integration is planned for Phase 6 of the actual implementation.

```javascript
// Modify: src/managers/RenderingManager.js
async textToHTML(context, pageContent) {
  const markupParser = this.engine.getManager('MarkupParser');

  // NEW: Returns WikiDocument, not string
  const wikiDoc = await markupParser.parseToDocument(pageContent, context);

  // NEW: Render WikiDocument to HTML
  const renderer = new XHTMLRenderer(this.engine);
  return renderer.render(wikiDoc, context);
}
```

## Original Migration Strategy (Pre-Implementation Reference)

__Note:__ The actual implementation followed a different timeline and approach (Phases 1-4 completed in ~3 days). This is kept for historical reference.

### Original Step 1: Create WikiDocument Class (Week 1) - MODIFIED

- Implement WikiDocument with JSDOM
- Add basic DOM manipulation methods
- Write unit tests

__Actual implementation:__ Used linkedom instead of JSDOM, focused on node creation methods.

### Original Step 2: Add Token-Based Parser (Week 2) - NOT IMPLEMENTED

- Implement tokenizer (character-by-character)
- Parse into WikiDocument DOM
- Keep existing string-based parser as fallback

__Actual implementation:__ Used pre-extraction strategy instead of tokenization.

### Original Step 3: Migrate Handlers (Week 3-4) - MODIFIED

- Convert handlers to work with DOM nodes
- One handler at a time
- Test each migration

__Actual implementation:__ Added `createNodeFromExtract()` methods to existing handlers (completed in Phase 2).

### Original Step 4: Deprecate String Pipeline (Week 5) - PENDING

- Default to DOM-based parsing
- Remove string-based phases
- Update documentation

__Actual status:__ Planned for Phase 6 (Production Integration).

### Original Step 5: Remove Legacy Code (Week 6) - PENDING

- Clean up old string-based code
- Performance tuning
- Final testing

__Actual status:__ Planned for Phase 7 (Cleanup & Documentation).

## Original Technical Decisions (Pre-Implementation Reference)

__Note:__ This section contains the original technical considerations. See "Key Design Decisions" in the "Implemented Solution" section above for the actual decisions made during implementation.

### DOM Library Choice (Original Proposal)

- Option 1: jsdom** (Recommended)
  - Full DOM implementation
  - querySelector, appendChild, etc.
  - Heavy but feature-complete

- Option 2: cheerio
  - Lighter weight
  - jQuery-like API
  - Might be sufficient

- Option 3: Custom DOM
  - Minimal implementation
  - Only what we need
  - More work, but lighter

__Recommendation__: Start with jsdom for full compatibility, optimize later if needed.

__Actual decision:__ Used linkedom (lightweight, server-side DOM library) for WikiDocument implementation.

### Caching Strategy (Original Proposal)

```javascript
// Cache WikiDocument objects, not HTML strings
class WikiDocumentCache {
  set(key, wikiDocument) {
    // Serialize WikiDocument for caching
    const serialized = {
      pageData: wikiDocument.pageData,
      dom: wikiDocument.toHTML(),  // Or serialize full DOM
      metadata: wikiDocument.metadata
    };
    return this.cache.set(key, serialized);
  }

  get(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    // Reconstruct WikiDocument
    return WikiDocument.fromSerialized(cached);
  }
}
```

### Backward Compatibility

During migration, support both approaches:

```javascript
async parse(content, context) {
  if (this.config.useDOMParser) {
    // NEW: DOM-based
    return this.parseToDocument(content, context);
  } else {
    // OLD: String-based (deprecated)
    return this.parseString(content, context);
  }
}
```

## Expected Benefits (from Original Proposal)

__Note:__ See "Benefits Achieved" in the "Implemented Solution" section above for actual results. This section is kept for comparison.

### 1. Fixes Escaping Issues Permanently - ✅ ACHIEVED

- `[[` becomes a text node `[`
- Can't be accidentally processed by other phases
- No order dependency

### 2. Improves Performance - ⏳ PENDING

- Cache WikiDocument, not HTML
- Reuse parsed DOM with different contexts
- Avoid redundant parsing

__Status:__ Not yet measured; planned for Phase 5 (Comprehensive Testing).

### 3. Enables Advanced Features - ✅ ACHIEVED

- DOM manipulation for plugins
- Query parsed content
- Transform before rendering

__Status:__ DOM nodes can be inspected and manipulated.

### 4. Better Debugging - ✅ ACHIEVED

- Inspect DOM structure
- See what each element is
- Trace parsing issues

__Status:__ Nodes have data-jspwiki-id attributes for debugging.

### 5. JSPWiki Compatibility - ✅ PARTIALLY ACHIEVED

- Matches JSPWiki architecture
- Easier to port JSPWiki features
- Familiar to JSPWiki developers

__Status:__ Uses WikiDocument and DOM-based approach, though implementation differs from full tokenization.

## Risks and Mitigations

### Risk 1: Performance Overhead

__Mitigation__:

- Cache WikiDocument objects
- Use lightweight DOM library
- Benchmark and optimize

### Risk 2: Breaking Changes

__Mitigation__:

- Phased migration
- Keep old parser as fallback
- Comprehensive testing

### Risk 3: Complexity

__Mitigation__:

- Start simple
- Add features incrementally
- Good documentation

### Risk 4: Learning Curve

__Mitigation__:

- Follow JSPWiki patterns
- Clear examples
- Team training

## Conclusion

### Original Conclusion (Pre-Implementation)

The recurring `[[` escaping issue is a symptom of a deeper architectural problem: __string-based parsing is inherently fragile__.

JSPWiki solved this problem 20 years ago by using an __internal DOM representation__. The recommendation was to follow their proven approach.

### Implementation Complete (October 2025)

__The WikiDocument DOM architecture has been successfully implemented__ using a pre-extraction strategy (Phases 1-4):

✅ __Phase 1 (Issue #115):__ Extract JSPWiki syntax before markdown parsing
✅ __Phase 2 (Issue #116):__ Create WikiDocument DOM nodes via handlers
✅ __Phase 3 (Issue #117):__ Merge DOM nodes into Showdown HTML
✅ __Phase 4 (Issue #118):__ Document reference code with architecture notes

__Results:__

- ✅ Markdown heading bug fixed (Issue #110, #93)
- ✅ No order dependency between JSPWiki and markdown
- ✅ Natural escaping via text nodes
- ✅ 95 tests passing (100% test success rate)
- ✅ Clean separation of concerns
- ✅ Maintainable, testable architecture

__The parser is now:__

- More robust (no parsing conflicts)
- Better tested (comprehensive test suite)
- Easier to maintain (clear phases)
- JSPWiki-inspired (DOM-based approach)

__Next Steps:__

- Phase 5: Comprehensive testing (Issue #119)
- Phase 6: Production integration
- Phase 7: Cleanup and documentation

## References

### Implementation Files

__Core Implementation:__

- `src/parsers/MarkupParser.js` - Main parser with extraction, node creation, and merge methods
- `src/parsers/dom/WikiDocument.js` - WikiDocument DOM class (linkedom-based)
- `src/parsers/dom/handlers/DOMVariableHandler.js` - Variable node creation
- `src/parsers/dom/handlers/DOMPluginHandler.js` - Plugin node creation
- `src/parsers/dom/handlers/DOMLinkHandler.js` - Link node creation

__Reference Implementation:__

- `src/parsers/dom/Tokenizer.js` - Token-based parser (reference)
- `src/parsers/dom/DOMParser.js` - Alternative parser (reference)
- `src/parsers/dom/DOMBuilder.js` - DOM builder from tokens (reference)

__Tests:__

- `src/parsers/__tests__/MarkupParser-Extraction.test.js` - Phase 1 tests (41 tests)
- `src/parsers/__tests__/MarkupParser-MergePipeline.test.js` - Phase 3 tests (31 tests)
- `src/parsers/dom/handlers/__tests__/` - Phase 2 handler tests (23 tests)
- `test_markdown_heading_fix.js` - Bug verification test

### Related Issues

__Epic:__

- Issue #114 - WikiDocument DOM Solution

__Implementation Phases:__

- Issue #115 - Phase 1: Extraction
- Issue #116 - Phase 2: DOM Node Creation
- Issue #117 - Phase 3: Merge Pipeline
- Issue #118 - Phase 4: Document Reference Code
- Issue #119 - Phase 5: Comprehensive Testing (pending)

__Bug Fixes:__

- Issue #110 - Markdown heading bug
- Issue #93 - Original DOM migration issue

### JSPWiki References

- [JSPWiki WikiDocument API](https://jspwiki.apache.org/apidocs/2.12.1/org/apache/wiki/parser/WikiDocument.html)
- [JSPWiki MarkupParser](https://github.com/apache/jspwiki/blob/master/jspwiki-main/src/main/java/org/apache/wiki/parser/MarkupParser.java)
- [JSPWiki XHTMLRenderer](https://jspwiki.apache.org/apidocs/2.12.1/org/apache/wiki/render/XHTMLRenderer.html)

### Project References

- [Current MarkupParser.js](../../src/parsers/MarkupParser.js)
- [WikiDocument API Documentation](./WikiDocument-API.md)
- [Current Rendering Pipeline](./Current-Rendering-Pipeline.md)
- [.github/copilot-instructions.md RenderPipeline](../../.github/copilot-instructions.md#L19-L32)
