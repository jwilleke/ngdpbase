# ngdpbase Documentation

Welcome to the comprehensive documentation for ngdpbase, a file-based wiki application built with Node.js.

## 📚 Documentation Overview

This documentation is organized into several key areas to help you understand, develop, and maintain ngdpbase.

## 🏗️ Architecture & Design

### [Project Structure](architecture/PROJECT-STRUCTURE.md)

- Complete directory structure explanation
- File organization guidelines
- Development workflow documentation
- Gitignore strategy and maintenance

### [WikiDocument DOM Architecture](architecture/WikiDocument-DOM-Architecture.md)

- JSPWiki-inspired parsing architecture
- Three-phase extraction pipeline
- DOM-based JSPWiki element processing
- Production deployment and testing
- Fixes markdown heading bug (#110, #93)

### [Page Classification Architecture](architecture/ARCHITECTURE-PAGE-CLASSIFICATION.md)

- Content classification system
- File system organization strategy
- Metadata structure for pages
- Operational safety considerations

## 🚀 Development

### [Contributing Guidelines](development/CONTRIBUTING.md)

- Coding standards and best practices
- Development environment setup
- Pull request process
- Code review guidelines

### [Testing Plan](development/TESTING_PLAN.md)

- Testing strategy and approach
- Test coverage requirements
- Automated testing setup
- Quality assurance processes

## 📋 Planning & Roadmap

### [Project Roadmap](planning/ROADMAP.md)

- Long-term vision and goals
- Technical specifications
- Feature priorities and timeline
- Future development plans

### [Project Board](planning/PROJECT_BOARD.md)

- Current project status
- Active development tasks
- Sprint planning and tracking
- Issue management

### [Task Tracking](planning/todo.md)

- Detailed task breakdown
- Progress tracking
- Priority management
- Completion status

### [Bootstrap Methodology](bootstrap-methodology.md)

- How `.env` is found and layered (`bootstrap-env.ts` vs `server.sh`)
- Config merge order and the three `$VAR` reference forms
- Install paths: wizard, headless, and `./server.sh setup`
- How to set `.env` values (by hand — nothing writes them)

### [Fernfiles Comparison](fernfiles.md)

- What activescott/fernfiles does better (durability checklist, mutation audit, conditional writes, health probes)
- What not to copy
- Twelve candidate issues ranked by observed friction

## 🔌 API Documentation

### [MarkupParser API](api/MarkupParser-API.md)

- Complete parser API reference
- Method signatures and examples
- Configuration properties
- Error handling and troubleshooting
- Performance characteristics
- Migration from legacy parser

### [Notification Enhancement](api/NOTIFICATION_ENHANCEMENT.md)

- Notification system architecture
- API endpoints and usage
- Configuration options
- Implementation details

## 🐛 Issues & Troubleshooting

### [Attachment Permission Conflicts](issues/ATTACHMENT_PERMISSION_CONFLICTS.md)

- Known permission issues
- Workarounds and solutions
- Prevention strategies

### [Digital Document Permission Status](issues/DIGITAL-DOCUMENT-PERMISSION-STATUS.md)

- Document permission tracking
- Access control issues
- Resolution procedures

### [Page Inventory](issues/PageInventory.md)

- Page management issues
- Inventory tracking problems
- Maintenance procedures

## ✨ Features

### [Page Link Autocomplete](features/PageLinkAutocomplete.md)

- Smart page suggestions in editor and search
- Keyboard navigation and shortcuts
- API endpoint documentation
- Customization and performance guide
- __Quick Reference:__ [One-page cheat sheet](features/PageLinkAutocomplete-QuickReference.md)
- __Related Issue:__ [#90 - TypeDown for Internal Page Links](https://github.com/jwilleke/ngdpbase/issues/90)

### [Table Styles](features/TableStyles.md)

- JSPWiki-compatible table formatting
- Interactive features (sortable, filterable)
- Custom colors and themes
- Dark mode support

## 📝 Additional Resources

### [Changelog](CHANGELOG.md)

- Version history and changes
- Migration notes
- Breaking changes documentation

### [Semantic Versioning](SEMVER.md)

- Version numbering guidelines
- Release management
- Compatibility considerations

### [Content Management](Content%20Management.md)

- Content organization strategies
- Management best practices
- User content handling

## 🔄 Migration Guides

### [WikiDocument DOM Migration](migration/WikiDocument-DOM-Migration.md)

- Migration patterns for custom handlers
- Integration guide for adding custom syntax
- Common pitfalls and solutions
- Rollback plan and FAQ
- Testing your migration

## 🧪 Testing Documentation

### [Phase 5 Manual QA Plan](testing/Phase5-Manual-QA-Plan.md)

- Comprehensive manual QA test plan
- WikiDocument DOM pipeline validation
- Production readiness testing
- Acceptance criteria

### [PageManager Testing Guide](testing/testing/PageManager-Testing-Guide.md)

- PageManager testing procedures
- Test case documentation
- Validation methods

### [Test and Example Pages](testing/testing/Test%20and%20Example%20Pages.md)

- Test page examples
- Sample content for testing
- Validation scenarios

## 🔍 Quick Navigation

| Area | Purpose | Key Documents |
| ------ | --------- | --------------- |
| __Getting Started__ | Basic usage and setup | [README.md](../README.md) |
| __Features__ | User features and guides | [Page Link Autocomplete](features/PageLinkAutocomplete.md) |
| __Architecture__ | System design and structure | [WikiDocument DOM](architecture/WikiDocument-DOM-Architecture.md), [Project Structure](architecture/PROJECT-STRUCTURE.md) |
| __Development__ | Coding and contribution | [Contributing](development/CONTRIBUTING.md) |
| __Planning__ | Project vision and tasks | [Roadmap](planning/ROADMAP.md) |
| __API__ | Technical interfaces | [MarkupParser API](api/MarkupParser-API.md), [Notification Enhancement](api/NOTIFICATION_ENHANCEMENT.md) |
| __Migration__ | Upgrading and custom handlers | [WikiDocument DOM Migration](migration/WikiDocument-DOM-Migration.md) |
| __Testing__ | Test plans and procedures | [Phase 5 QA Plan](testing/Phase5-Manual-QA-Plan.md) |
| __Issues__ | Problems and solutions | [Attachment Conflicts](issues/ATTACHMENT_PERMISSION_CONFLICTS.md) |

## 📖 Reading Guide

### For New Contributors

1. Start with [Contributing Guidelines](development/CONTRIBUTING.md)
2. Review [Project Structure](architecture/PROJECT-STRUCTURE.md)
3. Check [Testing Plan](development/TESTING_PLAN.md)
4. Look at current [Project Board](planning/PROJECT_BOARD.md)

### For End Users

1. Check [Features documentation](features/) for user guides
2. Start with [Page Link Autocomplete](features/PageLinkAutocomplete.md)
3. See [Table Styles](features/TableStyles.md) for formatting

### For System Administrators

1. Review [Project Structure](architecture/PROJECT-STRUCTURE.md)
2. Check [Attachment Permission Conflicts](issues/ATTACHMENT_PERMISSION_CONFLICTS.md)
3. Review [Changelog](CHANGELOG.md) for updates
4. See [Features](features/) for user-facing functionality

### For Developers

1. Study [WikiDocument DOM Architecture](architecture/WikiDocument-DOM-Architecture.md)
2. Review [MarkupParser API](api/MarkupParser-API.md)
3. Check [WikiDocument DOM Migration Guide](migration/WikiDocument-DOM-Migration.md) for custom syntax
4. Study [Architecture docs](architecture/)
5. Review [Testing documentation](testing/)
6. Review current [Issues](issues/)

### For Parser Contributors

1. Start with [WikiDocument DOM Architecture](architecture/WikiDocument-DOM-Architecture.md)
2. Review [MarkupParser API Documentation](api/MarkupParser-API.md)
3. Read [Migration Guide](migration/WikiDocument-DOM-Migration.md) for handler patterns
4. Check [Phase 5 QA Plan](testing/Phase5-Manual-QA-Plan.md) for testing approach
5. Review parser test suites in `src/parsers/__tests__/`

## 🤝 Contributing to Documentation

When adding new documentation:

1. __Choose the right location__: Use the appropriate subdirectory based on content type
2. __Follow naming conventions__: Use clear, descriptive filenames
3. __Update this index__: Add new documents to the appropriate section
4. __Use consistent formatting__: Follow existing markdown style and structure
5. __Include navigation__: Add links to related documents

## 📞 Support

- __Issues__: Report bugs and request features via GitHub Issues
- __Discussions__: Join community discussions for questions and ideas
- __Documentation__: Help improve docs by submitting pull requests
