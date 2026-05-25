/**
 * Tests for extractVideoFrame (#722 Slice 1).
 *
 * Generates a tiny synthetic test-pattern video at test-setup time using the
 * same ffmpeg-static binary the helper itself uses (no system ffmpeg needed,
 * no committed binary fixtures, no flakey download dependency).
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { extractVideoFrame } from '../videoFrame';

let tempDir: string;
let testVideoPath: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'videoframe-test-'));
  testVideoPath = path.join(tempDir, 'test-pattern.mp4');
  // 2-second 320x240 lavfi testsrc encoded with mpeg4 (works in every
  // ffmpeg build; libx264 isn't always shipped). ~10–30 KB depending on
  // ffmpeg version. Generated fresh per test run.
  await new Promise<void>((resolve, reject) => {
    const binary: string | null = ffmpegPath as unknown as string | null;
    if (!binary) {
      reject(new Error('ffmpeg-static binary path unavailable'));
      return;
    }
    const proc = spawn(binary, [
      '-f', 'lavfi',
      '-i', 'testsrc=duration=2:size=320x240:rate=10',
      '-c:v', 'mpeg4',
      '-loglevel', 'error',
      '-y',
      testVideoPath
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    const errChunks: Buffer[] = [];
    proc.stderr.on('data', (c: Buffer) => errChunks.push(c));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`fixture generation exited ${code}: ${Buffer.concat(errChunks).toString()}`));
    });
  });
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('extractVideoFrame (#722 Slice 1)', () => {
  test('extracts a JPEG buffer from a valid mp4 at default 1s timestamp', async () => {
    const buf = await extractVideoFrame(testVideoPath);
    expect(buf).not.toBeNull();
    expect(buf!.length).toBeGreaterThan(500);
    // JPEG SOI magic bytes: FF D8 FF
    expect(buf![0]).toBe(0xff);
    expect(buf![1]).toBe(0xd8);
    expect(buf![2]).toBe(0xff);
  });

  test('extracts at an explicit non-default timestamp', async () => {
    const buf = await extractVideoFrame(testVideoPath, 0.5);
    expect(buf).not.toBeNull();
    expect(buf![0]).toBe(0xff);
    expect(buf![1]).toBe(0xd8);
  });

  test('returns null for a non-existent file (extraction failure)', async () => {
    const buf = await extractVideoFrame(path.join(tempDir, 'does-not-exist.mp4'), 1);
    expect(buf).toBeNull();
  });

  test('returns null for a non-video file (extraction failure)', async () => {
    const notAVideo = path.join(tempDir, 'not-a-video.txt');
    await fs.writeFile(notAVideo, 'this is not a video');
    const buf = await extractVideoFrame(notAVideo, 1);
    expect(buf).toBeNull();
  });

  test('returns null for a seek past end-of-video', async () => {
    // Test video is 2 seconds; ask for frame at 99s — ffmpeg returns no output
    const buf = await extractVideoFrame(testVideoPath, 99);
    expect(buf).toBeNull();
  });
});
