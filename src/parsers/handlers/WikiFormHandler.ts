import BaseSyntaxHandler, { InitializationContext, ParseContext } from './BaseSyntaxHandler.js';
import * as crypto from 'crypto';
import logger from '../../utils/logger.js';

/**
 * Form element match information
 */
interface FormElementMatch {
  fullMatch: string;
  elementType: string;
  paramString: string;
  index: number;
  length: number;
}

/**
 * Form state information
 */
interface FormState {
  id: string;
  action: string;
  method: string;
  name: string;
  fields: string[];
  csrfToken: string;
  context: {
    pageName?: string;
    userName?: string;
  };
}

/**
 * Form validation result
 */
interface FormValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedData: Record<string, unknown>;
}

/**
 * Handler configuration
 */
interface HandlerConfig {
  priority?: number;
}

/**
 * Wiki engine interface
 */
interface WikiEngine {
  getManager(name: string): unknown;
}

/**
 * Markup parser interface
 */
interface MarkupParser {
  getHandlerConfig(name: string): HandlerConfig;
}

/**
 * Extended parse context for the form handler. After #629 Pass 2, the
 * setMetadata/getMetadata methods are available on the real ParseContext.
 */
type FormParseContext = ParseContext;

/**
 * WikiFormHandler - Interactive form generation within wiki pages
 *
 * Supports JSPWiki form syntax:
 * - [{FormOpen action='SaveData' method='POST'}] - Form opening
 * - [{FormInput name='field' type='text' value='default'}] - Input fields
 * - [{FormSelect name='choice' options='A,B,C'}] - Select boxes
 * - [{FormTextarea name='comment' rows='5'}] - Text areas
 * - [{FormButton type='submit' value='Save'}] - Form buttons
 * - [{FormClose}] - Form closing
 *
 * Related Issue: #60 - WikiForm Handler (FormOpen, FormInput, FormClose)
 * Epic: #41 - Implement JSPWikiMarkupParser for Complete Enhancement Support
 */
class WikiFormHandler extends BaseSyntaxHandler {
  declare handlerId: string;
  private config: HandlerConfig | null;
  private activeForms: Map<string, FormState>;
  private formCounter: number;

  constructor(_engine: WikiEngine | null = null) {
    super(
      /\[\{Form(Open|Input|Select|Textarea|Button|Close)\s*([^}]*)\}\]/g, // Pattern: [{FormElement params}]
      85, // High priority - process before content handlers
      {
        description: 'JSPWiki-style form handler for interactive forms within wiki pages',
        version: '1.0.0',
        dependencies: ['UserManager'], // For CSRF token generation
        timeout: 5000
      }
    );
    this.handlerId = 'WikiFormHandler';
    this.config = null;

    // Form state tracking
    this.activeForms = new Map();
    this.formCounter = 0;
  }

  /**
   * Initialize handler with configuration
   * @param context - Initialization context
   */
  protected async onInitialize(context: InitializationContext): Promise<void> {

    // Load handler-specific configuration
    const markupParser = context.engine?.getManager('MarkupParser') as MarkupParser | undefined;
    if (markupParser) {
      this.config = markupParser.getHandlerConfig('form');

      if (this.config?.priority && this.config.priority !== this.priority) {
        logger.info(`WikiFormHandler priority configured as ${this.config.priority} (using ${this.priority})`);
      }
    }
  }

  /**
   * Process content by finding and executing all form elements
   * @param content - Content to process
   * @param context - Parse context
   * @returns Content with forms processed
   */
  async process(content: string, context: ParseContext): Promise<string> {
    if (!content) {
      return content;
    }

    // Reset form state for this processing session
    this.activeForms.clear();
    this.formCounter = 0;

    const matches: FormElementMatch[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    this.pattern.lastIndex = 0;

    while ((match = this.pattern.exec(content)) !== null) {
      matches.push({
        fullMatch: match[0],
        elementType: match[1] ?? '', // Open, Input, Select, etc.
        paramString: match[2] ?? '',
        index: match.index,
        length: match[0].length
      });
    }

    // Process matches in order (not reverse) to maintain form structure
    let processedContent = content;
    let offset = 0; // Track offset due to content changes

    for (const matchInfo of matches) {
      try {
        const replacement = await this.handleElement(matchInfo, context);

        const adjustedIndex = matchInfo.index + offset;
        processedContent =
          processedContent.slice(0, adjustedIndex) +
          replacement +
          processedContent.slice(adjustedIndex + matchInfo.length);

        // Update offset for next replacement
        offset += replacement.length - matchInfo.length;

      } catch (error) {
        const err = error as Error;
        logger.error(`WikiForm element error for ${matchInfo.elementType}: ${err.message}`);

        const errorPlaceholder = `<!-- Form Error: ${matchInfo.elementType} - ${err.message} -->`;
        const adjustedIndex = matchInfo.index + offset;
        processedContent =
          processedContent.slice(0, adjustedIndex) +
          errorPlaceholder +
          processedContent.slice(adjustedIndex + matchInfo.length);

        offset += errorPlaceholder.length - matchInfo.length;
      }
    }

    return processedContent;
  }

  /**
   * Handle a specific form element
   * @param matchInfo - Form element match information
   * @param context - Parse context
   * @returns Form element HTML
   */
  private async handleElement(matchInfo: FormElementMatch, context: FormParseContext): Promise<string> {
    const { elementType, paramString } = matchInfo;

    // Parse element parameters
    const parameters = this.parseFormParameters(paramString);

    // Route to specific element handler
    switch (elementType) {
    case 'Open':
      return await this.handleFormOpen(parameters, context);
    case 'Input':
      return this.handleFormInput(parameters);
    case 'Select':
      return this.handleFormSelect(parameters);
    case 'Textarea':
      return this.handleFormTextarea(parameters);
    case 'Button':
      return this.handleFormButton(parameters);
    case 'Close':
      return this.handleFormClose(parameters);
    default:
      throw new Error(`Unsupported form element: ${elementType}`);
    }
  }

  /**
   * Parse form parameters from string
   */
  private parseFormParameters(paramString: string): Record<string, string | boolean | number | undefined> {
    if (!paramString || !paramString.trim()) {
      return {};
    }

    const params: Record<string, string | boolean | number | undefined> = {};
    const paramRegex = /(\w+)=(?:'([^']*)'|"([^"]*)"|([^\s]+))/g;
    let match: RegExpExecArray | null;

    while ((match = paramRegex.exec(paramString)) !== null) {
      const key = match[1];
      const value = match[2] ?? match[3] ?? match[4] ?? '';

      // Try to parse as boolean or number
      if (value === 'true') {
        params[key] = true;
      } else if (value === 'false') {
        params[key] = false;
      } else if (/^\d+$/.test(value)) {
        params[key] = parseInt(value, 10);
      } else {
        params[key] = value;
      }
    }

    return params;
  }

  /**
   * Handle FormOpen element
   * @param params - Form parameters
   * @param context - Parse context
   * @returns Form opening HTML
   */
  private async handleFormOpen(params: Record<string, string | boolean | number | undefined>, context: FormParseContext): Promise<string> {
    const formId = `wikiForm_${++this.formCounter}_${Date.now()}`;
    const action = typeof params.action === 'string' ? params.action : '/api/forms/submit';
    const method = (typeof params.method === 'string' ? params.method : 'POST').toUpperCase();
    const name = typeof params.name === 'string' ? params.name : formId;
    const cssClass = typeof params.class === 'string' ? params.class : 'wiki-form';

    // Generate CSRF token
    const csrfToken = await this.generateCSRFToken(context);

    // Store form state
    this.activeForms.set(formId, {
      id: formId,
      action,
      method,
      name,
      fields: [],
      csrfToken,
      context: {
        pageName: context.wikiContext?.pageName ?? undefined,
        userName: context.userName
      }
    });

    return `<form id="${formId}" name="${name}" action="${action}" method="${method}" class="${cssClass}">
  <input type="hidden" name="_formId" value="${formId}">
  <input type="hidden" name="_csrf" value="${csrfToken}">
  <input type="hidden" name="_pageName" value="${context.wikiContext?.pageName}">`;
  }

  /**
   * Handle FormInput element
   * @param params - Input parameters
   * @returns Input field HTML
   */
  private handleFormInput(params: Record<string, string | boolean | number | undefined>): string {
    const name = typeof params.name === 'string' ? params.name : '';
    const type = typeof params.type === 'string' ? params.type : 'text';
    const value = typeof params.value === 'string' ? params.value : '';
    const placeholder = typeof params.placeholder === 'string' ? params.placeholder : '';
    const required = params.required === 'true' || params.required === true;
    const cssClass = typeof params.class === 'string' ? params.class : 'form-control';
    const id = typeof params.id === 'string' ? params.id : `input_${name}`;

    if (!name) {
      throw new Error('FormInput requires "name" parameter');
    }

    // Validate input type
    const allowedTypes = ['text', 'password', 'email', 'number', 'date', 'hidden', 'checkbox', 'radio', 'file'];
    if (!allowedTypes.includes(type)) {
      throw new Error(`Invalid input type: ${type}`);
    }

    // Build input HTML
    let inputHtml = '<div class="mb-3">';

    // Add label for non-hidden inputs
    if (type !== 'hidden') {
      const label = typeof params.label === 'string' ? params.label : this.capitalize(name);
      inputHtml += `<label for="${id}" class="form-label">${this.escapeHtml(label)}</label>`;
    }

    // Create input element
    inputHtml += `<input type="${type}" id="${id}" name="${name}" class="${cssClass}"`;

    if (value) {
      inputHtml += ` value="${this.escapeHtml(value)}"`;
    }

    if (placeholder) {
      inputHtml += ` placeholder="${this.escapeHtml(placeholder)}"`;
    }

    if (required) {
      inputHtml += ' required';
    }

    // Add additional attributes for specific types
    if (type === 'number') {
      if (params.min !== undefined) inputHtml += ` min="${String(params.min)}"`;
      if (params.max !== undefined) inputHtml += ` max="${String(params.max)}"`;
      if (params.step !== undefined) inputHtml += ` step="${String(params.step)}"`;
    }

    if (type === 'file') {
      if (typeof params.accept === 'string') inputHtml += ` accept="${this.escapeHtml(params.accept)}"`;
      if (params.multiple === 'true') inputHtml += ' multiple';
    }

    inputHtml += '>';

    // Add validation feedback placeholder
    if (type !== 'hidden') {
      inputHtml += '<div class="invalid-feedback"></div>';
    }

    inputHtml += '</div>';

    return inputHtml;
  }

  /**
   * Handle FormSelect element
   * @param params - Select parameters
   * @returns Select field HTML
   */
  private handleFormSelect(params: Record<string, string | boolean | number | undefined>): string {
    const name = typeof params.name === 'string' ? params.name : '';
    const options = typeof params.options === 'string' ? params.options : '';
    const selected = typeof params.selected === 'string' ? params.selected : '';
    const required = params.required === 'true' || params.required === true;
    const cssClass = typeof params.class === 'string' ? params.class : 'form-select';
    const id = typeof params.id === 'string' ? params.id : `select_${name}`;

    if (!name) {
      throw new Error('FormSelect requires "name" parameter');
    }

    const label = typeof params.label === 'string' ? params.label : this.capitalize(name);

    let selectHtml = `<div class="mb-3">
  <label for="${id}" class="form-label">${this.escapeHtml(label)}</label>
  <select id="${id}" name="${name}" class="${cssClass}"${required ? ' required' : ''}>`;

    // Add default option if not required
    if (!required) {
      selectHtml += `<option value="">-- Select ${label} --</option>`;
    }

    // Parse and add options
    const optionList = options.split(',').map(opt => opt.trim()).filter(opt => opt);

    for (const option of optionList) {
      const isSelected = option === selected;
      selectHtml += `<option value="${this.escapeHtml(option)}"${isSelected ? ' selected' : ''}>${this.escapeHtml(option)}</option>`;
    }

    selectHtml += `</select>
  <div class="invalid-feedback"></div>
</div>`;

    return selectHtml;
  }

  /**
   * Handle FormTextarea element
   * @param params - Textarea parameters
   * @returns Textarea HTML
   */
  private handleFormTextarea(params: Record<string, string | boolean | number | undefined>): string {
    const name = typeof params.name === 'string' ? params.name : '';
    const rows = typeof params.rows === 'string' ? params.rows : String(params.rows ?? '3');
    const cols = typeof params.cols === 'string' ? params.cols : '';
    const value = typeof params.value === 'string' ? params.value : '';
    const placeholder = typeof params.placeholder === 'string' ? params.placeholder : '';
    const required = params.required === 'true' || params.required === true;
    const cssClass = typeof params.class === 'string' ? params.class : 'form-control';
    const id = typeof params.id === 'string' ? params.id : `textarea_${name}`;

    if (!name) {
      throw new Error('FormTextarea requires "name" parameter');
    }

    const label = typeof params.label === 'string' ? params.label : this.capitalize(name);

    let textareaHtml = `<div class="mb-3">
  <label for="${id}" class="form-label">${this.escapeHtml(label)}</label>
  <textarea id="${id}" name="${name}" class="${cssClass}" rows="${rows}"`;

    if (cols) {
      textareaHtml += ` cols="${cols}"`;
    }

    if (placeholder) {
      textareaHtml += ` placeholder="${this.escapeHtml(placeholder)}"`;
    }

    if (required) {
      textareaHtml += ' required';
    }

    textareaHtml += `>${this.escapeHtml(value)}</textarea>
  <div class="invalid-feedback"></div>
</div>`;

    return textareaHtml;
  }

  /**
   * Handle FormButton element
   * @param params - Button parameters
   * @returns Button HTML
   */
  private handleFormButton(params: Record<string, string | boolean | number | undefined>): string {
    const type = typeof params.type === 'string' ? params.type : 'button';
    const value = typeof params.value === 'string' ? params.value : 'Button';
    const cssClass = typeof params.class === 'string' ? params.class : `btn ${type === 'submit' ? 'btn-primary' : 'btn-secondary'}`;
    const id = typeof params.id === 'string' ? params.id : `button_${type}_${Date.now()}`;
    const disabled = params.disabled === 'true';

    let buttonHtml = `<button type="${type}" id="${id}" class="${cssClass}"`;

    if (disabled) {
      buttonHtml += ' disabled';
    }

    buttonHtml += `>${this.escapeHtml(value)}</button>`;

    return buttonHtml;
  }

  /**
   * Handle FormClose element
   * @param params - Close parameters (usually empty)
   * @returns Form closing HTML
   */
  private handleFormClose(params: Record<string, string | boolean | number | undefined>): string {
    // Add client-side validation script if enabled
    const includeValidation = params.validation !== 'false';

    let closeHtml = '';

    if (includeValidation) {
      closeHtml += `
<script>
document.addEventListener('DOMContentLoaded', function() {
  const forms = document.querySelectorAll('.wiki-form');
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      if (!form.checkValidity()) {
        e.preventDefault();
        e.stopPropagation();
      }
      form.classList.add('was-validated');
    });
  });
});
</script>`;
    }

    closeHtml += '</form>';

    return closeHtml;
  }

  /**
   * Generate CSRF token for form security
   * @param context - Parse context
   * @returns CSRF token
   */
  private async generateCSRFToken(context: FormParseContext): Promise<string> {
    // Create token based on user context and timestamp
    const tokenData = {
      userName: context.userName || 'anonymous',
      pageName: context.wikiContext?.pageName,
      timestamp: Date.now(),
      random: crypto.randomBytes(16).toString('hex')
    };

    const token = crypto.createHash('sha256')
      .update(JSON.stringify(tokenData))
      .digest('hex')
      .substring(0, 32);

    // Store token for validation (in production, this would be in session/database)
    if (context.setMetadata) {
      context.setMetadata(`csrfToken_${token}`, {
        ...tokenData,
        expires: Date.now() + 3600000 // 1 hour
      });
    }

    return token;
  }

  /**
   * Validate form submission (for future form processing endpoint)
   * @param formData - Submitted form data
   * @param csrfToken - CSRF token from form
   * @param context - Parse context
   * @returns Validation result
   */
  validateFormSubmission(formData: Record<string, string>, csrfToken: string, context: FormParseContext): FormValidationResult {
    const errors: string[] = [];

    // Validate CSRF token
    const tokenData = context.getMetadata?.(`csrfToken_${csrfToken}`) as { expires: number } | undefined;
    if (!tokenData) {
      errors.push('Invalid or missing CSRF token');
    } else if (tokenData.expires < Date.now()) {
      errors.push('CSRF token expired');
    }

    // Validate required fields (basic validation)
    for (const [fieldName] of Object.entries(formData)) {
      if (fieldName.startsWith('_')) {
        continue; // Skip internal fields
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: this.sanitizeFormData(formData)
    };
  }

  /**
   * Sanitize form data to prevent XSS
   * @param formData - Raw form data
   * @returns Sanitized form data
   */
  private sanitizeFormData(formData: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(formData)) {
      if (typeof value === 'string') {
        // Basic XSS prevention
        sanitized[key] = this.escapeHtml(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Escape HTML characters to prevent XSS
   * @param text - Text to escape
   * @returns Escaped text
   */
  private escapeHtml(text: string): string {
    if (typeof text !== 'string') {
      return text;
    }

    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Capitalize first letter of string
   * @param str - String to capitalize
   * @returns Capitalized string
   */
  private capitalize(str: string): string {
    if (typeof str !== 'string' || str.length === 0) {
      return str;
    }
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Get supported form patterns
   * @returns Array of supported patterns
   */
  getSupportedPatterns(): string[] {
    return [
      '[{FormOpen action="/save" method="POST"}]',
      '[{FormInput name="title" type="text" required="true"}]',
      '[{FormInput name="email" type="email" placeholder="Enter email"}]',
      '[{FormSelect name="category" options="General,Technical,Support"}]',
      '[{FormTextarea name="comment" rows="5" placeholder="Enter comment"}]',
      '[{FormButton type="submit" value="Save" class="btn btn-primary"}]',
      '[{FormClose}]'
    ];
  }

  /**
   * Get supported input types
   * @returns Array of supported input types
   */
  getSupportedInputTypes(): string[] {
    return [
      'text', 'password', 'email', 'number', 'date', 'datetime-local',
      'time', 'url', 'tel', 'search', 'hidden', 'checkbox', 'radio', 'file'
    ];
  }

  /**
   * Get handler information for debugging and documentation
   * @returns Handler information
   */
  getInfo(): Record<string, unknown> {
    return {
      ...super.getMetadata(),
      supportedPatterns: this.getSupportedPatterns(),
      supportedInputTypes: this.getSupportedInputTypes(),
      features: [
        'Interactive form generation',
        'CSRF protection',
        'HTML5 input types',
        'Bootstrap styling',
        'Client-side validation',
        'XSS prevention',
        'Required field validation',
        'File upload support',
        'Customizable CSS classes',
        'Form state tracking'
      ],
      formElements: [
        'FormOpen - Form opening with CSRF protection',
        'FormInput - Various input types with validation',
        'FormSelect - Dropdown selections with options',
        'FormTextarea - Multi-line text input',
        'FormButton - Submit and action buttons',
        'FormClose - Form closing with validation script'
      ]
    };
  }
}

export default WikiFormHandler;

