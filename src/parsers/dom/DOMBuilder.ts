import { TokenType } from './Tokenizer.js';
import WikiDocument, {
  LinkedomElement
} from './WikiDocument.js';

/**
 * DOMBuilder - Converts tokens into a WikiDocument DOM tree
 *
 * ============================================================================
 * ARCHITECTURE NOTE (Phase 4, Issue #118):
 * ============================================================================
 *
 * **This DOMBuilder is a REFERENCE IMPLEMENTATION and is NOT actively used
 * in the current rendering pipeline.**
 *
 * This builder converts tokens from the Tokenizer into a WikiDocument DOM.
 * It was part of the Phase 0 tokenization-based parsing approach, which has
 * been superseded by the extraction-based approach in Phases 1-3.
 *
 * CURRENT ACTIVE APPROACH:
 * ------------------------
 * DOM nodes are now created directly from extracted elements using:
 * - DOMVariableHandler.createNodeFromExtract()
 * - DOMPluginHandler.createNodeFromExtract()
 * - DOMLinkHandler.createNodeFromExtract()
 * - MarkupParser.createTextNodeForEscaped()
 *
 * These methods create DOM nodes directly without going through tokenization.
 *
 * WHY THIS DOMBUILDER IS KEPT:
 * ----------------------------
 * - Reference for token-to-DOM conversion patterns
 * - Understanding of DOM tree construction
 * - May be useful for future enhancements
 * - Educational value
 *
 * SEE ALSO:
 * - Tokenizer.js - Detailed architecture notes
 * - DOMParser.js - Pipeline documentation
 * - MarkupParser.parseWithDOMExtraction() - Current active pipeline
 * - Issue #114 - WikiDocument DOM Solution
 * - Issue #118 - Architecture documentation (this change)
 *
 * ============================================================================
 *
 * ORIGINAL DESCRIPTION:
 * Takes an array of tokens from the Tokenizer and builds a structured
 * DOM tree in a WikiDocument. Handles nesting, formatting, and all
 * JSPWiki-compatible markup elements.
 *
 * Key Features:
 * - Converts tokens to DOM nodes
 * - Handles nested structures (lists, tables)
 * - Manages formatting contexts (bold, italic)
 * - Creates semantic HTML elements
 *
 * Part of Phase 2.4 of WikiDocument DOM Migration (GitHub Issue #93)
 */

/**
 * Token metadata interface
 */
export interface TokenMetadata {
  /** Heading level (for headings) */
  level?: number;
  /** Variable name (for variables) */
  varName?: string;
  /** Link target (for links) */
  link?: string;
  /** Link text (for links) */
  text?: string;
  /** Whether list is ordered (for lists) */
  ordered?: boolean;
  /** Additional metadata properties */
  [key: string]: unknown;
}

/**
 * Token interface
 */
export interface Token {
  /** Token type - can be TokenType enum or string for extensibility */
  type: TokenType | string;
  /** Token value */
  value: string;
  /** Token metadata */
  metadata?: TokenMetadata;
  /** Line number */
  line?: number;
  /** Column number */
  column?: number;
  /** Additional properties */
  [key: string]: unknown;
}

/**
 * Table context for tracking table structure
 */
interface TableContext {
  /** Table element */
  table: LinkedomElement;
  /** Current row element */
  currentRow: LinkedomElement | null;
}

/**
 * List stack item for tracking nested lists
 */
interface ListStackItem {
  /** List level (1-indexed) */
  level: number;
  /** List element (ul or ol) */
  element: LinkedomElement;
  /** Whether list is ordered */
  ordered: boolean;
}

/**
 * DOMBuilder class
 */
class DOMBuilder {
  /** Target WikiDocument */
  private wikiDocument: WikiDocument;

  /** Current parent element */
  private currentParent: LinkedomElement | null;

  /** Stack of nested lists */
  private listStack: ListStackItem[];

  /** Current table context */
  private tableContext: TableContext | null;

  /** Current paragraph context */
  private paragraphContext: LinkedomElement | null;

  /**
   * Creates a new DOMBuilder
   *
   * @param wikiDocument - Target WikiDocument
   */
  constructor(wikiDocument: WikiDocument) {
    this.wikiDocument = wikiDocument;
    this.currentParent = null;
    this.listStack = []; // Track nested lists
    this.tableContext = null; // Track current table structure
    this.paragraphContext = null; // Track current paragraph
  }

  /**
   * Builds a DOM tree from an array of tokens
   *
   * @param tokens - Array of tokens from Tokenizer
   * @returns The WikiDocument with built DOM
   */
  buildFromTokens(tokens: Token[]): WikiDocument {
    // Start with document root
    this.currentParent = this.wikiDocument.getRootElement();

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Skip EOF token (type can be TokenType enum or string for extensibility)
      if ((token.type as TokenType) === TokenType.EOF) {
        break;
      }

      // Create and append node for this token
      this.processToken(token);
    }

    // Clean up any open contexts
    this.closeCurrentParagraph();
    this.closeAllLists();
    this.closeCurrentTable();

    return this.wikiDocument;
  }

  /**
   * Processes a single token
   *
   * @param token - Token to process
   */
  processToken(token: Token): void {
    // Cast token.type to TokenType for switch comparison
    // (token.type is TokenType | string for extensibility)
    switch (token.type as TokenType) {
    case TokenType.TEXT:
      this.handleText(token);
      break;
    case TokenType.ESCAPED:
      this.handleEscaped(token);
      break;
    case TokenType.VARIABLE:
      this.handleVariable(token);
      break;
    case TokenType.PLUGIN:
      this.handlePlugin(token);
      break;
    case TokenType.WIKI_TAG:
      this.handleWikiTag(token);
      break;
    case TokenType.LINK:
      this.handleLink(token);
      break;
    case TokenType.INTERWIKI:
      this.handleInterWiki(token);
      break;
    case TokenType.HEADING:
      this.handleHeading(token);
      break;
    case TokenType.LIST_ITEM:
      this.handleListItem(token);
      break;
    case TokenType.TABLE_CELL:
      this.handleTableCell(token);
      break;
    case TokenType.BOLD:
      this.handleBold(token);
      break;
    case TokenType.ITALIC:
      this.handleItalic(token);
      break;
    case TokenType.CODE_INLINE:
      this.handleCodeInline(token);
      break;
    case TokenType.CODE_BLOCK:
      this.handleCodeBlock(token);
      break;
    case TokenType.COMMENT:
      this.handleComment(token);
      break;
    case TokenType.NEWLINE:
      this.handleNewline(token);
      break;
    default:
      // Unknown token type - treat as text
      this.handleText(token);
    }
  }

  // ========================================================================
  // TOKEN HANDLERS
  // ========================================================================

  /**
   * Handles plain text tokens
   */
  handleText(token: Token): void {
    this.ensureParagraph();
    const textNode = this.wikiDocument.createTextNode(token.value);
    this.paragraphContext!.appendChild(textNode);
  }

  /**
   * Handles escaped text [[...]]
   * This is literal text that should not be parsed
   */
  handleEscaped(token: Token): void {
    this.ensureParagraph();
    const textNode = this.wikiDocument.createTextNode(token.value);
    this.paragraphContext!.appendChild(textNode);
  }

  /**
   * Handles variables {$varname}
   */
  handleVariable(token: Token): void {
    this.ensureParagraph();
    const span = this.wikiDocument.createElement('span', {
      class: 'wiki-variable',
      'data-variable': token.metadata?.varName || ''
    });
    span.textContent = `{$${token.metadata?.varName || ''}}`;
    this.paragraphContext!.appendChild(span);
  }

  /**
   * Handles plugins [{PLUGIN ...}]
   * Creates inline span element to allow plugins within paragraphs
   */
  handlePlugin(token: Token): void {
    // Use span for inline rendering instead of div
    const span = this.wikiDocument.createElement('span', {
      class: 'wiki-plugin',
      'data-plugin-content': token.value
    });
    span.textContent = `[{${token.value}}]`;

    // If inside a paragraph, append to paragraph context for inline rendering
    // Otherwise append to current parent for block-level rendering
    if (this.paragraphContext) {
      this.paragraphContext.appendChild(span);
    } else if (this.currentParent) {
      this.currentParent.appendChild(span);
    }
  }

  /**
   * Handles wiki tags [tag]
   */
  handleWikiTag(token: Token): void {
    this.ensureParagraph();
    // Wiki tags like [PageName] are actually links - create link elements
    const link = this.wikiDocument.createElement('a', {
      class: 'wiki-link',
      'data-wiki-link': token.value,
      href: `#${token.value}`
    });
    link.textContent = token.value;
    this.paragraphContext!.appendChild(link);
  }

  /**
   * Handles links [link|text]
   */
  handleLink(token: Token): void {
    this.ensureParagraph();
    const attrs = typeof token.metadata?.attrs === 'string' ? token.metadata.attrs : '';
    const link = this.wikiDocument.createElement('a', {
      class: 'wiki-link',
      'data-wiki-link': token.metadata?.link || '',
      // Raw author attribute string — parsed and whitelisted by DOMLinkHandler
      ...(attrs ? { 'data-wiki-attrs': attrs } : {}),
      href: `#${token.metadata?.link || ''}`
    });
    link.textContent = token.metadata?.text || token.metadata?.link || '';
    this.paragraphContext!.appendChild(link);
  }

  /**
   * Handles interwiki links [Wiki:Page]
   */
  handleInterWiki(token: Token): void {
    this.ensureParagraph();
    const link = this.wikiDocument.createElement('a', {
      class: 'wiki-interwiki',
      'data-interwiki': token.value,
      href: `#${token.value}`
    });
    link.textContent = token.value;
    this.paragraphContext!.appendChild(link);
  }

  /**
   * Handles headings !, !!, !!!
   */
  handleHeading(token: Token): void {
    this.closeCurrentParagraph();
    this.closeAllLists();
    this.closeCurrentTable();

    // JSPWiki uses ! for h3, !! for h2, !!! for h1
    // Level in metadata is count of !, so reverse for h-tags
    const level = Math.min(Math.max(1, token.metadata?.level || 1), 6);
    const headingLevel = 4 - level; // !!! = 3 → h1, !! = 2 → h2, ! = 1 → h3
    const hTag = `h${headingLevel}`;

    const heading = this.wikiDocument.createElement(hTag, {
      class: 'wiki-heading'
    });
    heading.textContent = token.value.trim();
    if (this.currentParent) {
      this.currentParent.appendChild(heading);
    }
  }

  /**
   * Handles list items *, #
   */
  handleListItem(token: Token): void {
    this.closeCurrentParagraph();
    this.closeCurrentTable();

    const level = token.metadata?.level || 1;
    const isOrdered = token.metadata?.ordered || false;

    // Manage list nesting
    this.adjustListStack(level, isOrdered);

    // Create list item
    const li = this.wikiDocument.createElement('li', {
      class: 'wiki-list-item'
    });
    li.textContent = token.value.trim();

    // Append to current list
    const currentList = this.listStack[this.listStack.length - 1].element;
    currentList.appendChild(li);
  }

  /**
   * Handles table cells | cell |
   */
  handleTableCell(token: Token): void {
    this.closeCurrentParagraph();
    this.closeAllLists();

    // Ensure table structure exists
    if (!this.tableContext) {
      this.tableContext = {
        table: this.wikiDocument.createElement('table', { class: 'wiki-table' }),
        currentRow: null
      };
      if (this.currentParent) {
        this.currentParent.appendChild(this.tableContext.table);
      }
    }

    // Create new row if needed
    if (!this.tableContext.currentRow) {
      this.tableContext.currentRow = this.wikiDocument.createElement('tr');
      this.tableContext.table.appendChild(this.tableContext.currentRow);
    }

    // Create cell
    const td = this.wikiDocument.createElement('td', { class: 'wiki-table-cell' });
    td.textContent = token.value;
    this.tableContext.currentRow.appendChild(td);
  }

  /**
   * Handles bold text __text__
   */
  handleBold(token: Token): void {
    this.ensureParagraph();
    const strong = this.wikiDocument.createElement('strong', { class: 'wiki-bold' });
    strong.textContent = token.value;
    this.paragraphContext!.appendChild(strong);
  }

  /**
   * Handles italic text ''text''
   */
  handleItalic(token: Token): void {
    this.ensureParagraph();
    const em = this.wikiDocument.createElement('em', { class: 'wiki-italic' });
    em.textContent = token.value;
    this.paragraphContext!.appendChild(em);
  }

  /**
   * Handles inline code {{text}}
   */
  handleCodeInline(token: Token): void {
    this.ensureParagraph();
    const code = this.wikiDocument.createElement('code', { class: 'wiki-code-inline' });
    code.textContent = token.value;
    this.paragraphContext!.appendChild(code);
  }

  /**
   * Handles code blocks {{{code}}}
   */
  handleCodeBlock(token: Token): void {
    this.closeCurrentParagraph();
    const pre = this.wikiDocument.createElement('pre', { class: 'wiki-code-block' });
    const code = this.wikiDocument.createElement('code');
    code.textContent = token.value;
    pre.appendChild(code);
    if (this.currentParent) {
      this.currentParent.appendChild(pre);
    }
  }

  /**
   * Handles HTML comments <!-- comment -->
   */
  handleComment(token: Token): void {
    // Comments can go anywhere
    const comment = this.wikiDocument.createCommentNode(token.value);
    if (this.paragraphContext) {
      this.paragraphContext.appendChild(comment);
    } else if (this.currentParent) {
      this.currentParent.appendChild(comment);
    }
  }

  /**
   * Handles newlines
   */
  handleNewline(_token: Token): void {
    // Close current table row on newline
    if (this.tableContext && this.tableContext.currentRow) {
      this.tableContext.currentRow = null;
    }

    // For paragraphs, newline can mean paragraph break
    // (Implementation detail: could check for double newlines)
    // For now, just note the newline occurred
  }

  // ========================================================================
  // CONTEXT MANAGEMENT
  // ========================================================================

  /**
   * Ensures a paragraph context exists for inline content
   */
  ensureParagraph(): void {
    if (!this.paragraphContext) {
      this.closeAllLists();
      this.closeCurrentTable();

      this.paragraphContext = this.wikiDocument.createElement('p', {
        class: 'wiki-paragraph'
      });
      if (this.currentParent) {
        this.currentParent.appendChild(this.paragraphContext);
      }
    }
  }

  /**
   * Closes the current paragraph context
   */
  closeCurrentParagraph(): void {
    this.paragraphContext = null;
  }

  /**
   * Adjusts the list stack to match the desired level
   */
  adjustListStack(targetLevel: number, isOrdered: boolean): void {
    // Close lists deeper than target level
    while (this.listStack.length > targetLevel) {
      this.listStack.pop();
    }

    // Open lists to reach target level
    while (this.listStack.length < targetLevel) {
      const newLevel = this.listStack.length + 1;
      const listType = isOrdered ? 'ol' : 'ul';
      const list = this.wikiDocument.createElement(listType, {
        class: `wiki-list wiki-list-level-${newLevel}`
      });

      // Append to parent (either root or last list item)
      if (this.listStack.length === 0 && this.currentParent) {
        this.currentParent.appendChild(list);
      } else if (this.listStack.length > 0) {
        // Append to last item in parent list
        const parentList = this.listStack[this.listStack.length - 1].element;
        const lastChild = parentList.lastChild as LinkedomElement | null;
        if (lastChild) {
          lastChild.appendChild(list);
        } else {
          parentList.appendChild(list);
        }
      }

      this.listStack.push({ level: newLevel, element: list, ordered: isOrdered });
    }

    // Check if we need to change list type at current level
    if (this.listStack.length > 0) {
      const currentList = this.listStack[this.listStack.length - 1];
      if (currentList.ordered !== isOrdered) {
        // Close and reopen with correct type
        this.listStack.pop();
        const listType = isOrdered ? 'ol' : 'ul';
        const list = this.wikiDocument.createElement(listType, {
          class: `wiki-list wiki-list-level-${targetLevel}`
        });

        if (this.listStack.length === 0 && this.currentParent) {
          this.currentParent.appendChild(list);
        } else if (this.listStack.length > 0) {
          const parentList = this.listStack[this.listStack.length - 1].element;
          const lastChild = parentList.lastChild as LinkedomElement | null;
          if (lastChild) {
            lastChild.appendChild(list);
          }
        }

        this.listStack.push({ level: targetLevel, element: list, ordered: isOrdered });
      }
    }
  }

  /**
   * Closes all open lists
   */
  closeAllLists(): void {
    this.listStack = [];
  }

  /**
   * Closes the current table context
   */
  closeCurrentTable(): void {
    this.tableContext = null;
  }
}

export default DOMBuilder;

