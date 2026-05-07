import BaseManager from './BaseManager.js';
import logger from '../utils/logger.js';
import LocaleUtils from '../utils/LocaleUtils.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type PageManager from './PageManager.js';

/**
 * Variable handler function type
 */
export type VariableHandler = (context?: VariableContext) => string;

/**
 * Variable context interface - contains contextual information for variable expansion
 */
export interface VariableContext {
  pageName?: string;
  userName?: string;
  userContext?: {
    username?: string;
    isAuthenticated?: boolean;
    roles?: string[];
    displayName?: string;
    /** User's preferred locale (e.g., 'en-US') */
    locale?: string;
    /** User's timezone (e.g., 'America/New_York') */
    timezone?: string;
    /** Full user preferences object */
    preferences?: {
      locale?: string;
      timezone?: string;
      dateFormat?: string;
      [key: string]: unknown;
    };
  };
  requestInfo?: {
    userAgent?: string;
    clientIp?: string;
    referer?: string;
    sessionId?: string;
    acceptLanguage?: string;
  };
  [key: string]: unknown;
}

/**
 * Debug information about registered variables
 */
export interface VariableDebugInfo {
  totalVariables: number;
  systemVariables: string[];
  contextualVariables: string[];
  allVariables: string[];
}

/**
 * VariableManager - Handles the expansion of JSPWiki-style variables
 *
 * Provides dynamic variable expansion in wiki content. Variables are
 * placeholders like [{$username}], [{$pageName}] that are replaced with
 * actual values during rendering based on the current context.
 *
 * Supported variable categories:
 * - Application info: appName, version, baseURL
 * - Page context: pageName
 * - User context: username, loginStatus, userRoles
 * - Date/Time: date, time, timestamp, year, month, day
 * - System info: uptime
 *
 * @class VariableManager
 * @extends BaseManager
 *
 * @property {Map<string, VariableHandler>} variableHandlers - Variable name to handler function map
 *
 * @see {@link BaseManager} for base functionality
 *
 * @example
 * const variableManager = engine.getManager('VariableManager');
 * const expanded = variableManager.expandVariables('Hello [{$username}]!', context);
 * // Returns: 'Hello admin!'
 */
class VariableManager extends BaseManager {
  private variableHandlers: Map<string, VariableHandler>;

  /**
   * Creates a new VariableManager instance
   *
   * @constructor
   * @param {any} engine - The wiki engine instance
   */

  constructor(engine: WikiEngine) {
    super(engine);
    this.variableHandlers = new Map();
  }

  /**
   * Initialize the VariableManager and register core variables
   *
   * @async
   * @returns {Promise<void>}
   */
  async initialize(): Promise<void> {
    this.registerCoreVariables();
    logger.info('🔧 VariableManager initialized with core variables.');
  }

  /**
   * Registers the default set of JSPWiki-compatible variables.
   */
  private registerCoreVariables(): void {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');

    // Application info
    this.registerVariable('appName', (_context) => {
      return configManager?.getProperty('ngdpbase.application-name', 'ngdpbase') as string ?? 'ngdpbase';
    });
    this.registerVariable('applicationname', (_context) => {
      return configManager?.getProperty('ngdpbase.application-name', 'ngdpbase') as string ?? 'ngdpbase';
    });
    this.registerVariable('version', (_context) => {
      return configManager?.getProperty('ngdpbase.version', '1.0.0') as string ?? '1.0.0';
    });
    this.registerVariable('baseurl', (_context) => {
      return configManager?.getProperty('ngdpbase.application.base-url', 'http://localhost:3000') as string ?? 'http://localhost:3000';
    });

    // Page context - ParseContext has pageName directly
    this.registerVariable('pagename', (context) => {
      return context?.pageName || 'unknown';
    });

    // User context - ParseContext has userName and userContext
    this.registerVariable('username', (context) => {
      return context?.userName || context?.userContext?.username || 'Anonymous';
    });
    this.registerVariable('loginstatus', (context) => (context?.userContext?.isAuthenticated ? 'Logged in' : 'Not logged in'));
    this.registerVariable('userroles', (context) => (context?.userContext?.roles || []).join(', '));

    // Date/Time variables - honor user locale and format preferences (#37)
    this.registerVariable('date', (context) => {
      const now = new Date();
      const dateFormat = this.getUserDateFormat(context);
      const timezone = this.getUserTimezone(context);
      if (dateFormat) {
        return LocaleUtils.formatDateWithPattern(now, dateFormat, timezone ?? undefined);
      }
      const locale = this.getUserLocale(context);
      const opts: Intl.DateTimeFormatOptions = timezone ? { timeZone: timezone } : {};
      try {
        return now.toLocaleDateString(locale, opts);
      } catch {
        return now.toLocaleDateString('en-US', opts);
      }
    });
    this.registerVariable('time', (context) => {
      const now = new Date();
      const timeFormat = this.getUserTimeFormat(context);
      const locale = this.getUserLocale(context);
      const timezone = this.getUserTimezone(context);
      if (timeFormat) {
        return LocaleUtils.formatTimeWithPrefs(now, timeFormat, locale, timezone ?? undefined);
      }
      return LocaleUtils.formatTime(now, locale);
    });
    this.registerVariable('timestamp', (context) => {
      const now = new Date();
      const timezone = this.getUserTimezone(context);
      const locale = this.getUserLocale(context);
      if (timezone) {
        return now.toLocaleString(locale, { timeZone: timezone });
      }
      return now.toISOString();
    });
    this.registerVariable('year', (_context) => new Date().getFullYear().toString());
    this.registerVariable('month', (_context) => (new Date().getMonth() + 1).toString());
    this.registerVariable('day', (_context) => new Date().getDate().toString());

    // System info
    this.registerVariable('uptime', (_context) => {
      const startTime = this.engine.startTime;
      if (startTime) {
        const uptimeMs = Date.now() - startTime;
        const uptimeSec = Math.floor(uptimeMs / 1000);
        const hours = Math.floor(uptimeSec / 3600);
        const minutes = Math.floor((uptimeSec % 3600) / 60);
        const seconds = uptimeSec % 60;
        return `${hours}h ${minutes}m ${seconds}s`;
      }
      return 'unknown';
    });

    this.registerVariable('totalpages', (_context) => {
      const pageManager = this.engine.getManager<PageManager>('PageManager');
      if (pageManager) {
        const provider = pageManager.getCurrentPageProvider();
        // pageCache is a protected property not on the public interface
        const providerWithCache = provider as { pageCache?: Map<string, unknown> } | null;
        if (providerWithCache?.pageCache) {
          return providerWithCache.pageCache.size.toLocaleString('en-US');
        }
      }
      return '0';
    });

    // User profile variables
    this.registerVariable('displayname', (context) => {
      if (!context || !context.userContext) {
        return 'Anonymous';
      }
      const userContext = context.userContext;
      return userContext.displayName || userContext.username || 'Anonymous';
    });

    // Browser and network variables
    this.registerVariable('useragent', (context) => {
      if (!context || !context.requestInfo) {
        return 'Unknown';
      }
      return context.requestInfo.userAgent || 'Unknown';
    });

    this.registerVariable('browser', (context) => {
      if (!context || !context.requestInfo || !context.requestInfo.userAgent) {
        return 'Unknown';
      }
      return this.getBrowserInfo(context.requestInfo.userAgent);
    });

    this.registerVariable('clientip', (context) => {
      if (!context || !context.requestInfo) {
        return 'Unknown';
      }
      return context.requestInfo.clientIp || 'Unknown';
    });

    this.registerVariable('referer', (context) => {
      if (!context || !context.requestInfo) {
        return 'Direct';
      }
      return context.requestInfo.referer || 'Direct';
    });

    this.registerVariable('sessionid', (context) => {
      if (!context || !context.requestInfo) {
        return 'None';
      }
      return context.requestInfo.sessionId || 'None';
    });

    this.registerVariable('acceptlanguage', (context) => {
      if (!context || !context.requestInfo) {
        return 'Unknown';
      }
      return context.requestInfo.acceptLanguage || 'Unknown';
    });
  }

  /**
   * Get user's preferred locale from context.
   * Priority: 1) preferences.locale, 2) userContext.locale, 3) Accept-Language header, 4) en-US
   */
  private getUserLocale(context?: VariableContext): string {
    const userCtx = context?.userContext as Record<string, unknown> | undefined;
    const prefs = userCtx?.['preferences'] as Record<string, unknown> | undefined;
    const userLocale = (prefs?.['locale'] ?? userCtx?.['locale']) as string | undefined;
    if (userLocale) {
      return LocaleUtils.normalizeLocale(userLocale);
    }

    const acceptLanguage = context?.requestInfo?.acceptLanguage;
    if (acceptLanguage && typeof acceptLanguage === 'string') {
      return LocaleUtils.parseAcceptLanguage(acceptLanguage);
    }

    return 'en-US';
  }

  /** Get user's preferred date format string (e.g. 'yyyy-MM-dd') from context, or null. */
  private getUserDateFormat(context?: VariableContext): string | null {
    const userCtx = context?.userContext as Record<string, unknown> | undefined;
    const prefs = userCtx?.['preferences'] as Record<string, unknown> | undefined;
    const fmt = (prefs?.['dateFormat'] ?? prefs?.['display.dateformat']) as string | undefined;
    return (fmt && fmt !== 'auto') ? fmt : null;
  }

  /** Get user's preferred time format ('12h' | '24h') from context, or null. */
  private getUserTimeFormat(context?: VariableContext): string | null {
    const userCtx = context?.userContext as Record<string, unknown> | undefined;
    const prefs = userCtx?.['preferences'] as Record<string, unknown> | undefined;
    const fmt = prefs?.['timeFormat'] as string | undefined;
    if (fmt === '12h' || fmt === '24h') return fmt;
    return null;
  }

  /** Get user's preferred timezone from context, or null. */
  private getUserTimezone(context?: VariableContext): string | null {
    const userCtx = context?.userContext as Record<string, unknown> | undefined;
    const prefs = userCtx?.['preferences'] as Record<string, unknown> | undefined;
    const tz = (prefs?.['timezone'] ?? userCtx?.['timezone']) as string | undefined;
    return (tz && LocaleUtils.isValidTimezone(tz)) ? tz : null;
  }

  /**
   * Get browser information from user agent string
   * @param {string} userAgent - User agent string
   * @returns {string} Browser name and version
   */
  private getBrowserInfo(userAgent: string): string {
    if (!userAgent) return 'Unknown';

    // Simple browser detection
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      const match = userAgent.match(/Chrome\/(\d+)/);
      return match ? `Chrome ${match[1]}` : 'Chrome';
    } else if (userAgent.includes('Firefox')) {
      const match = userAgent.match(/Firefox\/(\d+)/);
      return match ? `Firefox ${match[1]}` : 'Firefox';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      const match = userAgent.match(/Version\/(\d+)/);
      return match ? `Safari ${match[1]}` : 'Safari';
    } else if (userAgent.includes('Edg')) {
      const match = userAgent.match(/Edg\/(\d+)/);
      return match ? `Edge ${match[1]}` : 'Edge';
    } else if (userAgent.includes('OPR') || userAgent.includes('Opera')) {
      const match = userAgent.match(/(?:OPR|Opera)\/(\d+)/);
      return match ? `Opera ${match[1]}` : 'Opera';
    }

    // Fallback for unknown browsers
    return 'Unknown Browser';
  }

  /**
   * Registers a new variable handler.
   * @param {string} name The name of the variable (without brackets/dollar sign).
   * @param {VariableHandler} handler A function that takes the WikiContext and returns the variable's value.
   */
  registerVariable(name: string, handler: VariableHandler): void {
    if (this.variableHandlers.has(name)) {
      logger.warn(`[VAR] Overwriting existing variable handler for: ${name}`);
    }
    this.variableHandlers.set(name.toLowerCase(), handler);
  }

  /**
   * Expands all variables in a given string of content.
   * @param {string} content The content to process.
   * @param {VariableContext} context The WikiContext for the current rendering operation.
   * @returns {string} The content with variables expanded.
   */
  expandVariables(content: string, context?: VariableContext): string {
    if (!content || typeof content !== 'string') {
      return content;
    }
    // Regex to find variables like [{$varname}]

    return content.replace(/\[\{\$([^}]+)\}\]/g, (match, varName: string) => {
      const handler = this.variableHandlers.get(varName.toLowerCase().trim());
      if (handler) {
        try {
          const result = handler(context);
          // Handle async handlers (like totalpages)
          if ((result as unknown) instanceof Promise) {
            logger.warn(`[VAR] Variable '${varName}' returned a Promise - synchronous expansion failed`);
            return match;
          }
          return result;
        } catch (error) {
          logger.error(`[VAR] Error expanding variable '${varName}'`, { error });
          return `[Error: ${varName}]`;
        }
      }

      logger.debug(`[VAR] No handler found for variable: ${varName}`);
      return match; // Return original string if no handler is found
    });
  }

  /**
   * Get the value of a specific variable
   * @param {string} varName - The variable name (without brackets/dollar sign)
   * @param {VariableContext} context - Optional context for contextual variables
   * @returns {string} The variable value
   */
  getVariable(varName: string, context: VariableContext = {}): string {
    const handler = this.variableHandlers.get(varName.toLowerCase().trim());
    if (handler) {
      try {
        const result = handler(context);
        // Handle async handlers
        if ((result as unknown) instanceof Promise) {
          logger.warn(`[VAR] Variable '${varName}' returned a Promise - returning placeholder`);
          return '[Async]';
        }
        return result;
      } catch (error) {
        logger.error(`[VAR] Error getting variable '${varName}'`, { error });
        return `[Error: ${(error as Error).message}]`;
      }
    }
    return `[Unknown: ${varName}]`;
  }

  /**
   * Get debug information about registered variables
   * @returns {VariableDebugInfo} Debug information including system and contextual variables
   */
  getDebugInfo(): VariableDebugInfo {
    const variables = Array.from(this.variableHandlers.keys());

    // Categorize variables
    const systemVariables = variables.filter((v) => ['appname', 'applicationname', 'version', 'baseurl', 'uptime', 'totalpages'].includes(v));

    const contextualVariables = variables.filter((v) => ['pagename', 'username', 'loginstatus', 'userroles', 'displayname', 'useragent', 'browser', 'clientip', 'referer', 'sessionid', 'acceptlanguage', 'date', 'time', 'timestamp', 'year', 'month', 'day'].includes(v));

    return {
      totalVariables: variables.length,
      systemVariables,
      contextualVariables,
      allVariables: variables
    };
  }
}

export default VariableManager;

