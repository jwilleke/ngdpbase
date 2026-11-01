/**
 * #2216 — whether this machine has the tools some tests need, so a test can
 * skip with the reason instead of failing where a tool is missing (the
 * pre-push hook on a machine without Chromium, say).
 *
 * Under CI every check answers yes without looking: CI has every tool, and a
 * test that silently skipped there would hide a real failure.
 *
 * Each answer is worked out once per test file and cached.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import ffmpegPath from 'ffmpeg-static';
import { resolveChromium } from '../export/pdfEngine.js';

/** Yes, or no and why: the reason goes in the skip note. */
export type ToolCheck = { ok: true } | { ok: false; reason: string };

const OK: ToolCheck = { ok: true };
const inCi = (): boolean => Boolean(process.env.CI);

let ffmpeg: ToolCheck | undefined;
/** The ffmpeg-static binary is there (npm can be set not to run its download script). */
export function hasFfmpeg(): ToolCheck {
  if (inCi()) return OK;
  if (!ffmpeg) {
    const binary = ffmpegPath as unknown as string | null;
    ffmpeg = binary && fs.existsSync(binary)
      ? OK
      : { ok: false, reason: 'no ffmpeg-static binary (its install script did not run; `npm rebuild ffmpeg-static`)' };
  }
  return ffmpeg;
}

let chromium: Promise<ToolCheck> | undefined;
/** A Chromium is found and starts: one can be on disk and still fail to launch (missing system libraries). */
export function hasChromium(): Promise<ToolCheck> {
  if (inCi()) return Promise.resolve(OK);
  chromium ??= (async (): Promise<ToolCheck> => {
    const found = await resolveChromium(process.env.NGDPBASE_TEST_CHROMIUM ?? '');
    if (!found.ok) return { ok: false, reason: found.reason };
    try {
      const { chromium: browserType } = await import('playwright-core');
      const browser = await browserType.launch({ executablePath: found.executablePath, timeout: 30_000 });
      await browser.close();
      return OK;
    } catch (err) {
      const first = String((err as Error).message).split('\n')[0];
      return { ok: false, reason: `Chromium at ${found.executablePath} does not start: ${first}` };
    }
  })();
  return chromium;
}

let npmPack: ToolCheck | undefined;
/**
 * `npm pack --json` prints an array, as the npm the generated publish.yml runs
 * on (Node 24's npm 11) does. npm 12 prints an object keyed by package name,
 * which that workflow does not read.
 */
export function npmPackGivesArray(): ToolCheck {
  if (inCi()) return OK;
  if (!npmPack) {
    const version = spawnSync('npm', ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? '';
    const major = Number(version.split('.')[0]);
    npmPack = major > 0 && major < 12
      ? OK
      : { ok: false, reason: `npm ${version || '(not found)'} here; the publish workflow's pack steps read npm 11's \`npm pack --json\` array` };
  }
  return npmPack;
}

/**
 * The skip note, printed once per file when a check says no. Straight to
 * stderr: vitest.setup.ts silences console.warn.
 */
export function noteSkip(file: string, check: ToolCheck): void {
  if (!check.ok) process.stderr.write(`[${file}] skipped: ${check.reason}\n`);
}
