# ngdpbase vs Apache JSPWiki Architecture Comparison

This document compares the rendering pipeline architecture of ngdpbase (Node.js) with Apache JSPWiki (Java), highlighting similarities, differences, and implementation approaches.

## Architecture Overview Comparison

### Apache JSPWiki (Java/JSP)

```text
Java Web Application (Servlet API 3.1)
├── WikiEngine (Central Controller)
├── RenderingManager
│   ├── XHTMLRenderer
│   ├── CreoleRenderer
│   ├── CleanTextRenderer
│   └── WysiwygEditingRenderer
├── PluginManager / DefaultPluginManager
│   └── Built-in Plugins (Java Classes)
├── Security (JAAS-based)
│   └── WEB-INF/jspwiki.policy
└── Configuration: jspwiki-custom.properties
```

### ngdpbase (Node.js/Express)

```text
Node.js Web Application (Express Framework)
├── WikiEngine (Central Manager Orchestrator)
├── MarkupParser (7-Phase Pipeline)
│   ├── Syntax Handlers (8 Handlers)
│   ├── Filter Pipeline (3 Filters)
│   ├── PluginManager
│   └── HTML Protection System
├── RenderingManager (Advanced/Legacy)
├── Security (Multi-layered)
│   ├── SecurityFilter + SpamFilter + ValidationFilter
│   └── ACLManager + PolicyEvaluator
└── Configuration: app-default/custom-config.json
```

## Detailed Component Comparison

### 1. Core Engine Architecture

| Aspect | Apache JSPWiki | ngdpbase |
| -------- | ---------------- | --------- |
| __Language__ | Java | Node.js/JavaScript |
| __Runtime__ | JVM (JDK 11+) | Node.js Runtime |
| __Web Framework__ | Servlet API 3.1, JSP | Express.js |
| __Deployment__ | WAR file to Tomcat/Jetty | npm package, PM2/Docker |
| __Central Controller__ | `WikiEngine.java` | `WikiEngine.js` + Manager System |

### 2. Rendering Pipeline Architecture

#### Apache JSPWiki Rendering Flow

```text
Raw Wiki Content
       ↓
WikiEngine.getHTML()
       ↓
RenderingManager
       ↓
Strategy Pattern: Select Renderer
├── XHTMLRenderer (Primary)
├── CreoleRenderer (Alternative markup)
├── CleanTextRenderer (Plain text)
└── WysiwygEditingRenderer (Editor)
       ↓
Plugin Processing (PluginManager)
       ↓
Security Filtering (JAAS)
       ↓
Final HTML Output
```

#### ngdpbase 7-Phase Pipeline

```text
Raw Wiki Content
       ↓
Phase 1: Preprocessing (Normalization)
       ↓
Phase 2: Syntax Recognition (8 Handlers)
       ↓
Phase 3: Context Resolution (Link Graph)
       ↓
Phase 4: Content Transformation + HTML Protection
       ↓
Phase 5: Filter Pipeline (Security/Spam/Validation)
       ↓
Phase 6: Markdown Conversion (Showdown.js)
       ↓
Phase 7: Post-processing + Token Restoration
       ↓
Final HTML Output
```

### 3. Plugin System Comparison

#### Apache JSPWiki Plugins

- __Interface__: `WikiPlugin` (Java interface)
- __Manager__: `PluginManager.java` / `DefaultPluginManager.java`
- __Location__: `org.apache.wiki.plugin` package
- __Type Safety__: Java compile-time type checking
- __Built-in Plugins__:
  - `CurrentTimePlugin`
  - `RecentChangesPlugin`
  - `SearchPlugin`
  - `ReferringPagesPlugin`
  - `WeblogPlugin`
  - `TableOfContents`

#### ngdpbase Plugins

- __Interface__: JavaScript module exports (`execute` method)
- __Manager__: `PluginManager.js` with dynamic loading
- __Location__: `/plugins/` directory
- __Type Safety__: Runtime validation with parameter schemas
- __Built-in Plugins__:
  - `ImagePlugin.js`
  - `SessionsPlugin.js`
  - `TotalPagesPlugin.js`
  - `UptimePlugin.js`
  - `ReferringPagesPlugin.js`

### 4. Security Architecture

#### Apache JSPWiki Security

```text
JAAS (Java Authentication & Authorization)
├── WEB-INF/jspwiki.policy (Access Control)
├── Enterprise security integration
├── Servlet container security
└── Type-safe Java security model
```

#### ngdpbase Security

```text
Multi-layered Node.js Security
├── SecurityFilter (XSS, CSRF, HTML Sanitization)
├── SpamFilter (Link limits, domain blacklists)
├── ValidationFilter (Content validation)
├── ACLManager (Page-level permissions)
├── PolicyEvaluator (Rule-based access control)
└── HTML Protection System (Double-encoding prevention)
```

### 5. Configuration Management

| Aspect | Apache JSPWiki | ngdpbase |
| -------- | ---------------- | --------- |
| __Primary Config__ | `jspwiki-custom.properties` | `app-custom-config.json` |
| __Format__ | Java Properties | Hierarchical JSON |
| __Override System__ | Properties file cascade | JSON merge with defaults |
| __Deployment Config__ | WAR deployment descriptors | Environment variables + JSON |
| __Security Config__ | `jspwiki.policy` (JAAS) | JSON policy definitions |

## Key Architectural Differences

### 1. Processing Philosophy

#### Apache JSPWiki: Strategy Pattern

- __Multiple Renderers__: Different renderer classes for different output formats
- __Renderer Selection__: Strategy pattern chooses appropriate renderer
- __Extensibility__: Add new renderers by implementing renderer interface
- __Focus__: Format-specific rendering strategies

#### ngdpbase: Pipeline Processing

- __Single Pipeline__: One 7-phase pipeline handles all processing
- __Handler Priority__: Ordered handler execution within phases
- __Extensibility__: Add handlers/filters to existing pipeline phases
- __Focus__: Comprehensive processing with security integration

### 2. Plugin Integration

#### Apache JSPWiki

```java
public interface WikiPlugin {
    public String execute(WikiContext context, Map<String, String> params)
        throws PluginException;
}
```

- __Compile-time Safety__: Java interface ensures method signatures
- __Context Object__: Rich `WikiContext` with full engine access
- __Exception Handling__: Typed exception handling
- __Performance__: Compiled Java performance

#### ngdpbase

```javascript
module.exports = {
    async execute(pluginName, pageName, params, context) {
        // Plugin implementation
        return htmlOutput;
    }
};
```

- __Runtime Flexibility__: Dynamic loading and parameter validation
- __Async Support__: Native Promise/async-await support
- __Context Isolation__: Controlled context exposure
- __Performance__: V8 JavaScript engine optimization

### 3. Security Models

#### Apache JSPWiki: Enterprise Security

- __JAAS Integration__: Full Java Authentication and Authorization Service
- __Container Security__: Leverages servlet container security
- __Policy Files__: Declarative security policies
- __Type Safety__: Compile-time security contract validation

#### ngdpbase: Layered Web Security

- __Filter Chain__: Multiple security filters in processing pipeline
- __HTML Protection__: Prevents double-encoding vulnerabilities
- __Content Validation__: Real-time content security analysis
- __Dynamic Policies__: Runtime policy evaluation and updates

### 4. Performance Characteristics

| Aspect | Apache JSPWiki | ngdpbase |
| -------- | ---------------- | --------- |
| __Startup Time__ | Slower (JVM warmup) | Faster (Node.js startup) |
| __Runtime Performance__ | Optimized JVM execution | V8 JavaScript optimization |
| __Memory Usage__ | Higher JVM overhead | Lower Node.js footprint |
| __Concurrency Model__ | Thread-based (servlet model) | Event-driven (single-threaded) |
| __Caching__ | JVM heap + external | In-memory + Redis integration |

## Compatibility Analysis

### Syntax Compatibility

Both systems support identical JSPWiki markup:

- __Plugin Syntax__: `[{PluginName param=value}]` ✅
- __Variable Syntax__: `[{$variablename}]` ✅
- __Escaped Syntax__: `[[{syntax}]` ✅
- __Wiki Links__: `[PageName]` ✅
- __Inter-wiki Links__: `[WikiName:PageName]` ✅

### Plugin Compatibility

| Plugin | JSPWiki | ngdpbase | Compatibility |
| -------- | --------- | --------- | --------------- |
| ReferringPages | ✅ | ✅ | Full |
| CurrentTime | ✅ | ⚠️ (as UptimePlugin) | Functional |
| Search | ✅ | ✅ | Full |
| Image | ⚠️ (built-in) | ✅ | Enhanced |
| TableOfContents | ✅ | ⚠️ (planned) | Partial |

## Migration Considerations

### From JSPWiki to ngdpbase

__Advantages of ngdpbase:__

- __Faster Development__: JavaScript ecosystem and npm packages
- __Modern Web Stack__: Express.js, modern frontend integration
- __Enhanced Security__: Multi-layered security with HTML protection
- __Better Performance__: Event-driven architecture for web workloads
- __Easier Deployment__: Docker/container-friendly, cloud-native

__Challenges:__

- __Plugin Migration__: Java plugins need JavaScript rewrite
- __Configuration Changes__: Properties files → JSON configuration
- __Security Model__: JAAS policies → JSON-based ACL system
- __Enterprise Features__: Some enterprise Java features may need adaptation

### Recommended Migration Path

1. __Content Migration__: Export JSPWiki pages → Import to ngdpbase
2. __Plugin Assessment__: Inventory existing plugins → Rewrite in JavaScript
3. __Security Mapping__: JAAS policies → ngdpbase ACL configuration
4. __Testing__: Comprehensive rendering compatibility testing
5. __Performance Tuning__: Node.js optimization for production load

## Conclusion

Both Apache JSPWiki and ngdpbase provide robust wiki processing capabilities with different architectural approaches:

- __Apache JSPWiki__: Mature, enterprise-focused Java platform with proven scalability
- __ngdpbase__: Modern, flexible Node.js platform with enhanced security and web-native features

The choice depends on organizational requirements:

- Choose __JSPWiki__ for enterprise Java environments with existing infrastructure
- Choose __ngdpbase__ for modern web applications requiring flexibility and rapid development

Both maintain excellent JSPWiki markup compatibility while offering unique architectural advantages suited to their respective ecosystems.
