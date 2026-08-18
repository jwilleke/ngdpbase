# TODO: JSPWiki Styles Implementation

## 📋 __JSPWiki Styles Analysis & Recommendation__

### 🏗️ __Architecture Overview__

__JSPWiki uses a sophisticated LESS-based build system with:__

1. __Modular Bootstrap 3.3.7 Integration__: Custom theme built on Bootstrap foundation
2. __Comprehensive LESS Structure__:
   - `haddock/` main theme directory
   - `bootstrap/` - Custom Bootstrap 3 variant  
   - `default/` - JSPWiki-specific components
   - `fontjspwiki/` - Custom icon fonts
   - `static/templates/` - Compiled CSS output

3. __Component-Based Organization__:
   - Core styling (type, variables, scaffolding)
   - Template-specific styles (View, Edit, Search, etc.)
   - Plugin-specific styles (TOC, Index, Weblog, etc.)
   - Dynamic components (Tabs, Accordion, Carousel, etc.)

### 🎯 __Is it Good for Node.js Implementation?__

__YES - Excellent choice with modifications!__ Here's why:

#### ✅ __Advantages:__

- __Professional Design System__: Mature, battle-tested visual language
- __Component Modularity__: Easy to pick/choose needed components
- __Responsive Design__: Built-in mobile responsiveness
- __Accessibility__: Proper ARIA support and keyboard navigation
- __Customizable__: LESS variables make theming straightforward
- __Cross-browser__: Handles vendor prefixes and compatibility

#### ⚠️ __Considerations:__

- __Bootstrap 3 → 5 Migration__: JSPWiki uses Bootstrap 3.3.7, you'd want Bootstrap 5
- __LESS vs SCSS__: Modern tooling often prefers SCSS over LESS
- __Java-specific Components__: Some components assume JSP/Java backend

### 🛠️ __Implementation Difficulty: MODERATE (6/10)__

#### __Easy Parts (2-4 weeks):__

- Basic color scheme and typography
- Grid system and responsive breakpoints  
- Button styles and form components
- Navigation structure

#### __Moderate Parts (4-6 weeks):__

- Plugin-specific styling (TOC, Search, etc.)
- Template system integration
- Dynamic components (tabs, accordions)
- Custom icon font integration

#### __Complex Parts (6-8 weeks):__

- Full Bootstrap 3→5 migration
- Java→Node template adaptations
- Complete build system setup
- Cross-browser testing

### 📦 __Recommended Implementation Strategy__

#### __Phase 1: Foundation (2 weeks)__

```javascript
// Install modern equivalents
npm install sass bootstrap@5 @fortawesome/fontawesome-free
npm install --save-dev vite postcss autoprefixer
```

#### __Phase 2: Core Adaptation (3 weeks)__

1. __Extract Variables__: Convert LESS variables to SCSS
2. __Migrate Components__: Port essential components to Bootstrap 5
3. __Custom Components__: Recreate JSPWiki-specific styling

#### __Phase 3: Advanced Features (3 weeks)__

1. __Plugin Integration__: Style wiki-specific components
2. __Dynamic Features__: Implement interactive components  
3. __Responsive Polish__: Fine-tune mobile experience

### 🎨 __Quick Start Recommendation__

Rather than full implementation, I suggest:

1. __Cherry-pick the best parts__:
   - Color palette and typography
   - Component spacing and shadows
   - Navigation patterns
   - Form styling

2. __Use modern equivalents__:
   - Bootstrap 5 instead of 3
   - CSS Custom Properties instead of LESS variables
   - CSS Grid where appropriate

3. __Focus on key components__:
   - Navigation and page layout
   - Content typography and code blocks
   - Forms and buttons
   - Plugin-specific components you actually need

### 💡 __Alternative: Inspired Approach__

Instead of full port, create a __JSPWiki-inspired design system__:

```css
/* JSPWiki-inspired color palette */
:root {
  --wiki-primary: #337ab7;
  --wiki-sidebar: #f8f9fa;
  --wiki-border: #dee2e6;
  --wiki-success: #5cb85c;
  --wiki-warning: #f0ad4e;
  --wiki-danger: #d9534f;
}
```

This gives you the professional JSPWiki aesthetic without the complexity of full migration.

### 🏁 __Bottom Line__

__Worth doing__: The JSPWiki styles are excellent and would give your wiki a professional, familiar feel. However, I'd recommend a __selective implementation__ focusing on the visual language rather than full codebase port.

__Time investment__: 4-6 weeks for a solid JSPWiki-inspired theme vs 8-12 weeks for full implementation.

__Best ROI__: Extract the design principles, color schemes, and component patterns while using modern CSS tools and Bootstrap 5.

---

## 🎯 __Immediate Action Items__

### High Priority

- [ ] Extract JSPWiki color palette and implement as CSS custom properties
- [ ] Port JSPWiki typography system to our current CSS
- [ ] Implement JSPWiki-style sidebar navigation
- [ ] Add JSPWiki-inspired form styling
- [ ] __Implement JSPWiki TablePlugin Row Styling Features__:
  - [ ] `rowNumber`: Starting row number for counting (default: 0)
  - [ ] `style`: CSS styling for the entire table
  - [ ] `dataStyle`: CSS formatting for all data cells (single pipe |)
  - [ ] `headerStyle`: CSS formatting for header cells (double pipe ||)
  - [ ] `evenRowStyle`: CSS formatting for even rows
  - [ ] `oddRowStyle`: CSS formatting for odd rows
  - [ ] Support `%%table-striped` syntax for theme-based alternating rows
  - [ ] Implement `|#` syntax for automatic row numbering

### Medium Priority  

- [ ] Port JSPWiki button and component styling
- [ ] Implement JSPWiki-style search interface
- [ ] Add JSPWiki-inspired page layout patterns
- [ ] Create JSPWiki-style plugin components (TOC, etc.)

### Low Priority

- [ ] Full Bootstrap 3→5 migration analysis
- [ ] Custom icon font integration
- [ ] Advanced dynamic components
- [ ] Cross-browser compatibility testing

### Research Tasks

- [ ] Analyze JSPWiki's responsive breakpoints
- [ ] Study JSPWiki's accessibility patterns
- [ ] Review JSPWiki's dark theme implementation
- [ ] Investigate JSPWiki's print stylesheet approach

---

## 📚 __Reference Links__

- [JSPWiki Styles Repository](https://github.com/apache/jspwiki/tree/master/jspwiki-war/src/main/styles)
- [JSPWiki Haddock Theme](https://github.com/apache/jspwiki/tree/master/jspwiki-war/src/main/styles/haddock)
- [Bootstrap 5 Migration Guide](https://getbootstrap.com/docs/5.0/migration/)
- [LESS to SCSS Conversion Guide](https://sass-lang.com/documentation/syntax#differences-from-less)

---

## 💭 __Notes__

- Current implementation already uses Bootstrap 5 - good foundation
- Page Source Dialog is already excellent - JSPWiki quality
- Navigation structure is clean and minimal - matches JSPWiki philosophy
- Consider implementing JSPWiki's "Haddock" theme as inspiration
