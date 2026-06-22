/**
 * Minimal, dependency-free CSV import/export for playlist items.
 *
 * Columns: videoId,title,displayTitle,url
 * The parser handles quoted fields, embedded commas, escaped quotes ("")
 * and both \n and \r\n line endings. Old 3-column exports
 * (videoId,title,url) are still accepted; displayTitle defaults to title.
 */

import { parseVideoId, makeRowId, watchUrl } from './youtube';

const HEADER = ['videoId', 'title', 'displayTitle', 'url'];

function escapeField(value) {
  const str = value == null ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Serialize playlist items to a CSV string. */
export function playlistToCsv(items) {
  const lines = [HEADER.join(',')];
  for (const item of items) {
    const title = item.title || watchUrl(item.videoId);
    const displayTitle = item.displayTitle || title;
    lines.push([
      escapeField(item.videoId),
      escapeField(title),
      escapeField(displayTitle),
      escapeField(item.url || watchUrl(item.videoId)),
    ].join(','));
  }
  return lines.join('\r\n');
}

/** Parse a CSV string into an array of cell-arrays (handles quotes). */
function parseRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Handle \r\n as a single break.
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  // Flush trailing field/row if present.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.length > 0 && r.some((c) => c.trim() !== ''));
}

/**
 * Parse CSV text into playlist items. Tolerant of:
 *  - an optional header row
 *  - a single column of URLs/ids
 *  - the legacy videoId,title,url layout
 *  - the current videoId,title,displayTitle,url layout produced by playlistToCsv
 */
export function csvToPlaylist(text) {
  const rows = parseRows(text);
  if (rows.length === 0) return [];

  const first = rows[0].map((c) => c.trim().toLowerCase());
  const hasHeader =
    first.includes('videoid') || first.includes('url') || first.includes('title');

  // Default positional layout for headerless input: videoId, title, url.
  let idx = { videoId: 0, title: 1, displayTitle: -1, url: 2 };
  let start = 0;
  if (hasHeader) {
    start = 1;
    idx = {
      videoId: first.indexOf('videoid'),
      title: first.indexOf('title'),
      displayTitle: first.indexOf('displaytitle'),
      url: first.indexOf('url'),
    };
  }

  const items = [];
  for (let i = start; i < rows.length; i += 1) {
    const cols = rows[i];

    // Try to resolve a video id from likely columns first, then from any
    // remaining cell as a fallback.
    const candidates = [
      idx.videoId >= 0 ? cols[idx.videoId] : undefined,
      idx.url >= 0 ? cols[idx.url] : undefined,
      idx.title >= 0 ? cols[idx.title] : undefined,
      ...cols,
    ].filter(Boolean);

    let videoId = null;
    for (const c of candidates) {
      videoId = parseVideoId(c);
      if (videoId) break;
    }
    if (!videoId) continue;

    const titleRaw = idx.title >= 0 ? (cols[idx.title] || '').trim() : '';
    const displayRaw =
      idx.displayTitle >= 0 ? (cols[idx.displayTitle] || '').trim() : '';
    const title = titleRaw || watchUrl(videoId);
    const displayTitle = displayRaw || title;

    items.push({
      id: makeRowId(),
      videoId,
      title,
      displayTitle,
      url: watchUrl(videoId),
    });
  }
  return items;
}

/** Trigger a browser download of CSV text. */
export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
