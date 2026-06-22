/**
 * Helpers for extracting YouTube video IDs from the many URL shapes YouTube
 * uses, plus a small id generator for playlist items.
 */

const ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extract an 11-char YouTube video id from a URL or raw id.
 * Returns null if nothing usable is found.
 */
export function parseVideoId(input) {
  if (!input) return null;
  const value = String(input).trim();

  // Already a bare id.
  if (ID_RE.test(value)) return value;

  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  // youtu.be/<id>
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return ID_RE.test(id) ? id : null;
  }

  if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    // watch?v=<id>
    const v = url.searchParams.get('v');
    if (v && ID_RE.test(v)) return v;

    // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
    const parts = url.pathname.split('/').filter(Boolean);
    const known = ['embed', 'shorts', 'live', 'v'];
    if (parts.length >= 2 && known.includes(parts[0]) && ID_RE.test(parts[1])) {
      return parts[1];
    }
  }

  return null;
}

export function isValidVideoId(id) {
  return ID_RE.test(String(id || ''));
}

export function watchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Small unique id for playlist rows (not the YouTube id). */
export function makeRowId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fetch a video's title via YouTube's oEmbed endpoint.
 * No API key needed; returns null if the request fails or the video can't
 * be embedded (private/removed/etc).
 */
export async function fetchYouTubeTitle(videoId) {
  if (!isValidVideoId(videoId)) return null;
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    watchUrl(videoId),
  )}&format=json`;
  try {
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.title === 'string' ? data.title : null;
  } catch {
    return null;
  }
}
