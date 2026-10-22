/**
 * The HTML → PDF engine (#1974): headless Chromium, driven by `playwright-core`,
 * both optional at run time.
 *
 * - `resolveChromium` finds a Chromium to run: the configured path, then the
 *   one Playwright installed (`npx playwright install chromium`), then the
 *   usual system locations. Nothing is downloaded at `npm install`.
 * - `renderPdfInChild` renders one document in a child process
 *   (`pdfRenderWorker.ts`), killed at the timeout, so the site never waits on
 *   Chromium or on PDF parsing.
 *
 * `ExportManager.htmlToPdf` is the door; nothing else calls these.
 */
import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

/** Page sizes Chromium knows by name. */
export const PDF_PAGE_SIZES = ['Letter', 'Legal', 'Tabloid', 'Ledger', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6'] as const;
export type PdfPageSize = (typeof PDF_PAGE_SIZES)[number];

/** A CSS length Chromium's PDF margins accept: a number and px, in, cm or mm. */
const MARGIN = /^\d+(\.\d+)?(px|in|cm|mm)$/;

export interface PdfMargin {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

/**
 * What a caller may set. An `@page` rule in the HTML (size, margin) wins over
 * these, as it does when a browser prints.
 */
export interface PdfOptions {
  /** Page size; default `ngdpbase.export.pdf.page-size`. */
  format?: PdfPageSize;
  /** Page margins, each a CSS length (`'20mm'`, `'0.5in'`); default none. */
  margin?: PdfMargin;
  /** Print background colours and images; default `true`. */
  printBackground?: boolean;
}

/** Options after validation and defaults. */
export interface ResolvedPdfOptions {
  format: PdfPageSize;
  margin: PdfMargin;
  printBackground: boolean;
}

/** One render, as the child receives it. */
export interface PdfJob {
  html: string;
  executablePath: string;
  options: ResolvedPdfOptions;
  timeoutMs: number;
}

/** What the child sends back. `launch` means Chromium could not start: the engine is unavailable. */
export type PdfJobResult =
  | { ok: true; pdf: Uint8Array }
  | { ok: false; stage: 'launch' | 'render'; error: string };

/**
 * No PDF engine: `playwright-core` is not installed, no Chromium was found, or
 * it could not start. An add-on catches it by `code` (it cannot import core
 * values) and falls back to HTML.
 */
export class PdfUnavailableError extends Error {
  readonly code = 'PDF_UNAVAILABLE';
  constructor(message: string) {
    super(message);
    this.name = 'PdfUnavailableError';
  }
}

/**
 * Validate a caller's options and fill the defaults. Throws on anything
 * Chromium would misread, so a typo is an error rather than a different page.
 *
 * @param options - The caller's options
 * @param defaultFormat - `ngdpbase.export.pdf.page-size`
 */
export function resolvePdfOptions(options: PdfOptions | undefined, defaultFormat: string): ResolvedPdfOptions {
  const opts = options ?? {};
  if (typeof opts !== 'object') throw new TypeError('htmlToPdf: options must be an object');
  const format = opts.format ?? defaultFormat;
  if (!(PDF_PAGE_SIZES as readonly string[]).includes(format)) {
    throw new TypeError(`htmlToPdf: format must be one of ${PDF_PAGE_SIZES.join(', ')} (got ${JSON.stringify(format)})`);
  }
  const margin: PdfMargin = {};
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const value = opts.margin?.[side];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !MARGIN.test(value)) {
      throw new TypeError(`htmlToPdf: margin.${side} must be a length such as '20mm' or '0.5in' (got ${JSON.stringify(value)})`);
    }
    margin[side] = value;
  }
  const printBackground = opts.printBackground ?? true;
  if (typeof printBackground !== 'boolean') throw new TypeError('htmlToPdf: printBackground must be a boolean');
  return { format: format as PdfPageSize, margin, printBackground };
}

/** Where Chromium or Chrome usually is, per platform. Checked after the configured path and Playwright's own. */
export const SYSTEM_CHROMIUM_PATHS: Record<string, string[]> = {
  linux: ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/lib/chromium/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/snap/bin/chromium'],
  darwin: ['/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  win32: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
};

export type ChromiumResolution =
  | { ok: true; executablePath: string; source: 'configured' | 'playwright' | 'system' }
  | { ok: false; reason: string };

/** Hooks for tests; a site passes nothing. */
export interface ResolveDeps {
  exists?: (p: string) => boolean;
  platform?: string;
  playwrightInstalled?: () => boolean;
  /** Playwright's own Chromium, or null when it cannot say. */
  playwrightChromium?: () => Promise<string | null>;
}

const requireHere = createRequire(import.meta.url);

/** Whether `playwright-core` is installed (it is an optional dependency). */
export function playwrightInstalled(): boolean {
  try {
    requireHere.resolve('playwright-core');
    return true;
  } catch {
    return false;
  }
}

async function playwrightChromiumPath(): Promise<string | null> {
  try {
    const { chromium } = await import('playwright-core');
    return chromium.executablePath() || null;
  } catch {
    return null;
  }
}

/**
 * Find a Chromium to render with. Read on every call, so installing Chromium
 * or setting the path takes effect without a restart.
 *
 * @param configuredPath - `ngdpbase.export.pdf.chromium-path` ('' = find one)
 */
export async function resolveChromium(configuredPath: string, deps: ResolveDeps = {}): Promise<ChromiumResolution> {
  const exists = deps.exists ?? existsSync;
  if (!(deps.playwrightInstalled ?? playwrightInstalled)()) {
    return { ok: false, reason: 'playwright-core is not installed (it is an optional dependency; npm install without --omit=optional)' };
  }
  if (configuredPath) {
    return exists(configuredPath)
      ? { ok: true, executablePath: configuredPath, source: 'configured' }
      : { ok: false, reason: `ngdpbase.export.pdf.chromium-path is set, but nothing is there: ${configuredPath}` };
  }
  const bundled = await (deps.playwrightChromium ?? playwrightChromiumPath)();
  if (bundled && exists(bundled)) return { ok: true, executablePath: bundled, source: 'playwright' };
  for (const candidate of SYSTEM_CHROMIUM_PATHS[deps.platform ?? process.platform] ?? []) {
    if (exists(candidate)) return { ok: true, executablePath: candidate, source: 'system' };
  }
  return { ok: false, reason: 'no Chromium found: install Chromium, or set ngdpbase.export.pdf.chromium-path' };
}

/**
 * The environment the child gets: enough to find a home, a temp folder and
 * fonts, and none of the site's secrets (the session secret, keys and
 * passwords the site holds in its environment).
 */
const CHILD_ENV_KEYS = [
  'PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'PLAYWRIGHT_BROWSERS_PATH',
  'FONTCONFIG_PATH', 'FONTCONFIG_FILE', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_RUNTIME_DIR',
  'SystemRoot', 'LOCALAPPDATA', 'USERPROFILE', 'APPDATA', 'ProgramFiles', 'ProgramFiles(x86)'
];

export function childEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const key of CHILD_ENV_KEYS) if (env[key] !== undefined) out[key] = env[key];
  return out;
}

/**
 * Render one job in a child process. Resolves with the child's answer; rejects
 * only when the child timed out, crashed or never answered.
 *
 * @param job - The render
 */
export function renderPdfInChild(job: PdfJob): Promise<PdfJobResult> {
  // Compiled, the worker is the .js beside this file. From source (vitest,
  // tsx) it is the .ts, which needs tsx's loader.
  const fromSource = import.meta.url.endsWith('.ts');
  const entry = new URL(fromSource ? './pdfRenderWorker.ts' : './pdfRenderWorker.js', import.meta.url);
  return new Promise((resolve, reject) => {
    const child = fork(entry, [], {
      execArgv: fromSource ? ['--import', 'tsx'] : [],
      env: childEnv(),
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    });
    let settled = false;
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => { if (stderr.length < 2000) stderr += chunk.toString(); });
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      settle(() => reject(new Error(`PDF render timed out after ${job.timeoutMs} ms`)));
      child.kill('SIGKILL');
    }, job.timeoutMs);
    child.once('message', (result: PdfJobResult) => {
      settle(() => resolve(result.ok ? { ok: true, pdf: Buffer.from(result.pdf) } : result));
    });
    child.once('error', (err) => settle(() => reject(err)));
    child.once('exit', (code, signal) => {
      settle(() => reject(new Error(`PDF render process exited (${signal ?? code}) without an answer${stderr ? `: ${stderr.trim().split('\n')[0]}` : ''}`)));
    });
    child.send(job);
  });
}
