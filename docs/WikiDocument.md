# WikiDocument Summary

`WikiDocument` is a key architectural component in ngdpbase that provides a DOM-based representation of a wiki page. It is inspired by JSPWiki's class of the same name and is designed to solve the problems of fragile, order-dependent string-based parsing.

## Core Purpose

The primary purpose of `WikiDocument` is to enable a robust parsing pipeline where different types of content (Markdown vs. JSPWiki syntax) can be handled by specialized tools without conflict.

- __Markdown__ is processed by the __Showdown__ library.
- __JSPWiki Syntax__ (variables, plugins, links) is parsed into a `WikiDocument` instance, which provides a structured, W3C-compliant DOM tree.

This separation of concerns permanently fixes a class of bugs related to escaping and incorrect rendering order.

## Key Features

- __DOM Structure__: Uses the lightweight and performant `linkedom` library to provide a standard DOM API.
- __Decoupling__: The parser extracts JSPWiki syntax and creates `WikiDocument` nodes, but the final HTML is rendered by merging these nodes into Showdown's output. This decouples the components.
- __Cacheable__: `WikiDocument` instances can be serialized to and from JSON, allowing for efficient caching of parsed content.
- __High Performance__: The entire pipeline is faster and more memory-efficient than the legacy string-based parser.

---

__For a complete technical deep-dive, including the full API, architecture diagrams, and usage examples, please see the [WikiDocument Complete Guide](./docs/WikiDocument-Complete-Guide.md).__
