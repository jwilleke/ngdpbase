/**
 * Which video files a browser can actually play (#1098).
 *
 * The media item page used to render a `<video>` element for anything whose
 * MIME type began with `video/`. Four of the eight indexed video extensions
 * cannot be decoded by any browser, so those items showed player controls that
 * did nothing — worse than the generic-file fallback, because a dead control
 * looks broken where a Download button looks like something to open elsewhere.
 *
 * ## Why this answers "definitely not" rather than "yes or no"
 *
 * Browser support is not a fact this process can know. It varies by browser,
 * by build (Chromium ships different codecs depending on who compiled it), and
 * by platform. A server-side allowlist that says *yes* would be guessing on
 * behalf of a client it cannot see, and guessing wrong in the optimistic
 * direction is how a working player gets replaced by a Download button.
 *
 * So this function answers only the question it can answer honestly: **is this
 * container one that no browser plays natively?** Everything else — including
 * the genuinely ambiguous cases — is left to the browser itself, which finds
 * out by trying and reports failure through the `<source>` element's `error`
 * event. The template uses that to fall back at runtime.
 *
 * Matroska is the case that makes this the right shape. Chromium builds often
 * play an `.mkv` holding H.264/AAC; Safari never does. Calling it unplayable
 * server-side would take a working player away from Chrome users, and calling
 * it playable would leave the dead control for everyone else. Asking the
 * browser is the only answer that is right in both.
 *
 * ## What is not consulted, and why
 *
 * `audioCodec` is deliberately **not** a veto. AVCHD carries AC-3, which
 * browsers do not decode — but a browser that cannot decode the audio track of
 * an otherwise-supported file plays the video silently rather than failing. An
 * unplayable audio codec is a degraded experience, not an unplayable file, and
 * every file where it *would* matter here is already ruled out by its
 * container.
 */

/**
 * Containers no browser decodes natively.
 *
 * Playing any of these in a page requires demuxing in JavaScript first
 * (`hls.js` and friends), which is not what a plain `<video>` element does.
 */
const UNPLAYABLE_CONTAINERS: ReadonlySet<string> = new Set([
  // MPEG-2 Transport Stream — .m2ts / .ts / AVCHD (#1097). Broadcast format:
  // 188-byte packets designed to survive being cut into mid-stream. The video
  // inside is ordinary H.264, which is why ffmpeg extracts a poster frame
  // without complaint — it is the wrapper that browsers will not open.
  'video/mp2t',
  // AVI (RIFF)
  'video/x-msvideo',
  'video/avi',
  // Windows Media (ASF)
  'video/x-ms-wmv',
  'video/x-ms-asf'
]);

/**
 * Video codecs no browser decodes, whatever they are wrapped in.
 *
 * ProRes is the case that matters: a `.mov` is an ISOBMFF file, so the
 * container test passes, but an intermediate codec inside it will not play.
 * Matched loosely because ExifTool reports it either as a human-readable
 * `VideoCodec` ("Apple ProRes 422") or as a four-character `CompressorID`.
 */
const UNPLAYABLE_VIDEO_CODECS: readonly string[] = [
  'prores',
  'apch', 'apcn', 'apcs', 'apco', 'ap4h', 'ap4x', // ProRes CompressorIDs
  'dnxhd', 'dnxhr',
  'mjpeg',
  'cinepak',
  'wmv1', 'wmv2', 'wmv3', 'wvc1'
];

/**
 * True when this file cannot play in any browser, so the page should offer its
 * poster frame and a download instead of a player.
 *
 * False means "worth trying" — NOT "will play". The template still handles a
 * runtime decode failure, because this deliberately does not guess about
 * ambiguous containers. See the module comment.
 *
 * @param mimeType - The item's MIME type. Non-video types answer `false`; they
 *   never reach the player branch, and claiming otherwise would make this
 *   function's answer meaningless for them.
 * @param videoCodec - `metadata.videoCodec`, when the index has it. Absent on
 *   entries that predate the field, which is why its absence is never itself
 *   evidence of anything.
 */
export function isDefinitelyUnplayable(
  mimeType: string | null | undefined,
  videoCodec?: string | null
): boolean {
  if (typeof mimeType !== 'string') return false;

  // Normalise BEFORE the video/ test. MIME types are case-insensitive per
  // RFC 2045, and may carry parameters (`; charset=…`), so testing the raw
  // string would answer "not a video" for a perfectly ordinary header.
  const normalised = mimeType.split(';')[0].trim().toLowerCase();
  if (!normalised.startsWith('video/')) return false;
  if (UNPLAYABLE_CONTAINERS.has(normalised)) return true;

  if (typeof videoCodec === 'string' && videoCodec.trim()) {
    const codec = videoCodec.toLowerCase();
    if (UNPLAYABLE_VIDEO_CODECS.some(bad => codec.includes(bad))) return true;
  }

  return false;
}
