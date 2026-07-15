# WikiContext - The Rendering Orchestrator

`WikiContext` is the central orchestrator for content rendering in ngdpbase. For each page request, a `WikiContext` instance is created to act as a request-scoped container, bundling all information related to the request, such as page details, user information, and the HTTP request itself.

## Core Responsibilities

- **Orchestration**: It manages the entire rendering pipeline, from variable expansion and plugin execution to the final conversion of Markdown to HTML.
- **Data Provision**: It gathers and packages contextual data. Its primary role in the rendering pipeline is to create a plain JavaScript object (containing a `pageContext` property) via its `toParseOptions()` method.
- **Decoupling**: This `pageContext` object, *not* the `WikiContext` instance itself, is passed down to the lower-level rendering systems like `MarkupParser`, `VariableManager`, and `PluginManager`. This design choice is crucial as it decouples the core rendering logic from the `WikiContext` class, meaning plugins and managers are not dependent on `WikiContext` but rather on the simple data structure it provides.
- **Manager Access**: The `WikiContext` object itself holds direct references to all core engine managers (e.g., `RenderingManager`, `PluginManager`), using them to orchestrate the rendering process.

Inspired by JSPWiki's architectural patterns, `WikiContext` solves the problem of "parameter explosion" by providing a single, consistent object to the upper levels of the application, while ensuring the lower-level components remain decoupled and reusable.

---

**For a more detailed explanation of the API, architecture, and usage examples, please see the [WikiContext Complete Guide](./WikiContext-Complete-Guide.md).**
