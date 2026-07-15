---
project_state: "Platform Roadmap"
lastModified: 2026-01-04-11:38:04'
---

# ngdpbase Digital Platform Roadmap

Last Updated: 2026-01-04
Current Version: 1.5.x+

## Platform Vision

ngdpbase is evolving from a JSPWiki-inspired wiki into a comprehensive digital platform for personal and organizational use. The goal is to create a modular, standards-based ecosystem that can be hosted locally or on the internet.

### Core Philosophy

- Modular Architecture: Plugin-based and add-on modules for different use cases
- Standards-First: RFC and widely-adopted standards support
- Local-First: Can run entirely offline while supporting cloud deployment
- Universal Platform: "Jack of all trades" digital workspace

## Platform Module Roadmap

### CRM Module

- Contact management
- Interaction tracking and history
- Sales pipeline management
- Task and reminder system
- Email integration
- Reporting and analytics

### Blog Module

- Multi-author blogging with RSS/Atom feeds
- Blog post templates and categories
- Comment system integration
- Social media sharing
- Author profiles and attribution

### Document Management

- File organization and categorization
- Advanced versioning features
- Document search and indexing
- Access control per document
- Collaborative editing

### Photo Management

- Gallery creation and management
- EXIF metadata extraction and display
- Album organization
- Image optimization and thumbnails
- Location-based photo mapping

### Asset Management

- Digital asset tracking
- Maintenance logs and histories
- Depreciation tracking
- Asset categorization and tagging
- Custom asset types

### E-Commerce Store

- Product catalog management
- Shopping cart functionality
- Payment gateway integration (Stripe, PayPal)
- Order management and fulfillment
- Customer accounts and order history
- Inventory tracking

### Project Management

- Task tracking and assignment
- Timeline and Gantt chart views
- Milestone management
- Team collaboration features
- Time tracking
- Resource allocation

### Knowledge Base

- FAQ management
- Documentation organization
- Help desk integration
- Search-optimized content
- Video tutorial embedding
- Multi-language support

## Advanced Platform

### API Gateway

- RESTful API for all modules
- OpenAPI 3.0 specifications
- API key management
- Rate limiting and throttling
- Webhook support
- GraphQL endpoint consideration

### Workflow Engine

- Business process automation
- Custom workflow creation
- Approval chains
- Scheduled task execution
- Integration with external services
- Event-driven triggers

### Reporting Dashboard

- Analytics across all modules
- Custom report builder
- Data visualization
- Export capabilities
- Scheduled reports
- Real-time metrics

### Multi-tenant Support

- Organization isolation
- User and data segregation
- Tenant-specific customization
- Billing integration
- Usage analytics per tenant

## Immediate Next Steps

### High Priority

#### Attachment UI Enhancement

- Upload widgets in edit pages
- Inline attachment management interface
- Image/video preview and optimization
- File organization and search within attachments
- Drag-and-drop upload support
- Attachment versioning

#### Mobile Optimization

- Responsive design improvements
- Touch-friendly UI components
- Mobile-optimized editor
- Progressive Web App (PWA) features
- Offline mode support
- Mobile navigation improvements

#### Performance Monitoring

- Analytics and metrics dashboard
- Page load time tracking
- Search performance metrics
- User activity analytics
- Server resource monitoring
- Performance bottleneck identification

### Medium Priority

#### Page Comments System

- Comment threads on wiki pages
- Mention system with notifications
- Moderation capabilities
- Comment search and filtering
- Threaded discussions
- Spam protection

#### Notification System

- Real-time alerts
- Page change notifications
- @mention alerts
- Email notification support
- Notification preferences per user
- Digest mode for notifications

#### Advanced Export Enhancements

- Batch export functionality
- Custom templates for exports
- EPUB format support
- OpenDocument (ODT/ODS) formats
- Export scheduling
- Export history and versioning

#### Plugin Development Enhancements

- Additional JSPWiki-compatible plugins
- Custom macro system expansion
- Third-party plugin marketplace
- Plugin configuration UI
- Plugin version management
- Plugin security sandboxing

### Future Considerations

#### Multiple Theme Support

- Additional UI themes beyond dark/light
- Theme customization interface
- Custom CSS per theme
- Theme marketplace
- User-created themes

#### Advanced Analytics

- Deep insights and reporting
- User behavior tracking
- Content popularity metrics
- Search analytics
- Conversion tracking (for e-commerce)

#### Workflow Automation

- Automated page management tasks
- Content publishing workflows
- Approval processes
- Scheduled content updates

#### Multi-language Support

- Full internationalization (i18n)
- Translation management
- Language-specific content
- RTL language support
- Locale-specific formatting

## Plugin and Feature Expansion

### JSPWiki-Compatible Plugins

#### ReferringPagesPlugin

- max: Limit number of pages listed (default 10)
- maxwidth: Limit link length
- separator: Custom separator markup
- page: Specify target page
- before/after: Custom markup around list
- show: Display pages or count
- showLastModified: Show modification time with count

#### TablePlugin Enhancements

- Zebra striping styles
- Filtered tables with column filters
- Sortable columns
- Column resizing
- Export table data
- Cell formatting options

### Variable System Expansion

- Additional system variables
- Custom user-defined variables
- Computed variables
- Context-aware variables
- Variable documentation page

### Page Template System

- Template library management
- Custom template creation UI
- Template categories
- Template preview
- Template sharing and import

## Standards Compliance Strategy

### Technical Standards (RFC & Widely Adopted)

- HTTP/REST: RFC 7231 compliant API design
- JSON API: JSON:API specification for consistent data exchange
- OpenAPI 3.0: API documentation and client generation
- OAuth 2.0/OIDC: Industry-standard authentication protocols
- RSS/Atom: Syndication feeds for blog and content modules
- WebDAV: File management and synchronization protocols
- CommonMark: Markdown specification compliance
- Runtime Validation: Joi/Zod for data validation
- Schema.org: Structured data markup for SEO

### Content Standards

- Dublin Core: Metadata schema for digital assets
- Schema.org Vocabulary: Semantic markup for all content types
- EXIF: Photo metadata preservation
- MIME Types: Proper content-type handling
- Unicode UTF-8: Full internationalization support
- ISO 8601: Date/time formatting consistency

### Platform Architecture Standards

- Twelve-Factor App: Deployment and configuration methodology
- Semantic Versioning: Module version management
- Container Standards: Docker/OCI compliance for deployment
- Environment Variables: Configuration management patterns

## Schema.org Integration Plans

### Module-Specific Schema Types

- Wiki Pages: Article, WebPage, CreativeWork schemas
- Blog Module: BlogPosting, Person (author), Organization schemas
- E-commerce Module: Product, Offer, Review, Organization schemas
- Document Management: DigitalDocument, MediaObject, Dataset schemas
- Photo Management: ImageObject, PhotoAlbum, Place schemas
- CRM Module: Person, Organization, ContactPoint schemas

### Implementation Goals

- Automatic generation from YAML frontmatter
- Module-specific schema registration
- Template integration
- Validation tools
- Rich results in search engines

## Documentation Roadmap

### User Documentation Needed

- Installation guides for various platforms
- Per-module user manuals
- Video tutorials for complex workflows
- FAQ and troubleshooting guides
- Migration guides from other platforms

### Developer Documentation Needed

- Complete API references
- Module development guides
- Architecture documentation
- Contributing guidelines
- Testing guidelines

### Hosting Provider Documentation

- Deployment guides for major platforms
- Performance tuning guides
- Security hardening recommendations
- Backup and recovery procedures
- Scaling strategies

### Integration Documentation

- Third-party API integration patterns
- Webhook implementation guides
- Import/export tools documentation
- Extension and theming guides
- Custom plugin development

## Success Metrics

### Technical Goals

- Standards Compliance: 100% adherence to chosen standards
- API Coverage: Complete OpenAPI documentation for all endpoints
- Test Coverage: >90% code coverage across all modules
- Performance: <200ms average response times
- Security: Regular security audits and updates

### Community Goals

- Module Ecosystem: Third-party module marketplace
- Documentation Quality: Comprehensive guides for all audiences
- Support Community: Active forums and community support
- Hosting Adoption: Support for multiple hosting platforms
- Contributor Growth: Active contributor community

## Technical Details

Repository: <https://github.com/jwilleke/ngdpbase>
Technology Stack:

- Node.js + Express.js
- EJS templating
- Lunr.js for search
- marked.js for Markdown
- linkedom for WikiDocument DOM
- Jest for testing
- Bootstrap 5 for UI

## More Information

There might be more information for this subject on one of the following:
[{ReferringPagesPlugin before='*' after='\n' }]
