/**
 * Single-frame extraction from a video file via ffmpeg-static (#722 Slice 1).
 *
 * Used by FileSystemMediaProvider.getThumbnailBuffer to populate poster-frame
 * thumbnails for video items, plugging the resulting JPEG buffer into the
 * existing Sharp pipeline (same downstream code path as image thumbnails).
 *
 * ffmpeg-static ships a statically-linked ffmpeg binary in the package — no
 * system ffmpeg dependency. The package exports the absolute binary path.
 */

import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import logger from './logger.js';

/**
 * Extract a single video frame at the given timestamp as an MJPEG buffer.
 * Returns null on any error so the caller can fall back to the icon
 * placeholder without crashing the request.
 *
 * @param filePath  Absolute path to the source video file
 * @param atSeconds Seek timestamp; defaults to 1 (the conventional poster
 *                  position — early enough to be quick, late enough to
 *                  usually skip the black opening frame)
 */
export async function extractVideoFrame(
  filePath: string,
  atSeconds = 1
): Promise<Buffer | null> {
  // Default export is `string | null`. Hoist to a local const so the narrowing
  // survives into the Promise closure below.
  const binary: string | null = ffmpegPath as unknown as string | null;
  if (!binary) {
    logger.warn('[extractVideoFrame] ffmpeg-static binary path unavailable');
    return null;
  }
  return new Promise((resolve) => {
    // -ss BEFORE -i = fast seek (keyframe-snapping). Acceptable for poster
    // frames since we don't need exact frame accuracy. -frames:v 1 stops after
    // one frame; -f image2 + -vcodec mjpeg emits a single JPEG to stdout.
    // -loglevel error silences ffmpeg's banner + progress lines.
    const args = [
      '-ss', String(atSeconds),
      '-i', filePath,
      '-frames:v', '1',
      '-f', 'image2',
      '-vcodec', 'mjpeg',
      '-loglevel', 'error',
      'pipe:1'
    ];
    const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    proc.stdout.on('data', (c: Buffer) => stdout.push(c));
    proc.stderr.on('data', (c: Buffer) => stderr.push(c));
    proc.on('error', (err) => {
      logger.warn(`[extractVideoFrame] ffmpeg spawn error: ${err.message}`);
      resolve(null);
    });
    proc.on('close', (code) => {
      if (code !== 0 || stdout.length === 0) {
        const errText = Buffer.concat(stderr).toString().trim();
        logger.warn(
          `[extractVideoFrame] ffmpeg exit ${code} for ${filePath}${errText ? `: ${errText.slice(0, 200)}` : ''}`
        );
        resolve(null);
        return;
      }
      resolve(Buffer.concat(stdout));
    });
  });
}
