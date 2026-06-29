import { createSlice } from '@reduxjs/toolkit';
import { makeRowId, parseVideoId, watchUrl } from '../../utils/youtube';

const STORAGE_KEY = 'serverTunes.playlist';
export const DEFAULT_DISPLAY_TITLE = 'Funky Tune';

function normalize(it) {
  const title = it.title || watchUrl(it.videoId);
  return {
    id: it.id || makeRowId(),
    videoId: it.videoId,
    title,
    displayTitle: it.displayTitle || DEFAULT_DISPLAY_TITLE,
    url: it.url || watchUrl(it.videoId),
    crop: typeof it.crop === 'string' ? it.crop : '',
  };
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensively normalize each row.
    return parsed.filter((it) => it && it.videoId).map(normalize);
  } catch {
    return [];
  }
}

const initialState = {
  items: loadFromStorage(),
  currentIndex: -1,
};

const playlistSlice = createSlice({
  name: 'playlist',
  initialState,
  reducers: {
    addTrack: {
      reducer(state, action) {
        // Avoid exact duplicates (same videoId back to back is fine, but
        // skip if the id already exists).
        if (state.items.some((it) => it.videoId === action.payload.videoId)) {
          return;
        }
        state.items.push(action.payload);
        if (state.currentIndex === -1) state.currentIndex = 0;
      },
      prepare({ videoId, title, displayTitle, crop }) {
        const resolvedTitle = title || watchUrl(videoId);
        return {
          payload: {
            id: makeRowId(),
            videoId,
            title: resolvedTitle,
            displayTitle: displayTitle || DEFAULT_DISPLAY_TITLE,
            url: watchUrl(videoId),
            crop: typeof crop === 'string' ? crop : '',
          },
        };
      },
    },
    removeTrack(state, action) {
      const idx = state.items.findIndex((it) => it.id === action.payload);
      if (idx === -1) return;
      state.items.splice(idx, 1);
      if (state.currentIndex >= state.items.length) {
        state.currentIndex = state.items.length - 1;
      } else if (idx < state.currentIndex) {
        state.currentIndex -= 1;
      }
    },
    moveTrack(state, action) {
      const { from, to } = action.payload;
      if (from < 0 || to < 0 || from >= state.items.length || to >= state.items.length) return;
      const [moved] = state.items.splice(from, 1);
      state.items.splice(to, 0, moved);
      // Keep the pointer on the same logical row.
      if (state.currentIndex === from) state.currentIndex = to;
      else if (from < state.currentIndex && to >= state.currentIndex) state.currentIndex -= 1;
      else if (from > state.currentIndex && to <= state.currentIndex) state.currentIndex += 1;
    },
    setCurrentIndex(state, action) {
      if (action.payload >= -1 && action.payload < state.items.length) {
        state.currentIndex = action.payload;
      }
    },
    setTrackTitle(state, action) {
      const { id, title } = action.payload;
      const item = state.items.find((it) => it.id === id);
      if (item) item.title = title;
    },
    /**
     * Update one or more of `title` / `displayTitle` / `url` / `crop` for a
     * row. Pass any field as a string to overwrite it; omitted fields are
     * left as-is. When `url` is updated and parses to a valid YouTube id,
     * the row's `videoId` is refreshed too.
     */
    updateTrack(state, action) {
      const { id, title, displayTitle, url, crop } = action.payload;
      const item = state.items.find((it) => it.id === id);
      if (!item) return;
      if (typeof title === 'string') item.title = title;
      if (typeof displayTitle === 'string') item.displayTitle = displayTitle;
      if (typeof crop === 'string') item.crop = crop;
      if (typeof url === 'string') {
        item.url = url;
        const parsed = parseVideoId(url);
        if (parsed) item.videoId = parsed;
      }
    },
    appendPlaylist(state, action) {
      const existing = new Set(state.items.map((it) => it.videoId));
      for (const raw of action.payload) {
        if (!existing.has(raw.videoId)) {
          state.items.push(normalize(raw));
          existing.add(raw.videoId);
        }
      }
      if (state.currentIndex === -1 && state.items.length > 0) state.currentIndex = 0;
    },
    clearPlaylist(state) {
      state.items = [];
      state.currentIndex = -1;
    },
  },
});

export const {
  addTrack,
  removeTrack,
  moveTrack,
  setCurrentIndex,
  setTrackTitle,
  updateTrack,
  replacePlaylist,
  appendPlaylist,
  clearPlaylist,
} = playlistSlice.actions;

/** Persist playlist items to localStorage. Call from a store subscription. */
export function persistPlaylist(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage may be full or unavailable; ignore.
  }
}

export default playlistSlice.reducer;
