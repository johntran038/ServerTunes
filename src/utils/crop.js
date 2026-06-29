/**
 * Helpers for the per-track "crop" string (e.g. "55-241"), which restricts
 * playback to a slice of the source video.
 *
 * The format is two numbers separated by a hyphen. Whitespace around either
 * side of the hyphen is allowed. An empty / blank string means "no crop,
 * play the whole video".
 *
 * Correction rules (applied here so the *behavior* matches the spec even
 * before the user has blurred the input):
 *   - start < 0 is clamped to 0
 *   - start >= end is treated as "no crop" (we don't flip the values)
 *   - end > video length is left for the YouTube player to clamp at
 *     playback time (it stops at the natural end if endSeconds exceeds
 *     the duration), since we don't know the duration at edit time.
 */

const CROP_RE = /^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/;

/**
 * Parse a crop string into { start, end } in seconds, with start clamped
 * to >= 0 and start >= end treated as "no crop". Returns null whenever
 * the caller should fall back to playing the whole video (blank input,
 * gibberish, or a start/end that doesn't form a usable range).
 */
export function parseCrop(text) {
  if (text == null) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;

  const match = trimmed.match(CROP_RE);
  if (!match) return null;

  let start = Number(match[1]);
  let end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  if (start < 0) start = 0;
  // Equal would play a zero-length slice; >= is the safe "ignore" threshold.
  if (start >= end) return null;

  return { start, end };
}

/**
 * Normalize crop text for display, used on blur. Mirrors parseCrop: any
 * input that doesn't yield a usable crop (blank, gibberish, start >= end)
 * is wiped to '', matching playback's "ignore it" behavior. Valid ranges
 * tidy to "start-end" with start clamped to >= 0.
 *
 * Examples:
 *   "" or "   "  -> ""
 *   "55-241"     -> "55-241"
 *   "  -5 - 200" -> "0-200"
 *   "300 - 100"  -> ""     (unusable; playback ignored it, so we clear it)
 *   "abc"        -> ""     (unusable; same)
 */
export function normalizeCropText(text) {
  const parsed = parseCrop(text);
  if (!parsed) return '';
  return `${parsed.start}-${parsed.end}`;
}
