# Page Metadata

## uuid

UUID is the unique identifer for the page MUST NOT be changed.
UUID is generated on page creation.

## title

title: is the name as rendered.

## lastModified

is the timestamp the page was last modifed

(Should be dateModified as to be complient with schema.org)

## creator

creator - the username that created the page

## editor

The user who last modified the document (<https://schema.org/editor>)

## Keywords and system-category

### system-category

system-category is defined in page [system-category](../required-pages/5100a3df-0d87-4d85-87de-359f51029c67.md)

## user-keywords

user-keywords are defined in [user-keywords](../required-pages/e3bc8a66-9a68-47bb-af14-d6f8b611a3b2.md)

- Multiple values

## system-keywords

Are future implementaion for AI Tags based on Content.

- Multiple values

## Required Fields (All Pages)

```yaml
title: "Page Name"
system-category: "system" | "user" | "documentation"
uuid: "auto-generated"
lastModified: "auto-updated"
```
