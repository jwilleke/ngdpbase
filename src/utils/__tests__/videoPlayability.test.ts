/**
 * Tests for the video playability predicate (#1098).
 *
 * The behaviour worth pinning is the asymmetry: `true` is a confident claim
 * that no browser can play the file, while `false` means only "worth trying".
 * Anything that pushes an ambiguous case into `true` takes a working player
 * away from someone.
 */

import { describe, it, expect } from 'vitest';
import { isDefinitelyUnplayable } from '../videoPlayability.js';

describe('isDefinitelyUnplayable', () => {
  describe('containers no browser decodes', () => {
    it.each([
      ['MPEG-TS / AVCHD (.m2ts)', 'video/mp2t'],
      ['AVI', 'video/x-msvideo'],
      ['AVI, alternate type', 'video/avi'],
      ['Windows Media', 'video/x-ms-wmv'],
      ['ASF', 'video/x-ms-asf']
    ])('rules out %s', (_label, mime) => {
      expect(isDefinitelyUnplayable(mime)).toBe(true);
    });

    it('ignores MIME parameters and casing', () => {
      expect(isDefinitelyUnplayable('VIDEO/MP2T; charset=binary')).toBe(true);
    });
  });

  describe('containers browsers do play', () => {
    it.each([
      ['MP4', 'video/mp4'],
      ['M4V', 'video/x-m4v'],
      ['QuickTime', 'video/quicktime'],
      ['3GP', 'video/3gpp'],
      ['WebM', 'video/webm']
    ])('does not rule out %s', (_label, mime) => {
      expect(isDefinitelyUnplayable(mime)).toBe(false);
    });
  });

  describe('the ambiguous case is left to the browser', () => {
    // Chromium builds commonly play H.264-in-Matroska; Safari never does.
    // Answering `true` here would remove a working player from Chrome users,
    // so the decision is deferred to the runtime error handler instead.
    it('does not rule out Matroska', () => {
      expect(isDefinitelyUnplayable('video/x-matroska')).toBe(false);
    });
  });

  describe('codec overrides a playable container', () => {
    it('rules out ProRes in a QuickTime wrapper, by human-readable codec name', () => {
      expect(isDefinitelyUnplayable('video/quicktime', 'Apple ProRes 422')).toBe(true);
    });

    it('rules out ProRes by four-character CompressorID', () => {
      expect(isDefinitelyUnplayable('video/quicktime', 'apcn')).toBe(true);
    });

    it('does not rule out H.264 in the same wrapper', () => {
      expect(isDefinitelyUnplayable('video/quicktime', 'avc1')).toBe(false);
    });
  });

  describe('absent or irrelevant input', () => {
    it('treats a missing codec as no evidence, not as evidence of a problem', () => {
      expect(isDefinitelyUnplayable('video/mp4', undefined)).toBe(false);
      expect(isDefinitelyUnplayable('video/mp4', null)).toBe(false);
      expect(isDefinitelyUnplayable('video/mp4', '')).toBe(false);
    });

    it('still rules out an unplayable container when the codec is unknown', () => {
      expect(isDefinitelyUnplayable('video/mp2t', undefined)).toBe(true);
    });

    it.each([
      ['an image', 'image/jpeg'],
      ['a PDF', 'application/pdf'],
      ['the octet-stream fallback', 'application/octet-stream'],
      ['an empty string', ''],
      ['null', null],
      ['undefined', undefined]
    ])('answers false for %s — the question does not apply', (_label, mime) => {
      expect(isDefinitelyUnplayable(mime)).toBe(false);
    });
  });
});
