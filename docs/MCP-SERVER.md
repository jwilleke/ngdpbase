# ngdpbase MCP Server

The ngdpbase MCP (Model Context Protocol) Server provides AI assistants like Claude with direct access to wiki content, search functionality, validation, and metadata operations.

## Overview

The MCP server exposes 17 specialized tools that allow AI assistants to:

- Query and search wiki pages
- **Create, update, and delete wiki pages**
- Access metadata and categories
- Validate and generate page metadata
- Find similar pages and attachments
- Query configuration settings
- Get search statistics
- Upload attachments (single or bulk)

## Installation

The MCP SDK is already installed as a dependency:

```bash
npm install
```

## Running the MCP Server

### Development Mode

```bash
npm run build  # Build TypeScript first
npm run mcp    # Start MCP server
```

The server runs in stdio mode, communicating via standard input/output as per the MCP specification.

### Integration with Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "ngdpbase": {
      "command": "node",
      "args": [
        "/path/to/ngdpbase/dist/mcp-server.js"
      ],
      "cwd": "/path/to/ngdpbase"
    }
  }
}
```

### Integration with Claude Code CLI

Add to `~/.claude/mcp.json` (or project-level `.claude/mcp.json`):

```json
{
  "mcpServers": {
    "ngdpbase": {
      "command": "node",
      "args": [
        "/path/to/ngdpbase/dist/mcp-server.js"
      ],
      "cwd": "/path/to/ngdpbase"
    }
  }
}
```

### Integration with Other AI Agents

The MCP server uses the **Model Context Protocol** — an open standard for AI-tool integration. Any AI agent that implements an MCP client can connect.

**How it works:**

- The server communicates via **stdio transport** (JSON-RPC 2.0 over stdin/stdout)
- Agents discover available tools by sending a `tools/list` request
- Agents invoke tools by sending `tools/call` requests with tool name and arguments
- All responses are JSON-formatted

**Compatible platforms:**

| Platform | Configuration Location |
| --- | --- |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Code CLI | `~/.claude/mcp.json` or `.claude/mcp.json` |
| Cursor | Settings → MCP Servers |
| Windsurf | MCP configuration in settings |
| Custom agents | Implement MCP client SDK |

**For custom AI agents**, use the official MCP SDK:

```bash
npm install @modelcontextprotocol/sdk
```

Example client connection (Node.js):

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/path/to/ngdpbase/dist/mcp-server.js'],
  cwd: '/path/to/ngdpbase'
});

const client = new Client({ name: 'my-agent', version: '1.0.0' });
await client.connect(transport);

// List available tools
const tools = await client.listTools();

// Call a tool
const result = await client.callTool('ngdpbase_search', {
  query: 'validation',
  max_results: 10
});
```

## How to Use

Once the MCP server is configured in Claude Desktop or Claude Code, the AI assistant automatically gains access to all ngdpbase tools. You can interact naturally:

**Ask questions about wiki content:**

- "What pages exist about validation?"
- "Show me the content of the Main page"
- "Find documentation related to metadata"

**Manage metadata:**

- "Generate metadata for a new page called 'Installation Guide'"
- "Validate this metadata structure"
- "What categories are available?"

**Upload attachments:**

- "Upload `/path/to/image.png` to the wiki"
- "Bulk upload all images from `/path/to/screenshots/`"
- "Upload `diagram.pdf` and attach it to the Architecture page"

**Explore wiki structure:**

- "List all pages in the documentation category"
- "What keywords are used across the wiki?"
- "Find pages similar to ValidationManager"

The AI assistant will select the appropriate tool(s) based on your request and return formatted results.

## Available Tools

### 1. ngdpbase_query_page

Get complete page content and metadata by identifier.

**Parameters:**

- `identifier` (string, required): Page title, UUID, or slug
- `include_content` (boolean, optional): Include full content (default: true)

**Example:**

```json
{
  "identifier": "Main",
  "include_content": true
}
```

**Returns:**

```json
{
  "title": "Main",
  "uuid": "abc123...",
  "slug": "main",
  "category": "general",
  "keywords": ["welcome", "introduction"],
  "lastModified": "2025-11-26T...",
  "editor": "admin",
  "content": "# Welcome to ngdpbase..."
}
```

### 2. ngdpbase_list_pages

List all pages with optional filtering.

**Parameters:**

- `category` (string, optional): Filter by system category
- `keywords` (array, optional): Filter by user keywords
- `limit` (number, optional): Max results (default: 50)

**Example:**

```json
{
  "category": "documentation",
  "keywords": ["tutorial"],
  "limit": 20
}
```

### 3. ngdpbase_search

Full-text search with advanced filtering.

**Parameters:**

- `query` (string, required): Search text
- `categories` (array, optional): Filter by categories
- `keywords` (array, optional): Filter by keywords
- `search_in` (array, optional): Fields to search (default: ["title", "content", "metadata"])
- `max_results` (number, optional): Max results (default: 20)

**Example:**

```json
{
  "query": "validation metadata",
  "categories": ["documentation"],
  "max_results": 10
}
```

**Returns:**

```json
{
  "total": 5,
  "results": [
    {
      "title": "ValidationManager",
      "score": 0.95,
      "excerpt": "...validation of metadata...",
      "category": "documentation",
      "keywords": ["validation", "metadata"],
      "uuid": "5100a3df..."
    }
  ]
}
```

### 4. ngdpbase_get_metadata

Get page metadata only (fast, no content).

**Parameters:**

- `identifier` (string, required): Page identifier

**Example:**

```json
{
  "identifier": "Main"
}
```

### 5. ngdpbase_list_categories

Get all system categories with configurations.

**Parameters:** None

**Returns:**

```json
{
  "categories": [
    {
      "label": "general",
      "description": "General wiki pages",
      "default": true,
      "storageLocation": "regular",
      "enabled": true
    },
    {
      "label": "documentation",
      "description": "Documentation",
      "storageLocation": "required",
      "enabled": true
    }
  ]
}
```

### 6. ngdpbase_list_keywords

Get all user keywords in use across pages.

**Parameters:** None

**Returns:**

```json
{
  "keywords": ["tutorial", "guide", "api", "configuration", ...]
}
```

### 7. ngdpbase_validate_metadata

Validate page metadata structure.

**Parameters:**

- `metadata` (object, required): Metadata to validate

**Example:**

```json
{
  "metadata": {
    "title": "New Page",
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "slug": "new-page",
    "system-category": "general",
    "user-keywords": ["example"]
  }
}
```

**Returns:**

```json
{
  "valid": true,
  "errors": []
}
```

### 8. ngdpbase_generate_metadata

Generate valid metadata template for a new page.

**Parameters:**

- `title` (string, required): Page title
- `category` (string, optional): System category (default: "general")
- `keywords` (array, optional): User keywords (max 5)

**Example:**

```json
{
  "title": "My New Page",
  "category": "documentation",
  "keywords": ["tutorial", "guide"]
}
```

**Returns:** Complete valid metadata object ready for use.

### 9. ngdpbase_get_attachments

List attachments for a page.

**Parameters:**

- `page_name` (string, required): Page identifier

**Example:**

```json
{
  "page_name": "Main"
}
```

**Returns:**

```json
{
  "attachments": [
    {
      "id": "attachment-uuid",
      "filename": "diagram.png",
      "size": 12345,
      "mimeType": "image/png",
      "uploadedBy": "admin",
      "uploadedAt": "2025-11-26T..."
    }
  ]
}
```

### 10. ngdpbase_search_similar

Find pages similar to a given page.

**Parameters:**

- `page_name` (string, required): Reference page
- `limit` (number, optional): Max results (default: 10)

**Example:**

```json
{
  "page_name": "ValidationManager",
  "limit": 5
}
```

### 11. ngdpbase_get_configuration

Get wiki configuration value(s).

**Parameters:**

- `key` (string, optional): Specific config key

**Example:**

```json
{
  "key": "ngdpbase.page.provider"
}
```

If no key provided, returns all configuration (large response).

### 12. ngdpbase_get_search_statistics

Get search index statistics.

**Parameters:** None

**Returns:**

```json
{
  "documentCount": 125,
  "indexSize": "2.3 MB",
  "lastIndexed": "2025-11-26T..."
}
```

### 13. ngdpbase_upload_attachment

Upload a single file as an attachment, optionally linking it to a page.

**Parameters:**

- `file_path` (string, required): Absolute path to the file to upload
- `page_name` (string, optional): Page name to attach the file to
- `description` (string, optional): Description for the attachment

**Example:**

```json
{
  "file_path": "/Users/jim/screenshots/diagram.png",
  "page_name": "Architecture",
  "description": "System architecture diagram"
}
```

**Returns:**

```json
{
  "success": true,
  "attachmentId": "a1b2c3d4...",
  "filename": "diagram.png",
  "size": 45678,
  "mimeType": "image/png",
  "pageName": "Architecture",
  "message": "Attachment uploaded successfully and linked to page \"Architecture\""
}
```

### 15. ngdpbase_create_page

Create a new wiki page. Fails if a page with that title already exists.

> For a **running** instance or a remote/automated agent, prefer the HTTP endpoint `POST /api/page/ingest` ([Agent Ingest API](Agent-Ingest-API.md)) — it goes through the live server (in-band index update, immediately viewable + searchable) and authors the page as the authenticated user. This stdio tool writes the data dir directly and is best for local/offline authoring.

**Parameters:**

- `title` (string, required): Page title (must be unique)
- `content` (string, required): Page content in wiki markup / Markdown
- `category` (string, optional): System category (default: `"general"`)
- `keywords` (array, optional): User keywords (max 5)

**Example:**

```json
{
  "title": "Deployment Guide",
  "content": "# Deployment Guide\n\nThis guide covers...",
  "category": "documentation",
  "keywords": ["deployment", "guide"]
}
```

**Returns:**

```json
{
  "success": true,
  "title": "Deployment Guide",
  "uuid": "550e8400-...",
  "slug": "deployment-guide",
  "category": "documentation",
  "keywords": ["deployment", "guide"],
  "message": "Page \"Deployment Guide\" created successfully"
}
```

### 16. ngdpbase_update_page

Update an existing wiki page. Supply any combination of `content`, `category`, or `keywords` — only provided fields are changed; the rest are preserved.

**Parameters:**

- `identifier` (string, required): Page identifier: title, UUID, or slug
- `content` (string, optional): New content (replaces existing content)
- `category` (string, optional): New system category
- `keywords` (array, optional): New user keywords (replaces existing keywords)

At least one of `content`, `category`, or `keywords` must be provided.

**Example:**

```json
{
  "identifier": "Deployment Guide",
  "content": "# Deployment Guide\n\nUpdated content...",
  "keywords": ["deployment", "guide", "production"]
}
```

**Returns:**

```json
{
  "success": true,
  "title": "Deployment Guide",
  "uuid": "550e8400-...",
  "slug": "deployment-guide",
  "category": "documentation",
  "keywords": ["deployment", "guide", "production"],
  "lastModified": "2026-04-28T09:23:00.000Z",
  "message": "Page \"Deployment Guide\" updated successfully"
}
```

### 17. ngdpbase_delete_page

Permanently delete a wiki page. Requires `confirm: true` to prevent accidental deletion.

**Parameters:**

- `identifier` (string, required): Page identifier: title, UUID, or slug
- `confirm` (boolean, required): Must be `true` to confirm deletion

**Example:**

```json
{
  "identifier": "Old Draft",
  "confirm": true
}
```

**Returns:**

```json
{
  "success": true,
  "identifier": "Old Draft",
  "title": "Old Draft",
  "message": "Page \"Old Draft\" deleted successfully"
}
```

### 14. ngdpbase_bulk_upload_attachments

Upload multiple files from a directory as attachments. Supports glob patterns and recursive directory scanning.

**Parameters:**

- `directory` (string, required): Absolute path to the directory containing files
- `pattern` (string, optional): Glob pattern to filter files (e.g., `*.png`, `*.pdf`, `image-*`)
- `page_name` (string, optional): Page name to link all uploaded attachments to
- `recursive` (boolean, optional): Include files from subdirectories (default: false)

**Example:**

```json
{
  "directory": "/Users/jim/wiki-images",
  "pattern": "*.png",
  "page_name": "Screenshots",
  "recursive": true
}
```

**Returns:**

```json
{
  "success": true,
  "uploaded": 5,
  "failed": 0,
  "total": 5,
  "totalSize": 234567,
  "pageName": "Screenshots",
  "message": "Uploaded 5 of 5 files to page \"Screenshots\"",
  "files": [
    { "filename": "screen1.png", "success": true, "attachmentId": "...", "size": 12345 },
    { "filename": "screen2.png", "success": true, "attachmentId": "...", "size": 23456 }
  ]
}
```

## Use Cases

### 1. AI-Assisted Content Discovery

AI assistants can search and navigate your wiki content naturally:

```text
User: "Find all documentation pages about validation"
AI: Uses ngdpbase_search with category filter
```

### 2. Context-Aware Development

When developing features, AI can pull relevant wiki documentation:

```text
User: "I'm working on the page manager, show me related docs"
AI: Uses ngdpbase_search and ngdpbase_search_similar
```

### 3. Metadata Management

AI can help validate and generate metadata:

```text
User: "Create metadata for a new tutorial page"
AI: Uses ngdpbase_generate_metadata with appropriate category
```

### 4. Content Analysis

AI can analyze wiki structure and relationships:

```text
User: "What categories exist and how many pages in each?"
AI: Uses ngdpbase_list_categories and ngdpbase_list_pages
```

### 5. Attachment Management

AI can upload files to the wiki:

```text
User: "Upload all screenshots from /path/to/images to the Tutorial page"
AI: Uses ngdpbase_bulk_upload_attachments with pattern and page_name
```

## Architecture

### Server Structure

```text
mcp-server.ts           # TypeScript source (root directory)
├── Tool Definitions    # 17 tool schemas
├── Request Handlers    # ListTools, CallTool
└── WikiEngine Init     # Lazy initialization

dist/mcp-server.js      # Compiled JavaScript
```

### WikiEngine Integration

The MCP server initializes WikiEngine on first tool call and maintains a single instance for all subsequent requests. This provides access to:

- **PageManager**: Page CRUD operations
- **SearchManager**: Full-text search with Lunr
- **ValidationManager**: Metadata validation and category management
- **AttachmentManager**: File attachment operations
- **ConfigurationManager**: System configuration access

### Communication Protocol

The server uses **stdio transport** per MCP specification:

- Receives JSON-RPC requests via stdin
- Sends JSON-RPC responses via stdout
- Logs errors to stderr

## Error Handling

All tool calls return structured error responses:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: Page not found: NonExistentPage"
    }
  ],
  "isError": true
}
```

Common errors:

- `Page not found`: Invalid identifier
- `Invalid metadata`: Validation failure
- `Manager not initialized`: WikiEngine initialization failed

## Performance Considerations

### Caching

The WikiEngine maintains in-memory caches:

- Page cache (full content)
- Title/UUID/Slug indexes
- Search index (Lunr)

### Lazy Loading

WikiEngine initializes only on first tool call, reducing startup time.

### Query Optimization

Use `include_content: false` for metadata-only queries to reduce response size.

## Security

### Access Control

The MCP server runs with full wiki access. Ensure:

- Server is only accessible to trusted AI assistants
- File system permissions are properly configured
- Configuration files are protected

### Data Exposure

Be aware that:

- All page content is accessible via MCP
- Configuration values can be queried
- No user authentication is enforced at MCP level

### Best Practices

1. Run MCP server in controlled environments
2. Use file system permissions to restrict data access
3. Monitor MCP server logs for unusual activity
4. Consider implementing rate limiting for production use

## Development

### Adding New Tools

1. Define tool schema in `ListToolsRequestSchema` handler
2. Add case to `CallToolRequestSchema` handler
3. Implement tool method in `NgdpbaseMCPServer` class
4. Update documentation

Example:

```typescript
{
  name: 'ngdpbase_my_tool',
  description: 'Tool description',
  inputSchema: {
    type: 'object',
    properties: {
      param: { type: 'string', description: 'Parameter description' }
    },
    required: ['param']
  }
}
```

### Testing

```bash
# Build
npm run build

# Run MCP server manually
node dist/mcp-server.js

# Test with MCP client or inspector tool
```

### Debugging

Enable debug logging by adding to WikiEngine initialization:

```typescript
console.error('MCP Debug:', JSON.stringify(result, null, 2));
```

All debug output goes to stderr (not stdout, which is reserved for MCP protocol).

## Troubleshooting

### Server Won't Start

**Issue**: `Cannot find module '@modelcontextprotocol/sdk'`

**Solution**:

```bash
npm install
npm run build
```

### WikiEngine Initialization Fails

**Issue**: `Manager not initialized`

**Solution**: Check that:

- `config/` directory exists
- `pages/` and `required-pages/` directories exist
- Configuration files are valid JSON

### Tool Returns Empty Results

**Issue**: Search/list operations return no results

**Solution**:

- Verify pages exist: `ls pages/`
- Rebuild search index: Restart MCP server
- Check page metadata format

### Performance Issues

**Issue**: Slow tool responses

**Solution**:

- Use `include_content: false` when content not needed
- Reduce `max_results` and `limit` parameters
- Check disk I/O performance
- Monitor WikiEngine cache sizes

## Future Enhancements

Planned improvements:

- [ ] User authentication integration
- [ ] Rate limiting
- [ ] Streaming responses for large content
- [ ] GraphQL-style queries
- [ ] Webhook notifications for page changes
- [ ] Export/import tools
- [ ] Backup management tools

Completed:

- [x] Attachment upload tools (v1.5.8)
- [x] Page CRUD — create, update, delete (#594)

## References

- [Model Context Protocol](https://modelcontextprotocol.io)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [ngdpbase Architecture](./architecture/)
- [ValidationManager](../required-pages/5100a3df-0d87-4d85-87de-359f51029c67.md)
- [Policies-Roles-Permissions](./architecture/Policies-Roles-Permissions.md)

## License

Same as ngdpbase main license.
