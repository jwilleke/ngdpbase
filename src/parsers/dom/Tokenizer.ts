/**
 * Tokenizer - Character-by-character parser for wiki markup
 *
 * ============================================================================
 * ARCHITECTURE NOTE (Phase 4, Issue #118):
 * ============================================================================
 *
 * **This Tokenizer is a REFERENCE IMPLEMENTATION and is NOT actively used
 * in the current rendering pipeline.**
 *
 * HISTORY:
 * --------
 * Prior to Issue #114, this Tokenizer was part of the Phase 0 DOM parsing
 * pipeline (Tokenizer → DOMBuilder → WikiDocument). However, this approach
 * had conflicts when trying to parse both markdown AND JSPWiki syntax,
 * resulting in bugs like ## headings becoming list items (Issue #110, #93).
 *
 * CURRENT ARCHITECTURE (Phases 1-3, Issue #114):
 * -----------------------------------------------
 * The rendering pipeline now uses a pre-extraction strategy inspired by
 * JSPWiki's approach with FlexMark:
 *
 * 1. **Phase 1 - Extraction** (MarkupParser.extractJSPWikiSyntax())
 *    - Extract ONLY JSPWiki syntax using regex
 *    - Replace with HTML comment placeholders
 *    - Result: Sanitized markdown + extracted elements
 *
 * 2. **Phase 2 - DOM Creation** (MarkupParser.createDOMNode())
 *    - Create DOM nodes from extracted elements
 *    - Uses DOMVariableHandler, DOMPluginHandler, DOMLinkHandler
 *    - Result: Array of DOM nodes with data-jspwiki-id
 *
 * 3. **Phase 3 - Showdown + Merge** (MarkupParser.parseWithDOMExtraction())
 *    - Showdown processes the sanitized markdown (handles ALL markdown)
 *    - mergeDOMNodes() replaces placeholders with rendered nodes
 *    - Result: Final HTML with both markdown and JSPWiki syntax
 *
 * WHY THIS TOKENIZER IS KEPT:
 * ---------------------------
 * - **Reference**: Documents JSPWiki syntax patterns clearly
 * - **Testing**: Useful for unit testing syntax recognition
 * - **Future**: May be enhanced for advanced use cases
 * - **Educational**: Helps understand what we're parsing
 *
 * KEY DIFFERENCE:
 * --------------
 * - **Tokenizer**: Character-by-character, token-based parsing
 * - **extractJSPWikiSyntax()**: Regex-based extraction (faster, simpler)
 *
 * The extraction approach is faster and avoids markdown conflicts because:
 * 1. It extracts JSPWiki syntax BEFORE markdown parsing
 * 2. Showdown handles ALL markdown (no conflicts)
 * 3. DOM nodes are merged back AFTER markdown conversion
 *
 * ============================================================================
 *
 * KEY FEATURES OF THIS TOKENIZER:
 * - Character-by-character reading with position tracking
 * - Lookahead support via peekChar()
 * - Pushback support for complex token recognition
 * - Line and column tracking for error reporting
 * - Handles Unicode characters correctly
 * - JSPWiki-only syntax (no markdown patterns)
 *
 * RELATED:
 * - Issue #93: WikiDocument DOM Epic
 * - Issue #110: Escaping bug
 * - Issue #114: WikiDocument DOM Solution (heading bug fix)
 * - Issue #118: Remove Markdown Tokenization (this change)
 * - docs/planning/WikiDocument-DOM-Solution.md
 *
 * Part of Phase 2 of WikiDocument DOM Migration (GitHub Issue #93)
 */

/**
 * Token types enum
 */
export enum TokenType {
  TEXT = 'TEXT',
  ESCAPED = 'ESCAPED',
  VARIABLE = 'VARIABLE',
  PLUGIN = 'PLUGIN',
  METADATA = 'METADATA',
  WIKI_TAG = 'WIKI_TAG',
  LINK = 'LINK',
  INTERWIKI = 'INTERWIKI',
  HEADING = 'HEADING',
  LIST_ITEM = 'LIST_ITEM',
  TABLE_CELL = 'TABLE_CELL',
  BOLD = 'BOLD',
  ITALIC = 'ITALIC',
  CODE_INLINE = 'CODE_INLINE',
  CODE_BLOCK = 'CODE_BLOCK',
  COMMENT = 'COMMENT',
  NEWLINE = 'NEWLINE',
  EOF = 'EOF'
}

/**
 * Token metadata interface
 */
export interface TokenMetadata {
  /** Variable name (for VARIABLE tokens) */
  varName?: string;
  /** Plugin content (for PLUGIN tokens) */
  pluginContent?: string;
  /** Metadata content (for METADATA tokens) */
  metadataContent?: string;
  /** Link target (for LINK tokens) */
  link?: string;
  /** Link text (for LINK tokens) */
  text?: string;
  /** Raw attribute string after the second pipe (for LINK tokens), e.g. `class='btn'` */
  attrs?: string;
  /** Heading level (for HEADING tokens) */
  level?: number;
  /** List marker (* or #) (for LIST_ITEM tokens) */
  marker?: string;
  /** Whether list is ordered (for LIST_ITEM tokens) */
  ordered?: boolean;
  /** Additional metadata properties */
  [key: string]: unknown;
}

/**
 * Position information
 */
export interface PositionInfo {
  /** Character position in input */
  position: number;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
}

/**
 * Token structure
 */
export interface Token extends PositionInfo {
  /** Token type from TokenType enum */
  type: TokenType | string;
  /** Token value/content */
  value: string;
  /** Additional token-specific data */
  metadata?: TokenMetadata;
  /** Index signature for additional properties */
  [key: string]: unknown;
}

/**
 * Pushback buffer item
 */
interface PushbackItem {
  /** Character */
  char: string;
  /** Position of character in input */
  position: number;
  /** Line number after reading */
  afterLine: number;
  /** Column number after reading */
  afterColumn: number;
}

/**
 * Tokenizer class
 */
export class Tokenizer {
  /** Input string */
  protected input: string;

  /** Length of input */
  private length: number;

  /** Current position in input */
  position: number;

  /** Current line number */
  line: number;

  /** Current column number */
  column: number;

  /** Pushback buffer for character lookahead */
  private pushbackBuffer: PushbackItem[];

  /**
   * Create a new Tokenizer
   * @param input - The wiki markup to tokenize
   */
  constructor(input: string | null | undefined) {
    this.input = input || '';
    this.length = this.input.length;
    this.position = 0;
    this.line = 1;
    this.column = 1;
    this.pushbackBuffer = [];
  }

  /**
   * Get the current character without advancing
   * @returns Current character or null if at EOF
   */
  peekChar(): string | null {
    if (this.pushbackBuffer.length > 0) {
      return this.pushbackBuffer[this.pushbackBuffer.length - 1].char;
    }

    if (this.position >= this.length) {
      return null;
    }

    const cp = this.input.codePointAt(this.position);
    return cp !== undefined ? String.fromCodePoint(cp) : null;
  }

  /**
   * Get the next character and advance position
   * @returns Next character or null if at EOF
   */
  nextChar(): string | null {
    // Check pushback buffer first
    if (this.pushbackBuffer.length > 0) {
      const pushed = this.pushbackBuffer.pop();
      if (pushed) {
        // Restore position to AFTER the character (pushed.position is where the char is)
        this.position = pushed.position + 1;
        this.line = pushed.afterLine;
        this.column = pushed.afterColumn;
        return pushed.char;
      }
    }

    if (this.position >= this.length) {
      return null;
    }

    const cp = this.input.codePointAt(this.position);
    if (cp === undefined) return null;
    const char = String.fromCodePoint(cp);
    this.position += char.length; // advance 2 for surrogate-pair emoji, 1 for BMP chars

    // Track line and column
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }

    return char;
  }

  /**
   * Push a character back onto the input stream
   * Allows the tokenizer to "undo" reading a character
   * @param char - Character to push back
   */
  pushBack(char: string | null): void {
    if (char === null) {
      return;
    }

    // Save current "after" position state (where we are now)
    const afterLine = this.line;
    const afterColumn = this.column;

    // Calculate "before" position (where character was read from)
    const beforePos = this.position - 1;

    // Adjust current position backwards
    this.position = beforePos;

    // Adjust line and column backwards
    if (char === '\n') {
      this.line--;
      // We don't know the exact column of the previous line,
      // Will be recalculated when needed
      this.column = 1;
    } else {
      this.column--;
    }

    // Store in pushback buffer with both before and after states
    this.pushbackBuffer.push({
      char: char,
      position: beforePos,        // where the char is in input
      afterLine: afterLine,       // line after reading
      afterColumn: afterColumn    // column after reading
    });
  }

  /**
   * Peek ahead N characters without consuming them
   * @param count - Number of characters to peek ahead
   * @returns String of next N characters
   */
  peekAhead(count: number): string {
    const chars: string[] = [];

    // If pushback buffer has content, use it first
    const bufferChars = this.pushbackBuffer.slice().reverse();
    for (let i = 0; i < Math.min(count, bufferChars.length); i++) {
      chars.push(bufferChars[i].char);
    }

    // Then read from input if needed
    const remaining = count - chars.length;
    if (remaining > 0) {
      const startPos = this.position;
      for (let i = 0; i < remaining && startPos + i < this.length; i++) {
        chars.push(this.input[startPos + i]);
      }
    }

    return chars.join('');
  }

  /**
   * Skip whitespace characters (space, tab)
   * Does NOT skip newlines
   * @returns Number of whitespace characters skipped
   */
  skipWhitespace(): number {
    let count = 0;
    while (true) {
      const char = this.peekChar();
      if (char === ' ' || char === '\t') {
        this.nextChar();
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * Skip all whitespace including newlines
   * @returns Number of whitespace characters skipped
   */
  skipAllWhitespace(): number {
    let count = 0;
    while (true) {
      const char = this.peekChar();
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
        this.nextChar();
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * Check if we're at the end of the input
   * @returns True if at EOF
   */
  isEOF(): boolean {
    return this.pushbackBuffer.length === 0 && this.position >= this.length;
  }

  /**
   * Check if we're at the start of a line
   * @returns True if at line start
   */
  isLineStart(): boolean {
    return this.column === 1;
  }

  /**
   * Get current position information
   * @returns Position information
   */
  getPosition(): PositionInfo {
    return {
      position: this.position,
      line: this.line,
      column: this.column
    };
  }

  /**
   * Create a token with current position information
   * @param type - Token type from TokenType enum
   * @param value - Token value
   * @param metadata - Additional token metadata
   * @returns The created token
   */
  createToken(type: TokenType | string, value: string, metadata: TokenMetadata = {}): Token {
    return {
      type,
      value,
      line: this.line,
      column: this.column,
      position: this.position,
      metadata
    };
  }

  /**
   * Read until a specific character or string is found
   * @param delimiters - Character(s) to stop at
   * @param consume - Whether to consume the delimiter
   * @returns Text read until delimiter
   */
  readUntil(delimiters: string | string[], consume = false): string {
    const delimiterArray = Array.isArray(delimiters) ? delimiters : [delimiters];
    const result: string[] = [];

    while (!this.isEOF()) {
      // Check if we've hit a delimiter
      let foundDelimiter = false;
      for (const delim of delimiterArray) {
        if (this.peekAhead(delim.length) === delim) {
          foundDelimiter = true;
          if (consume) {
            // Consume the delimiter
            for (let i = 0; i < delim.length; i++) {
              this.nextChar();
            }
          }
          break;
        }
      }

      if (foundDelimiter) {
        break;
      }

      const char = this.nextChar();
      if (char !== null) {
        result.push(char);
      }
    }

    return result.join('');
  }

  /**
   * Match a specific string at current position
   * @param str - String to match
   * @param consume - Whether to consume if matched
   * @returns True if matched
   */
  match(str: string, consume = false): boolean {
    if (this.peekAhead(str.length) === str) {
      if (consume) {
        for (let i = 0; i < str.length; i++) {
          this.nextChar();
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Expect a specific string at current position, throw if not found
   * @param str - String to expect
   * @throws Error if string not found
   */
  expect(str: string): void {
    if (!this.match(str, true)) {
      throw new Error(
        `Expected "${str}" at line ${this.line}, column ${this.column}, ` +
        `but found "${this.peekAhead(str.length)}"`
      );
    }
  }

  /**
   * Get a substring of the input
   * @param start - Start position
   * @param end - End position
   * @returns Substring
   */
  substring(start: number, end: number): string {
    return this.input.substring(start, end);
  }

  /**
   * Reset tokenizer to beginning
   */
  reset(): void {
    this.position = 0;
    this.line = 1;
    this.column = 1;
    this.pushbackBuffer = [];
  }

  // ========================================================================
  // TOKEN RECOGNITION METHODS (Phase 2.3)
  // ========================================================================

  /**
   * Tokenize the entire input into tokens
   * @returns Array of tokens
   */
  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isEOF()) {
      const token = this.nextToken();
      if (token) {
        tokens.push(token);
      }
    }

    // Add EOF token
    tokens.push(this.createToken(TokenType.EOF, ''));

    return tokens;
  }

  /**
   * Get the next token from the input
   * @returns Next token or null if EOF
   */
  nextToken(): Token | null {
    if (this.isEOF()) {
      return null;
    }

    const char = this.peekChar();

    // Newlines
    if (char === '\n') {
      return this.parseNewlineToken();
    }

    // Escaped sequences: [[text]]
    if (this.match('[[')) {
      return this.parseEscapedToken();
    }

    // JSPWiki-style directives: [{...}]
    // - [{$variable}] → Variable
    // - [{SET name=value}] → Metadata
    // - [{PluginName params}] → Plugin
    if (this.match('[{')) {
      return this.parseBracketDirective();
    }

    // Wiki tags: [tag ...]
    // BUT NOT [[escaped or [{directive}]
    if (char === '[' && !this.match('[[') && !this.match('[{')) {
      return this.parseWikiTagToken();
    }

    // Links: [link|text]
    // Note: Handled by parseWikiTagToken for now

    // Headings: !!! Heading (at line start)
    if (this.isLineStart() && char === '!') {
      return this.parseHeadingToken();
    }

    // Lists: * item, # item (at line start)
    if (this.isLineStart() && (char === '*' || char === '#')) {
      return this.parseListItemToken();
    }

    // Tables: | cell (at line start or after |)
    if (char === '|') {
      return this.parseTableCellToken();
    }

    // Bold: __text__
    if (this.match('__')) {
      return this.parseBoldToken();
    }

    // Italic: ''text''
    if (this.match("''")) {
      return this.parseItalicToken();
    }

    // Code inline: {{text}}
    if (this.match('{{') && !this.match('{{{')) {
      return this.parseCodeInlineToken();
    }

    // Code block: {{{code}}}
    if (this.match('{{{')) {
      return this.parseCodeBlockToken();
    }

    // Comments: <!-- comment -->
    if (this.match('<!--')) {
      return this.parseCommentToken();
    }

    // Default: plain text
    return this.parseTextToken();
  }

  /**
   * Parse newline token
   * @returns Newline token
   */
  parseNewlineToken(): Token {
    const pos = this.getPosition();
    this.nextChar(); // consume \n
    return {
      type: TokenType.NEWLINE,
      value: '\n',
      ...pos
    };
  }

  /**
   * Parse escaped text: [[text]
   * Syntax: [[content] where [[ outputs literal [
   * Everything between [[ and ] is treated as plain text
   * Example: [[{$variable}] renders as literal [{$variable}]
   * @returns Escaped token
   */
  parseEscapedToken(): Token {
    const pos = this.getPosition();
    this.expect('[['); // consume [[

    // Read until closing ] (syntax: [[content] outputs [content])
    // JSPWiki: [[ outputs [, everything until matching ] is literal
    // Need to handle nested brackets: [[text [link] more]
    const content: string[] = [];
    let bracketDepth = 0;

    while (!this.isEOF()) {
      const char = this.peekChar();

      if (char === '[') {
        // Nested opening bracket - increment depth
        bracketDepth++;
        content.push(this.nextChar()!);
      } else if (char === ']') {
        if (bracketDepth > 0) {
          // This ] closes a nested [
          bracketDepth--;
          content.push(this.nextChar()!);
        } else {
          // This ] closes the escaped section
          content.push(this.nextChar()!); // include ] in output
          break;
        }
      } else {
        // Regular character
        content.push(this.nextChar()!);
      }
    }

    // If we reached EOF without finding ], that's OK - just return what we have
    // JSPWiki is lenient with unclosed brackets

    return {
      type: TokenType.ESCAPED,
      value: '[' + content.join(''), // Output [content] (with closing ])
      ...pos
    };
  }

  /**
   * Parse bracket directive [{...}]
   * Determines type based on content:
   * - [{$...}] → Variable
   * - [{SET ...}] → Metadata
   * - [{...}] → Plugin
   * @returns Directive token
   */
  parseBracketDirective(): Token {
    const pos = this.getPosition();
    this.expect('[{');

    // Peek ahead to determine type
    const firstChar = this.peekChar();

    if (firstChar === '$') {
      // Variable: [{$varname}]
      return this.parseVariableToken(pos);
    } else if (this.match('SET')) {
      // Metadata: [{SET name=value}]
      return this.parseMetadataToken(pos);
    } else {
      // Plugin: [{PluginName params}]
      return this.parsePluginToken(pos);
    }
  }

  /**
   * Parse variable: [{$varname}]
   * Called after [{has been consumed
   * @param pos - Position object
   * @returns Variable token
   */
  parseVariableToken(pos: PositionInfo): Token {
    // Consume the $
    this.expect('$');

    const varName = this.readUntil('}]');
    this.expect('}]');

    return {
      type: TokenType.VARIABLE,
      value: varName,
      ...pos,
      metadata: { varName }
    };
  }

  /**
   * Parse metadata: [{SET name=value}]
   * Called after [{ has been consumed
   * @param pos - Position object
   * @returns Metadata token
   */
  parseMetadataToken(pos: PositionInfo): Token {
    this.expect('SET');
    this.skipWhitespace();

    const content = this.readUntil('}]');
    this.expect('}]');

    return {
      type: TokenType.METADATA,
      value: content.trim(),
      ...pos,
      metadata: { metadataContent: content.trim() }
    };
  }

  /**
   * Parse plugin: [{PluginName param1=value1}]
   * Called after [{ has been consumed
   * @param pos - Position object
   * @returns Plugin token
   */
  parsePluginToken(pos: PositionInfo): Token {
    const content = this.readUntil('}]');
    this.expect('}]');

    return {
      type: TokenType.PLUGIN,
      value: content,
      ...pos,
      metadata: { pluginContent: content }
    };
  }

  /**
   * Parse wiki tag or link: [link], [link|text]
   * @returns Wiki tag or link token
   */
  parseWikiTagToken(): Token {
    const pos = this.getPosition();
    this.expect('[');

    const content = this.readUntil(']');
    this.expect(']');

    // Check if it's a link (contains |)
    // JSPWiki syntax: [DisplayText|Target] or [Target] or
    // [DisplayText|Target|attr='value' …] — everything after the second
    // pipe is the attribute string (split('|', 2) used to DISCARD it).
    if (content.includes('|')) {
      const parts = content.split('|');
      const displayText = parts[0].trim();
      const target = (parts[1] ?? '').trim();
      const attrs = parts.slice(2).join('|').trim();
      return {
        type: TokenType.LINK,
        value: content,
        ...pos,
        metadata: { link: target, text: displayText, ...(attrs ? { attrs } : {}) }
      };
    }

    return {
      type: TokenType.WIKI_TAG,
      value: content,
      ...pos
    };
  }

  /**
   * Parse heading: !!!, !!, !
   * @returns Heading token
   */
  parseHeadingToken(): Token {
    const pos = this.getPosition();
    let level = 0;

    // Count ! characters
    while (this.peekChar() === '!' && level < 3) {
      this.nextChar();
      level++;
    }

    // Read heading text until newline
    this.skipWhitespace();
    const text = this.readUntil('\n');

    return {
      type: TokenType.HEADING,
      value: text,
      ...pos,
      metadata: { level }
    };
  }

  /**
   * Parse list item: *, #, **, ##, etc.
   * @returns List item token
   */
  parseListItemToken(): Token {
    const pos = this.getPosition();
    const marker = this.peekChar();
    let level = 0;

    // Count markers
    while (this.peekChar() === marker) {
      this.nextChar();
      level++;
    }

    this.skipWhitespace();
    const text = this.readUntil('\n');

    return {
      type: TokenType.LIST_ITEM,
      value: text,
      ...pos,
      metadata: {
        marker: marker ?? undefined, // * or #
        level: level,
        ordered: marker === '#'
      }
    };
  }

  /**
   * Parse table cell: | cell
   * @returns Table cell token
   */
  parseTableCellToken(): Token {
    const pos = this.getPosition();
    this.expect('|');

    this.skipWhitespace();
    const content = this.readUntil(['|', '\n']);

    return {
      type: TokenType.TABLE_CELL,
      value: content.trim(),
      ...pos
    };
  }

  /**
   * Parse bold: __text__
   * @returns Bold token
   */
  parseBoldToken(): Token {
    const pos = this.getPosition();
    this.expect('__');

    const text = this.readUntil('__');
    this.expect('__');

    return {
      type: TokenType.BOLD,
      value: text,
      ...pos
    };
  }

  /**
   * Parse italic: ''text''
   * @returns Italic token
   */
  parseItalicToken(): Token {
    const pos = this.getPosition();
    this.expect("''");

    const text = this.readUntil("''");
    this.expect("''");

    return {
      type: TokenType.ITALIC,
      value: text,
      ...pos
    };
  }

  /**
   * Parse inline code: {{text}}
   * @returns Code inline token
   */
  parseCodeInlineToken(): Token {
    const pos = this.getPosition();
    this.expect('{{');

    const code = this.readUntil('}}');
    this.expect('}}');

    return {
      type: TokenType.CODE_INLINE,
      value: code,
      ...pos
    };
  }

  /**
   * Parse code block: {{{code}}}
   * @returns Code block token
   */
  parseCodeBlockToken(): Token {
    const pos = this.getPosition();
    this.expect('{{{');

    const code = this.readUntil('}}}');
    this.expect('}}}');

    return {
      type: TokenType.CODE_BLOCK,
      value: code,
      ...pos
    };
  }

  /**
   * Parse HTML comment: <!-- comment -->
   * @returns Comment token
   */
  parseCommentToken(): Token {
    const pos = this.getPosition();
    this.expect('<!--');

    const comment = this.readUntil('-->');
    this.expect('-->');

    return {
      type: TokenType.COMMENT,
      value: comment,
      ...pos
    };
  }

  /**
   * Parse plain text until next special character
   * @returns Text token
   */
  parseTextToken(): Token {
    const pos = this.getPosition();
    const chars: string[] = [];

    // Read until we hit a special character or newline
    while (!this.isEOF()) {
      const char = this.peekChar();

      // Check for special character sequences
      if (char === '\n' ||
          this.match('[[') ||
          this.match('[{') ||  // Variable syntax
          this.match('<!--') ||
          (this.isLineStart() && (char === '!' || char === '*' || char === '#')) ||
          char === '|' ||
          this.match('__') ||
          this.match("''") ||
          this.match('{{') ||
          (char === '[' && !this.match('[[') && !this.match('[{'))) {  // [ but not [[ or [{
        break;
      }

      chars.push(this.nextChar()!);
    }

    return {
      type: TokenType.TEXT,
      value: chars.join(''),
      ...pos
    };
  }
}

// Export for compatibility
export { Tokenizer as default };
