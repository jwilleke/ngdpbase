> __ARCHIVED__: This document is for historical purposes only. For the current and complete documentation, please see __[WikiDocument Complete Guide](../WikiDocument-Complete-Guide.md)__.

# WikiDocument API Reference

__Version:__ 1.0.0
__Status:__ Implemented (Phase 1 Complete)
__Related:__ [GitHub Issue #93](https://github.com/jwilleke/ngdpbase/issues/93)

## Overview

The `WikiDocument` class provides a DOM-based representation of a wiki page, similar to JSPWiki's WikiDocument which extends JDOM2 Document. This class eliminates the order-dependency issues inherent in string-based parsing and provides a robust foundation for wiki content processing.

__Key Features:__

- DOM-based structure using linkedom (W3C DOM API)
- Cacheable representation (toJSON/fromJSON)
- Metadata storage for processing flags
- WeakRef context for memory-efficient garbage collection
- High performance (390μs per complex page)
- Standard W3C DOM methods

__JSPWiki Reference:__

- [WikiDocument JavaDoc](https://jspwiki.apache.org/apidocs/2.12.1/org/apache/wiki/parser/WikiDocument.html)

## Constructor

### `new WikiDocument(pageData, context)`

Creates a new WikiDocument instance.

__Parameters:__

- `pageData` (string) - Original wiki markup content
- `context` (Object|null) - Rendering context, stored as WeakRef for GC

__Returns:__ WikiDocument instance

__Example:__

```javascript
const WikiDocument = require('./src/parsers/dom/WikiDocument');

const doc = new WikiDocument('!! Welcome\nThis is a wiki page.', {
  pageName: 'Welcome',
  user: 'admin',
  renderTime: Date.now()
});
```

__Internal Structure:__

```javascript
{
  document: DOM Document (linkedom),
  root: <body> element,
  pageData: Original wiki markup,
  contextRef: WeakRef to context,
  metadata: { createdAt, version, ... }
}
```

## Page Data Methods

### `getPageData()`

Returns the original wiki markup.

__JSPWiki equivalent:__ `getPageData()`

__Returns:__ (string) Original page content

__Example:__

```javascript
const content = doc.getPageData();
console.log(content); // "!! Welcome\nThis is a wiki page."
```

### `setPageData(data)`

Updates the original wiki markup.

__JSPWiki equivalent:__ `setPageData(String data)`

__Parameters:__

- `data` (string) - New wiki markup

__Example:__

```javascript
doc.setPageData('!! Updated\nNew content.');
```

__Note:__ This does not rebuild the DOM. To rebuild, parse again.

## Context Methods

### `getContext()`

Returns the rendering context if it hasn't been garbage collected.

__JSPWiki equivalent:__ `getContext()`

__Returns:__ (Object|null) Context object or null if collected

__Example:__

```javascript
const context = doc.getContext();
if (context) {
  console.log('Page:', context.pageName);
  console.log('User:', context.user);
} else {
  console.log('Context was garbage collected');
}
```

__WeakRef Behavior:__

```javascript
// Context is kept alive while referenced
let context = { pageName: 'Test' };
const doc = new WikiDocument('Test', context);
console.log(doc.getContext()); // { pageName: 'Test' }

// After context is dereferenced and GC runs
context = null;
// Eventually after GC...
console.log(doc.getContext()); // null
```

### `setContext(context)`

Updates or clears the rendering context.

__JSPWiki equivalent:__ `setContext(Context ctx)`

__Parameters:__

- `context` (Object|null) - New context or null to clear

__Example:__

```javascript
doc.setContext({ pageName: 'NewPage', user: 'john' });

// Clear context
doc.setContext(null);
```

## Metadata Methods

### `getMetadata()`

Returns a copy of all metadata.

__Returns:__ (Object) Copy of metadata object

__Example:__

```javascript
const metadata = doc.getMetadata();
console.log(metadata);
// {
//   createdAt: '2025-10-12T10:00:00.000Z',
//   version: '1.0.0',
//   author: 'john',
//   processed: true
// }
```

### `setMetadata(key, value)`

Sets a metadata value.

__Parameters:__

- `key` (string) - Metadata key
- `value` (*) - Any value

__Example:__

```javascript
doc.setMetadata('author', 'John Doe');
doc.setMetadata('tags', ['important', 'draft']);
doc.setMetadata('processed', true);
doc.setMetadata('parseTime', 1.23);
```

__Common Metadata Keys:__

- `author` - Page author
- `tags` - Array of tags
- `processed` - Processing flag
- `parseTime` - Parse duration
- `cacheKey` - Cache identifier
- `version` - Document version
- `createdAt` - Creation timestamp

### `getMetadataValue(key, defaultValue)`

Gets a metadata value with optional default.

__Parameters:__

- `key` (string) - Metadata key
- `defaultValue` (*) - Default if key not found (default: null)

__Returns:__ (*) Metadata value or default

__Example:__

```javascript
const author = doc.getMetadataValue('author', 'Unknown');
const tags = doc.getMetadataValue('tags', []);
const processed = doc.getMetadataValue('processed', false);
```

## DOM Creation Methods

### `createElement(tag, attributes)`

Creates a new HTML element.

__Parameters:__

- `tag` (string) - Element tag name
- `attributes` (Object) - Key-value pairs of attributes (optional)

__Returns:__ (Element) New element

__Example:__

```javascript
// Simple element
const para = doc.createElement('p');

// With attributes
const heading = doc.createElement('h1', {
  id: 'title',
  class: 'wiki-heading',
  'data-level': '1'
});

// Complex element
const link = doc.createElement('a', {
  href: '/wiki/PageName',
  class: 'wikilink',
  'data-wiki-page': 'PageName',
  title: 'Go to PageName'
});
```

### `createTextNode(text)`

Creates a text node.

__Parameters:__

- `text` (string) - Text content

__Returns:__ (Text) Text node

__Example:__

```javascript
const text = doc.createTextNode('Hello, world!');
para.appendChild(text);

// Can contain special characters
const special = doc.createTextNode('Use [[ to escape brackets');
```

### `createCommentNode(text)`

Creates an HTML comment node.

__Parameters:__

- `text` (string) - Comment text

__Returns:__ (Comment) Comment node

__Example:__

```javascript
const comment = doc.createCommentNode('This is a comment');
doc.appendChild(comment);
// Renders as: <!-- This is a comment -->

// Useful for parser markers
const marker = doc.createCommentNode('PLUGIN:IndexPlugin');
```

## DOM Manipulation Methods

### `appendChild(node)`

Appends a child to the root element.

__Parameters:__

- `node` (Node) - Node to append

__Returns:__ (Node) Appended node

__Example:__

```javascript
const para = doc.createElement('p');
para.textContent = 'New paragraph';
doc.appendChild(para);

// Chain multiple appends
doc.appendChild(doc.createElement('div'))
   .appendChild(doc.createTextNode('Content'));
```

### `insertBefore(newNode, referenceNode)`

Inserts a node before a reference node.

__Parameters:__

- `newNode` (Node) - Node to insert
- `referenceNode` (Node) - Reference node

__Returns:__ (Node) Inserted node

__Example:__

```javascript
const first = doc.createElement('p');
first.textContent = 'First';
doc.appendChild(first);

const second = doc.createElement('p');
second.textContent = 'Second';
doc.appendChild(second);

// Insert between
const middle = doc.createElement('hr');
doc.insertBefore(middle, second);
// Result: first, hr, second
```

### `removeChild(node)`

Removes a child from the root element.

__Parameters:__

- `node` (Node) - Node to remove

__Returns:__ (Node) Removed node

__Example:__

```javascript
const para = doc.createElement('p');
doc.appendChild(para);

// Remove it
doc.removeChild(para);

// Can be re-added later
doc.appendChild(para);
```

### `replaceChild(newNode, oldNode)`

Replaces a child node.

__Parameters:__

- `newNode` (Node) - New node
- `oldNode` (Node) - Node to replace

__Returns:__ (Node) Replaced (old) node

__Example:__

```javascript
const old = doc.createElement('p');
old.textContent = 'Old content';
doc.appendChild(old);

const newEl = doc.createElement('div');
newEl.textContent = 'New content';
doc.replaceChild(newEl, old);
```

## DOM Query Methods

### `querySelector(selector)`

Finds the first element matching a CSS selector.

__Parameters:__

- `selector` (string) - CSS selector

__Returns:__ (Element|null) First matching element or null

__Example:__

```javascript
// By ID
const title = doc.querySelector('#page-title');

// By class
const firstPara = doc.querySelector('.wiki-para');

// Complex selector
const special = doc.querySelector('div.content > p.important');

// Attribute selector
const escaped = doc.querySelector('[data-escaped="true"]');
```

__Common Selectors:__

```javascript
'#id'                    // Element with ID
'.class'                 // Element with class
'tag'                    // Elements by tag
'[attr]'                 // Has attribute
'[attr="value"]'         // Attribute equals
'.class1.class2'         // Multiple classes
'parent > child'         // Direct child
'ancestor descendant'    // Any descendant
```

### `querySelectorAll(selector)`

Finds all elements matching a CSS selector.

__Parameters:__

- `selector` (string) - CSS selector

__Returns:__ (NodeList) All matching elements

__Example:__

```javascript
// All paragraphs
const paras = doc.querySelectorAll('p');
console.log(`Found ${paras.length} paragraphs`);

// All wiki links
const links = doc.querySelectorAll('a.wikilink');

// Iterate results
paras.forEach(para => {
  console.log(para.textContent);
});

// Convert to array
const array = Array.from(paras);
```

### `getElementById(id)`

Finds an element by ID.

__Parameters:__

- `id` (string) - Element ID (without #)

__Returns:__ (Element|null) Element or null

__Example:__

```javascript
const heading = doc.getElementById('section-1');
if (heading) {
  console.log(heading.textContent);
}
```

__Note:__ Faster than `querySelector('#id')` for single ID lookups.

### `getElementsByClassName(className)`

Finds elements by class name.

__Parameters:__

- `className` (string) - Class name (without .)

__Returns:__ (HTMLCollection) Live collection of elements

__Example:__

```javascript
const wikis = doc.getElementsByClassName('wiki-para');
console.log(`Found ${wikis.length} wiki paragraphs`);

// Live collection - updates automatically
const count1 = wikis.length;
doc.appendChild(doc.createElement('p', { class: 'wiki-para' }));
const count2 = wikis.length; // count2 > count1
```

### `getElementsByTagName(tagName)`

Finds elements by tag name.

__Parameters:__

- `tagName` (string) - Tag name

__Returns:__ (HTMLCollection) Live collection of elements

__Example:__

```javascript
const headings = doc.getElementsByTagName('h1');
const lists = doc.getElementsByTagName('ul');
const allDivs = doc.getElementsByTagName('div');
```

## Serialization Methods

### `toHTML()`

Serializes the document to HTML string.

__Returns:__ (string) HTML content (innerHTML of root)

__Example:__

```javascript
const html = doc.toHTML();
console.log(html);
// <h1 id="title">Welcome</h1>
// <p class="wiki-para">This is content.</p>
```

__Use Cases:__

```javascript
// Render to page
response.send(doc.toHTML());

// Save to cache
cache.set('page-123', doc.toHTML());

// Compare output
const before = doc.toHTML();
processDocument(doc);
const after = doc.toHTML();
```

### `toString()`

Returns a debug-friendly string representation.

__Returns:__ (string) Debug string

__Example:__

```javascript
console.log(doc.toString());
// WikiDocument[5 nodes, 123 chars]
```

__Use in Logs:__

```javascript
logger.debug(`Processing ${doc.toString()}`);
logger.info(`Created ${doc}`); // toString() called automatically
```

### `toJSON()`

Serializes to JSON for caching.

__Returns:__ (Object) JSON-serializable object

__Structure:__

```javascript
{
  pageData: string,      // Original markup
  html: string,          // Rendered HTML
  metadata: Object,      // Metadata copy
  version: string,       // Document version
  timestamp: string      // ISO 8601 timestamp
}
```

__Example:__

```javascript
const json = doc.toJSON();
const jsonString = JSON.stringify(json);

// Save to cache
await cache.set('doc-123', jsonString);

// Save to file
await fs.writeFile('cached.json', jsonString);
```

### `fromJSON(json, context)` (static)

Deserializes from JSON (cache restore).

__Parameters:__

- `json` (Object) - JSON object from toJSON()
- `context` (Object|null) - Optional rendering context

__Returns:__ (WikiDocument) Restored document

__Example:__

```javascript
// Load from cache
const jsonString = await cache.get('doc-123');
const json = JSON.parse(jsonString);

// Restore document
const doc = WikiDocument.fromJSON(json, { pageName: 'Test' });

// Document is ready to use
console.log(doc.toHTML());
console.log(doc.getPageData());
```

__Cache Strategy:__

```javascript
// Check cache first
const cached = await cache.get(cacheKey);
if (cached) {
  return WikiDocument.fromJSON(JSON.parse(cached), context);
}

// Parse and cache
const doc = await parser.parse(content, context);
await cache.set(cacheKey, JSON.stringify(doc.toJSON()));
return doc;
```

## Utility Methods

### `getRootElement()`

Returns the root element (body).

__Returns:__ (Element) Root element

__Example:__

```javascript
const root = doc.getRootElement();
console.log(root.tagName); // 'BODY'
console.log(root.childNodes.length);

// Direct DOM manipulation
root.innerHTML = '<p>Direct HTML</p>';
```

### `clear()`

Removes all content from the document.

__Example:__

```javascript
doc.clear();
console.log(doc.isEmpty()); // true
console.log(doc.getChildCount()); // 0
```

__Use Cases:__

```javascript
// Reset document for reuse
doc.clear();
rebuildContent(doc);

// Clear before error message
doc.clear();
doc.appendChild(createErrorElement('Parse failed'));
```

### `getChildCount()`

Returns the number of child nodes in root.

__Returns:__ (number) Child count

__Example:__

```javascript
console.log(`Document has ${doc.getChildCount()} top-level nodes`);

if (doc.getChildCount() === 0) {
  console.log('Document is empty');
}
```

### `isEmpty()`

Checks if the document has no content.

__Returns:__ (boolean) True if empty

__Example:__

```javascript
if (doc.isEmpty()) {
  console.warn('No content parsed');
} else {
  console.log('Content:', doc.toHTML());
}
```

### `getStatistics()`

Returns document statistics.

__Returns:__ (Object) Statistics object

__Structure:__

```javascript
{
  nodeCount: number,        // Number of child nodes
  pageDataLength: number,   // Length of original markup
  htmlLength: number,       // Length of HTML output
  hasContext: boolean,      // Context still alive
  metadata: number          // Metadata key count
}
```

__Example:__

```javascript
const stats = doc.getStatistics();
console.log('Statistics:', stats);
// {
//   nodeCount: 15,
//   pageDataLength: 234,
//   htmlLength: 1456,
//   hasContext: true,
//   metadata: 5
// }

// Log stats
logger.info(`Parsed ${stats.nodeCount} nodes from ${stats.pageDataLength} chars`);
```

## Complete Usage Example

```javascript
const WikiDocument = require('./src/parsers/dom/WikiDocument');

// Create document
const doc = new WikiDocument(
  '!! Welcome\nThis is a *wiki* page.',
  { pageName: 'Welcome', user: 'admin' }
);

// Set metadata
doc.setMetadata('author', 'Admin');
doc.setMetadata('version', 1);

// Build DOM
const heading = doc.createElement('h1', { id: 'title' });
heading.textContent = 'Welcome';
doc.appendChild(heading);

const para = doc.createElement('p', { class: 'wiki-para' });
const text = doc.createTextNode('This is a ');
const bold = doc.createElement('strong');
bold.textContent = 'wiki';
const text2 = doc.createTextNode(' page.');

para.appendChild(text);
para.appendChild(bold);
para.appendChild(text2);
doc.appendChild(para);

// Query DOM
const title = doc.querySelector('#title');
console.log('Title:', title.textContent);

const paras = doc.querySelectorAll('p');
console.log('Paragraphs:', paras.length);

// Serialize
console.log('HTML:', doc.toHTML());
console.log('Stats:', doc.getStatistics());

// Cache
const json = doc.toJSON();
const jsonStr = JSON.stringify(json);
await cache.set('welcome-page', jsonStr);

// Restore from cache
const cached = JSON.parse(await cache.get('welcome-page'));
const restored = WikiDocument.fromJSON(cached, { pageName: 'Welcome' });
console.log('Restored:', restored.toHTML());
```

## Differences from JSPWiki JDOM2

| Feature | JSPWiki (JDOM2) | WikiDocument (linkedom) |
| --------- | ----------------- | ------------------------- |
| __Base Class__ | `org.jdom2.Document` | Custom class with linkedom |
| __Language__ | Java | JavaScript/Node.js |
| __DOM API__ | JDOM2 API | W3C DOM API |
| __Element Creation__ | `new Element("tag")` | `createElement("tag")` |
| __Attributes__ | `element.setAttribute()` | `element.setAttribute()` |
| __Query__ | XPath via `XPathFactory` | CSS selectors via `querySelector()` |
| __Serialization__ | `XMLOutputter` | `innerHTML` / `toHTML()` |
| __Context Storage__ | `WeakReference<Context>` | `WeakRef` (ES2021) |
| __Caching__ | XML serialization | JSON serialization |
| __Performance__ | JVM-dependent | ~390μs per page |
| __Memory__ | JVM heap | ~21 KB per page |

### API Mapping

#### JSPWiki → WikiDocument

```java
// JSPWiki
Element elem = new Element("p");
elem.setAttribute("class", "para");
elem.addContent("Text");
document.getRootElement().addContent(elem);
```

```javascript
// WikiDocument
const elem = doc.createElement('p', { class: 'para' });
elem.textContent = 'Text';
doc.appendChild(elem);
```

#### Query Mapping

```java
// JSPWiki (XPath)
List<Element> elements = XPath.selectNodes(document, "//p[@class='para']");
```

```javascript
// WikiDocument (CSS Selectors)
const elements = doc.querySelectorAll('p.para');
```

## Performance Characteristics

Based on benchmarks with 1000 iterations:

| Operation | Time | Notes |
| ----------- | ------ | ------- |
| __Create Document__ | 28μs | Very fast, minimal overhead |
| __Create 100 Elements__ | 690μs | Including attributes and text |
| __Serialize to HTML__ | 54μs | Fast innerHTML access |
| __Query (querySelector)__ | 4.2μs | Optimized CSS selector engine |
| __JSON Cache Save__ | 10μs | Lightweight serialization |
| __JSON Cache Restore__ | 330μs | Includes DOM rebuild |
| __Complex Page__ | 390μs | Full page with headings, lists, paragraphs |

__Capacity:__

- __2,564 pages/second__ throughput
- __2.11 MB__ memory for 100 cached pages
- __Sub-millisecond__ operations

## Best Practices

### 1. Context Management

✅ __Do:__

```javascript
// Let context be GC'd when done
function processPage(content) {
  const context = { pageName, user, timestamp };
  const doc = new WikiDocument(content, context);
  return doc.toHTML(); // context can be GC'd after
}
```

❌ __Don't:__

```javascript
// Keep context in closure unnecessarily
const contexts = [];
function processPage(content) {
  const context = { pageName, user };
  contexts.push(context); // Memory leak!
  return new WikiDocument(content, context);
}
```

### 2. Metadata Usage

✅ __Do:__

```javascript
doc.setMetadata('processed', true);
doc.setMetadata('parseTime', performance.now() - start);
doc.setMetadata('cacheKey', generateKey(pageName));
```

❌ __Don't:__

```javascript
doc.setMetadata('largeObject', hugeArray); // Bloats metadata
```

### 3. Caching Strategy

✅ __Do:__

```javascript
// Cache serialized JSON
const json = JSON.stringify(doc.toJSON());
await cache.set(key, json);

// Restore when needed
const cached = await cache.get(key);
if (cached) {
  return WikiDocument.fromJSON(JSON.parse(cached));
}
```

### 4. DOM Building

✅ __Do:__

```javascript
// Build incrementally
const container = doc.createElement('div');
items.forEach(item => {
  const el = doc.createElement('p');
  el.textContent = item;
  container.appendChild(el);
});
doc.appendChild(container);
```

❌ __Don't:__

```javascript
// Build HTML string and parse
doc.root.innerHTML = items.map(item => `<p>${item}</p>`).join('');
```

## Related Documentation

- [WikiDocument-DOM-Architecture.md](./WikiDocument-DOM-Architecture.md) - Architecture overview
- [WikiDocument-Migration-TODO.md](./WikiDocument-Migration-TODO.md) - Migration plan
- [WikiDocument-DOM-Library-Evaluation.md](./WikiDocument-DOM-Library-Evaluation.md) - Library selection
- [GitHub Issue #93](https://github.com/jwilleke/ngdpbase/issues/93) - Epic tracking

## Version History

### v1.0.0 (2025-10-12) - Phase 1 Complete

- ✅ Initial implementation with linkedom
- ✅ Full W3C DOM API
- ✅ Metadata storage
- ✅ WeakRef context
- ✅ JSON serialization/deserialization
- ✅ 35 unit tests (100% passing)
- ✅ Performance benchmarks (all criteria exceeded)

---

__Status:__ Production Ready
__Test Coverage:__ 35 tests passing
__Performance:__ Exceeds all criteria by 25-238x
__Maintained By:__ Development Team
