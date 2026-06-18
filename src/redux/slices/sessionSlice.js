import { createSlice } from '@reduxjs/toolkit';

/**
 * Tracks the user's role (host/guest), connection details, and live
 * connection status. Playback state itself lives in the components/hook;
 * this slice is about "who am I and am I connected".
 */
const initialState = {
  role: null, // 'host' | 'guest' | null
  host: '', // ip/hostname a guest connects to
  port: 8080,
  room: 'main',
  password: '',
  displayName: '',
  status: 'idle', // 'idle' | 'connecting' | 'connected' | 'error' | 'closed'
  error: '',
  guestCount: 0,
};

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    startHosting(state, action) {
      const { port, room, password, displayName } = action.payload;
      state.role = 'host';
      state.host = 'localhost';
      state.port = port || 8080;
      state.room = room || 'main';
      state.password = password || '';
      state.displayName = displayName || 'Host';
      state.status = 'connecting';
      state.error = '';
    },
    startJoining(state, action) {
      const { host, port, room, password, displayName } = action.payload;
      state.role = 'guest';
      state.host = host || '';
      state.port = port || 8080;
      state.room = room || 'main';
      state.password = password || '';
      state.displayName = displayName || 'Guest';
      state.status = 'connecting';
      state.error = '';
    },
    setStatus(state, action) {
      state.status = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
      state.status = 'error';
    },
    setGuestCount(state, action) {
      state.guestCount = action.payload;
    },
    leaveSession() {
      return { ...initialState };
    },
  },
});

export const {
  startHosting,
  startJoining,
  setStatus,
  setError,
  setGuestCount,
  leaveSession,
} = sessionSlice.actions;

export default sessionSlice.reducer;
