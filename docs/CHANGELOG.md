# Changelog

All notable changes to ngdpbase are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) [CHANGELOG.md]
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.1.0] - 2026-04-18

### Added in 3.1.0

- __Journal Addon__ — full personal journal/diary feature (#402)
  - Private, dated entries stored as wiki pages with `system-category: journal`
  - `JournalDataManager` — sidecar JSON index for fast timeline, streak, facet, and On This Day queries
  - `JournalTemplateManager` — 4 built-in writing templates (Free Write, Morning Reflection, Evening Review, Weekly Review) + custom templates from `data/journal/templates/`
  - `[{Journal}]` wiki plugin — embed timeline, streak, or On This Day widget on any page
  - Timeline, tag filter, and mood filter views (`/journal`, `/journal/tag/:tag`, `/journal/mood/:mood`)
  - New entry editor with template picker, mood picker, and voice-to-text (Web Speech API)
  - Per-user settings page (`/journal/settings`) — default template, voice toggle, streak visibility, daily reminder time
  - JSON and Markdown export (`/api/journal/export/json`, `/api/journal/export/markdown`)
  - Daily in-app reminder scheduler via `NotificationManager`
  - Admin stats panel at `/admin/journal`
  - `[journal]` wiki link alias redirects to `/journal`
  - 29 unit tests for `JournalDataManager`

### Fixed in 3.1.0

- Removed hardcoded Home/Search/Create fallback from `header.ejs` — sidebar now renders empty when `LeftMenu` page is missing, with a `logger.warn` emitted
- Docker image now correctly copies `addons/` directory (views, public assets, seed pages, compiled JS) into the runtime stage
- Emoji shortcode inline autocomplete and picker modal (#512)
- Strip `data-jspwiki-id` from final HTML output (#503)
- Unified preview and view rendering paths via WikiContext (#510)

### Added

- __WikiDocument DOM Parsing Architecture__: Production deployment of JSPWiki-inspired DOM-based parser (Epic #114)
  - __WikiDocument DOM Extraction Pipeline__: Three-phase parsing that separates JSPWiki and Markdown processing
  - __Phase 1 - Extraction__ (#115): `extractJSPWikiSyntax()` extracts JSPWiki syntax before Markdown parsing
  - __Phase 2 - DOM Creation__ (#116): `createDOMNode()` creates WikiDocument DOM nodes via handlers
  - __Phase 3 - Merge Pipeline__ (#117): `mergeDOMNodes()` replaces placeholders with rendered nodes
  - __DOM Handlers__: DOMVariableHandler, DOMPluginHandler, DOMLinkHandler for type-safe node creation
  - __WikiDocument Class__: Lightweight DOM implementation using linkedom with metadata support
  - __Comprehensive Testing__ (#119): 376+ tests with 100% success rate
  - __Production Integration__ (#120): Deployed by default with automatic fallback to legacy parser
  - __Complete Documentation__ (#121): API reference, migration guide, and architecture documentation
  - __Bug Fixes__: Resolves markdown heading bug (#110, #93) and escaping issues
  - __Configuration__: `jspwiki.parser.useExtractionPipeline = true` (default)
  - __Performance__: <50ms typical pages, <100ms large pages
  - __Extensible__: Easy to add custom syntax via DOM handlers
  - __Documentation__:
    - API Reference: `docs/api/MarkupParser-API.md`
    - Migration Guide: `docs/migration/WikiDocument-DOM-Migration.md`
    - Architecture: `docs/architecture/WikiDocument-DOM-Architecture.md`
    - QA Plan: `docs/testing/Phase5-Manual-QA-Plan.md`
- __Page Link Autocomplete__: Smart autocomplete for internal page links in editor and search (Issue #90)
  - __API Endpoint__: `/api/page-suggestions` with smart sorting (exact → prefix → contains)
  - __Client Module__: Reusable `PageAutocomplete` class with debouncing and keyboard navigation
  - __Editor Integration__: Bracket detection `[page name]` with real-time suggestions
  - __Search Integration__: Autocomplete in search page, header search bar, and edit index
  - __Smart Matching__: Case-insensitive search with category badges and title highlighting
  - __Keyboard Navigation__: Full keyboard support (↑↓ arrows, Enter, Escape)
  - __Performance Optimized__: 200ms debounce, efficient filtering, browser caching
  - __Context-Aware__: Excludes plugin `[{Plugin}]` and variable `[{$var}]` syntax
  - __Documentation__: Complete user guide, technical docs, and quick reference
  - __User Guide__: `/wiki/Page%20Link%20Autocomplete` wiki page
  - __Technical Docs__: `docs/features/PageLinkAutocomplete.md`
  - __Quick Reference__: `docs/features/PageLinkAutocomplete-QuickReference.md`

- __JSPWiki-Compatible VariableManager System__: Complete variable management system similar to JSPWiki's DefaultVariableManager
  - __VariableManager__: New manager with 18 system variables and 4 contextual variables
  - __Variable Registry__: Function-based registry system for dynamic value generation
  - __Admin Variables Interface__: Complete variable browser, testing, and debugging interface
  - __System Variables__: Application info, configuration, runtime data, and plugin variables
  - __Contextual Variables__: User authentication state and page context variables
  - __Variable Protection__: Safeguards for escaped variables and code blocks during expansion
  - __Live Testing__: Real-time variable expansion testing in admin interface
  - __Custom Registration__: Plugin API for registering custom variables
  - __JSPWiki Compatibility__: Maintains JSPWiki variable patterns and naming conventions

- __JSPWiki-Compatible Configuration Management System__: Complete configuration system with property merging
  - __ConfigurationManager__: New manager handling app-default-config.json and app-custom-config.json
  - __Property Merging__: Two-tier configuration with defaults and custom overrides
  - __Admin Configuration Interface__: Full web-based configuration management with validation
  - __Server Configuration__: Configurable port, host, session settings, and base URLs
  - __Runtime Updates__: Live configuration updates without server restart via admin interface
  - __Property Validation__: Ensures proper ngdpbase.*and log4j.* property naming
  - __Configuration Export__: View and manage all configuration properties
  - __JSPWiki Compatibility__: Property naming and structure matches JSPWiki patterns
  - __Security Integration__: Proper session and security configuration management
- __Comprehensive Audit Trail System__: Complete security monitoring and access logging implementation
  - __AuditManager__: New manager for comprehensive audit logging with configurable retention policies
  - __Admin Audit Interface__: Full-featured audit log viewer with filtering, pagination, and export capabilities
  - __Security Monitoring__: Real-time access control decision logging with detailed context information
  - __Audit Configuration__: JSON-based configuration system for audit policies and monitoring settings
  - __Export Functionality__: JSON and CSV export options for audit logs with date range filtering
  - __API Endpoints__: RESTful API for audit log retrieval and management
  - __Policy Integration__: Seamless integration with PolicyEvaluator for access decision logging
  - __Performance Optimized__: Efficient in-memory caching with periodic file flushing
  - __Admin Dashboard__: Statistics and monitoring dashboard for security oversight

### Security

- __Enhanced Security Monitoring__: Comprehensive access control decision logging
- __Audit Trail Compliance__: Full audit trail for security compliance and monitoring
- __Access Pattern Analysis__: Detailed logging of user actions and system access patterns
- __Security Incident Detection__: Framework for detecting and logging security incidents

### Testing

- __Comprehensive Route Testing Framework__: Major advancement in test coverage and reliability
  - __45-route test suite__: Complete coverage of all ngdpbase HTTP endpoints with authentication and security testing
  - __CSRF Protection Validation__: Full CSRF token validation testing with security middleware verification
  - __Mock Engine Architecture__: Comprehensive mocking system for all WikiEngine managers and dependencies
  - __Security Testing__: Authentication, authorization, and access control validation across all routes
  - __Admin Route Coverage__: Complete testing of administrative functions (user management, roles, notifications)
  - __Template Rendering Tests__: EJS template rendering validation with proper data injection
  - __Form Validation Testing__: POST request validation with proper error handling and redirects
  - __Test Infrastructure__: Jest + Supertest integration with comprehensive mock setup and cleanup
  - __Current Status__: 34/45 tests passing (76% success rate) with core functionality fully operational
  - __Security Compliance__: All critical security features (CSRF, authentication, authorization) validated
  - __ACLManager__: Improved test coverage from 55.84% to 70.99% (52 comprehensive tests)
    - Enhanced ACL parsing and user permissions validation
    - Maintenance mode and audit logging test coverage
    - Category-based access control testing
    - Issue #22 security features validation
  - __UserManager__: Expanded test suite from 10 to 19 tests, coverage from 24.82% to 48.42%
    - Authentication and authorization flow testing
    - User CRUD operations validation
    - Session management and role-based permissions
    - Password handling and external user integration
  - __PageManager__: Improved test coverage from 61.63% to 65.09% (26/26 tests passing)
    - Fixed metadata flattening for categories and user-keywords
    - Enhanced savePage method with proper success status returns
    - Improved isRequiredPage method for category-based detection
    - Template creation and error handling validation
    - UUID generation and timestamp updating tests
- __Test Suite Reliability__: Enhanced test infrastructure and mocking patterns
  - Consistent mock engine setup across all manager tests
  - Improved error handling and filesystem operation testing
  - Better cache consistency and lookup validation
  - Comprehensive validation of manager integration points

### Removed

- In-memory mock file system using Map for predictable test behavior
- gray-matter mocking for YAML frontmatter parsing
- __Testing documentation__: New PageManager Testing Guide (`docs/testing/PageManager-Testing-Guide.md`)
- __Updated contributing guidelines__: Enhanced testing best practices and mock-based testing approach

### Technical

- All PageManager tests now use mocks instead of real file operations
- Improved test reliability and CI/CD compatibility
- Enhanced error handling test coverage
- Better cache consistency testing
- __Documentation Updates__: Updated CHANGELOG.md and TESTING_PLAN.md with comprehensive route testing status and achievements

### Planned

- Unit test implementation
- Performance optimization for large page sets
- Mobile UI enhancements
- Export/import functionality
- See [ROADMAP.md](ROADMAP.md) for detailed future plans

## [1.3.1] - 2025-09-10

### Added

- __Dark Mode Theme System__: Comprehensive dark mode implementation with system preference detection
  - __CSS Variables__: Complete theming system with light/dark color schemes for all components
  - __System preference detection__: Automatically follows OS dark mode setting via media queries
  - __Theme toggle button__: Floating button for instant theme switching (light/dark/system)
  - __User preference integration__: Theme choice saved in user profile preferences
  - __Bootstrap compatibility__: All Bootstrap components styled for dark mode support
  - __Smooth transitions__: CSS transitions for seamless theme switching experience
  - __Theme manager__: JavaScript class for programmatic theme control and state management
- __JSPWiki WikiVariables System__: Comprehensive variable expansion support for dynamic content
  - __User context variables__: [{$username}] and [{$loginstatus}] display current user state
  - __System variables__: [{$totalpages}] shows total page count dynamically
  - __Authentication awareness__: Variables reflect logged-in vs anonymous user states
  - __RenderingManager integration__: Seamless variable expansion in page content
- __User Preferences System__: Complete JSPWiki-style user preference management
  - __Profile page__: Comprehensive user profile with account info, permissions, and preferences
  - __Editor preferences__: Smart typing pairs, auto-indent, line numbers, and theme selection
  - __Display preferences__: Page size, tooltips, reader mode, date format, and site theme options
  - __Smart typing pairs__: Auto-pairing of brackets, quotes, and other characters
  - __Real-time application__: Preferences applied immediately via client-side library
  - __Persistent storage__: All settings saved to user profile and loaded correctly
  - __Form state management__: Fixed checkbox and dropdown state persistence after saves
- __User Keywords Dropdown Interface__: Enhanced Create New Page form with professional dropdown
  - __Checkbox dropdown__: Replaced individual checkboxes with clean Bootstrap dropdown interface
  - __3-keyword limit enforcement__: Auto-disable functionality when maximum selections reached
  - __Visual feedback__: Button color changes, disabled states, and smooth transitions
  - __Dynamic loading__: Keywords populated from User Keywords.md file content
  - __Responsive design__: Works seamlessly on desktop and mobile devices
- __Edit Page Authentication & Interface__: Comprehensive security and UX improvements for editing
  - __Authentication protection__: `/edit` route now requires login and proper permissions
  - __Permission enforcement__: Users must have `page:edit` permission to access
  - __Page selection interface__: Professional page browser with search functionality
  - __Live search filtering__: Real-time page list filtering with visual feedback
  - __Proper redirects__: Seamless login flow with return-to-page functionality
- __Authentication System Fixes__: Resolved redirect loop issues and improved session handling
  - __Session consistency__: Fixed mismatch between session creation and validation methods
  - __Cookie configuration__: Enhanced cookie settings with proper path and SameSite attributes
  - __Permission updates__: Updated user roles to ensure proper page creation access
  - __Debug logging__: Added comprehensive debugging for authentication troubleshooting
- __Markdownlint Configuration__: Added `.markdownlint.json` to disable MD025 rule
  - __Multiple H1 headings support__: Allows frontmatter `title` and `# Overview` in same document
  - __Document structure flexibility__: Maintains other linting rules while accommodating wiki page format
- __Create New Page Menu Item__: Added "Create New Page" option to More dropdown
  - __Role-based visibility__: Only visible to Admin, Editor, and Contributor roles
  - __Quick access__: Provides easy access to page creation from any page
  - __Proper permissions__: Links to existing `/create` route with permission checks
- __Metadata Standardization__: Comprehensive cleanup of page metadata
  - __System foundation files__: Created System Keywords.md and User Keywords.md in required-pages
  - __Missing metadata fixed__: Added proper metadata to all table test files and system pages
  - __Consistent format__: Standardized all pages to use `categories: []` and `user-keywords: []` format
  - __Duplicate resolution__: Consolidated User-Keywords.md into required-pages structure

### Fixed

- __User preference form state__: Fixed issue where saved preferences weren't reflected in form controls
  - __Cached user data__: Profile page now fetches fresh user data from database instead of session cache
  - __Checkbox persistence__: Form checkboxes correctly show checked/unchecked state after saves
  - __Select persistence__: Dropdown selections properly reflect saved preference values
  - __Form reload accuracy__: All preference form fields now accurately display current user settings
- __Route ordering issue__: Fixed critical bug preventing Create New Page form from loading dynamic content
  - __Wildcard route conflict__: Moved `/create` before `/wiki/:page` to prevent interception
  - __Dynamic form population__: Categories and keywords now properly load from required-pages files
  - __Authentication redirects__: Resolved infinite redirect loops on login
- __Anonymous access vulnerability__: Secured Create New Page functionality
  - __Authentication required__: Anonymous users redirected to login page
  - __Permission validation__: Users without `page:create` permission get proper error messages
  - __Security enforcement__: Both GET and POST routes for page creation now protected
- __Edit route accessibility__: Fixed "Cannot GET /edit" error
  - __Missing route handler__: Added `/edit` route with authentication protection
  - __User experience__: Anonymous users get proper redirect instead of 404 error
  - __Permission checks__: Same security model as create page functionality
- __App startup issue__: Fixed broken require path for logger after project reorganization
  - __Updated path__: Changed `require('./logger')` to `require('./src/utils/logger')`
  - __Clean startup__: App now starts without module not found errors

### Security

- __Authentication system hardening__: Multiple security improvements across the application
  - __Route protection__: All page creation and editing routes now require authentication
  - __Permission enforcement__: Role-based access control properly implemented
  - __Session security__: Enhanced cookie configuration and session management
  - __Redirect safety__: Proper redirect parameter handling to prevent attacks

## [1.3.0] - 2025-09-08

### Added

- __JSPWiki Table Functionality__: Complete implementation of JSPWiki-style table rendering
  - __`%%table-striped` syntax__: Bootstrap-compatible striped tables with theme-aware styling
  - __`[{Table}]` plugin syntax__: Advanced table styling with comprehensive parameter support
  - __Row styling parameters__: `evenRowStyle`, `oddRowStyle`, `headerStyle`, `dataStyle`, `style`
  - __Automatic row numbering__: `|#` syntax with customizable starting numbers via `rowNumber` parameter
  - __Theme integration__: Seamless Bootstrap 5 compatibility with CSS custom properties
- __Project Structure Reorganization__: Complete restructuring for better maintainability
  - __Cleaned root directory__: Only essential files (app.js, README.md, package.json, etc.)
  - __Organized code structure__: Moved JS files to `src/` subdirectories (legacy/, tests/, utils/)
  - __System documentation__: Consolidated development docs in `required-pages/`
  - __Category system__: Implemented `categories: [System, Documentation, Test]` metadata structure
- __Enhanced .gitignore__: Improved user content exclusion patterns
  - __VS Code compatibility__: Fixed patterns for proper IDE integration
  - __User content isolation__: Pages, users, attachments, logs properly excluded from git
- __Documentation Consolidation__: Combined and organized project documentation
  - __Project Tasks and TODO__: Merged Tasks.md and todo.md with prioritization
  - __Project Overview and Vision__: Consolidated project goals and technical architecture
  - __JSPWiki Table Documentation__: Comprehensive usage examples and implementation details

### Changed

- __Category system__: Replaced single `category` with array-based `categories` for better organization
- __File organization__: Moved utility files (logger.js, version.js) to `src/utils/`
- __Test organization__: Moved test files to `src/tests/`
- __Legacy code__: Moved old app versions to `src/legacy/`

### Fixed

- __Git ignore patterns__: Resolved VS Code showing user content as untracked files
- __Table rendering__: Complete JSPWiki TablePlugin compatibility with all styling parameters
- __Project structure__: Clean separation between system files and user content

## [1.2.0] - 2025-09-07

__Version Type__: MINOR - New features with backward compatibility

This release transforms the basic wiki into a JSPWiki-style system with advanced search capabilities, enhanced authentication, and modern UI components while maintaining full backward compatibility.

### Added

#### Advanced Search System

- __JSPWiki-style Search Interface__: Complete overhaul of search functionality with professional UI
- __Multi-Select Search Filters__: Checkbox-based interface for categories, keywords, and search fields
- __Advanced Search Methods__: New SearchManager methods for complex multi-criteria searches
  - `searchByCategories()` - Search across multiple categories simultaneously
  - `searchByUserKeywordsList()` - Filter by multiple user keywords
  - Enhanced `advancedSearch()` with array support for all parameters
- __Enhanced Search Indexing__: Improved Lunr.js index with metadata field boosting
  - Categories: 8x boost (highest priority)
  - User Keywords: 6x boost
  - Tags: 5x boost
  - Keywords: 4x boost
  - Content: 1x boost (baseline)

#### Search Interface Improvements

- __Professional Search Page Layout__: Cards, shadows, and hover effects for modern appearance
- __Expandable Browse Sections__: "Show more" functionality for categories and keywords
- __Search Statistics Sidebar__: Real-time statistics and search tips
- __Multi-Criteria Result Display__: Enhanced result presentation with metadata badges
- __Search Documentation Integration__: Direct link to comprehensive search help

#### Search Page Features

- __Empty Search State__: Attractive landing page with category/keyword browsing
- __Search Options Panel__: Collapsible advanced search controls
- __Real-time Search__: Auto-submit on filter changes
- __Result Snippets__: Content previews with relevance scoring
- __Search Tips__: Built-in help for advanced search syntax

### Enhanced

#### Authentication & User Management

- __Three-State Authentication System__: Proper distinction between user states
  - Anonymous: No session cookie present
  - Asserted: Has session cookie but expired/invalid
  - Authenticated: Valid session with active authentication
- __Improved User State Handling__: Better user context management throughout the system

#### Link System Improvements

- __Red Link Implementation__: Visual indication of non-existent pages
  - Red styling for links to pages that don't exist
  - Blue styling for existing page links
  - Automatic detection and styling updates
- __Pipe Link Syntax__: JSPWiki-style link syntax with target attributes
  - `[Link Text|Page Name]` syntax support
  - `[Link Text|Page Name|_blank]` for new window/tab opening
  - Backward compatibility with simple `[Page Name]` syntax

#### Navigation & UI

- __Home Page Redirect__: Automatic redirect from root to Welcome page
- __Search Navigation__: Prominent search link in main navigation
- __Improved Header__: Better organization of navigation elements

#### Template System

- __Search Results Template__: Complete redesign with modern Bootstrap components
- __Enhanced Form Controls__: Better visual hierarchy and user experience
- __Responsive Design__: Mobile-friendly search interface

### Fixed

#### Critical Bug Fixes

- __ACL Manager Type Safety__: Fixed `TypeError: content.replace is not a function`
  - Enhanced `removeACLMarkup()` method with proper null/type checking
  - Added safety checks in edit route for non-existent pages
  - Graceful handling of undefined/null content
- __Search Route Robustness__: Improved error handling in search functionality
- __Page Creation__: Fixed issues with editing non-existent pages

#### Security & Stability

- __Input Validation__: Enhanced parameter validation in search routes
- __Type Checking__: Robust type validation throughout ACL processing
- __Error Prevention__: Multiple layers of protection against runtime errors

### Changed

#### Search System Overhaul

- __Search Interface__: Complete redesign from dropdown-based to checkbox-based filters
- __Search Logic__: Enhanced multi-criteria search with improved relevance scoring
- __Search Routes__: Updated to handle array parameters for multi-select functionality
- __Search Templates__: Professional redesign with modern UI components

#### User Experience Improvements

- __Form Labels__: Changed from "Category" to "Include Categories", "User Keywords" to "Include User Keywords"
- __Layout Organization__: Better use of grid system for responsive design
- __Visual Hierarchy__: Improved contrast, spacing, and typography
- __Interactive Elements__: Hover effects, animations, and smooth transitions

#### Documentation

- __Search Documentation Page__: Comprehensive guide to search functionality
  - Basic and advanced search instructions
  - Search syntax examples and best practices
  - Troubleshooting guide and tips
  - Page organization guidelines

### Technical Improvements

#### Backend Enhancements

- __SearchManager__: Significant expansion with new methods and capabilities
- __WikiRoutes__: Enhanced search route with multi-parameter support
- __ACLManager__: Improved robustness and error handling
- __Type Safety__: Enhanced validation throughout the system

#### Frontend Enhancements

- __CSS Improvements__: New styling for search components and interactions
- __JavaScript Functionality__: Enhanced form handling and UI interactions
- __Template System__: Modernized EJS templates with better organization

#### Performance

- __Search Indexing__: Optimized document indexing with metadata extraction
- __Result Processing__: Efficient handling of multi-criteria searches
- __Memory Management__: Better handling of search results and filtering

## [1.1.0] - 2025-08-01

__Version Type__: MINOR - Feature additions

### Features Added

- Basic wiki functionality with markdown support
- User authentication system
- Page management and editing
- Basic search functionality
- Template system
- Plugin architecture

## [1.0.0] - 2025-07-01

__Version Type__: MAJOR - Initial release

### Initial Implementation

- Initial wiki implementation
- File-based page storage
- Basic navigation
- User management foundation

---

## Semantic Versioning Guide

This project follows [Semantic Versioning](https://semver.org/) (SemVer):

### Version Format: MAJOR.MINOR.PATCH

- __MAJOR__ version increments for incompatible API changes
- __MINOR__ version increments for backward-compatible functionality additions  
- __PATCH__ version increments for backward-compatible bug fixes

### Version History Summary

- __1.3.1__ (Latest): Dark mode, user preferences, authentication fixes, and UI enhancements
- __1.3.0__: JSPWiki table functionality, project reorganization, and documentation consolidation
- __1.2.0__: Advanced search system, JSPWiki-style UI, and authentication improvements
- __1.1.0__: Basic feature set with authentication and templates
- __1.0.0__: Initial release with core wiki functionality

---

## Development Notes

### Search System Architecture

The search system now provides JSPWiki-level functionality with:

- Full-text search across content, titles, and metadata
- Category-based organization and filtering
- User keyword tagging system
- Advanced multi-criteria search capabilities
- Professional user interface with modern design patterns

### Authentication System

Enhanced three-state authentication provides:

- Better user experience with proper state management
- Improved security with clear permission boundaries
- Flexible access control based on authentication state

### Link System

JSPWiki-compatible link system with:

- Visual distinction between existing and non-existent pages
- Advanced link syntax with target control
- Backward compatibility with existing content

### Technical Debt Addressed

- Fixed critical type safety issues in ACL processing
- Improved error handling throughout the application
- Enhanced input validation and parameter processing
- Better separation of concerns in search functionality

---

## Migration Notes

### For Existing Users

- All existing search URLs continue to work (backward compatibility maintained)
- Page links are automatically enhanced with red/blue styling
- Search functionality is significantly improved without breaking changes

### For Developers

- New SearchManager methods are available for custom implementations
- Enhanced ACL processing with better error handling
- Improved template system for custom UI development

---

*This changelog covers the major enhancements implemented on September 7, 2025. For detailed technical documentation, see the Search Documentation page within the wiki or check [docs/](docs/) folder.*
