// src/pages/Host.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import YouTubePlayer from '../components/YouTubePlayer';
import SessionHeader from '../components/SessionHeader';
import HostSetupForm from '../components/host/HostSetupForm';
import HostControls from '../components/host/HostControls';
import PlaylistToolbar from '../components/host/PlaylistToolbar';
import PlaylistTable from '../components/host/PlaylistTable';
import useConnection from '../hooks/useConnection';
import {
  addTrack, removeTrack, moveTrack, setCurrentIndex,
  updateTrack, appendPlaylist, clearPlaylist,
} from '../redux/slices/playlistSlice';
import { startHosting, leaveSession } from '../redux/slices/sessionSlice';
import { parseVideoId, watchUrl, fetchYouTubeTitle } from '../utils/youtube';
import { playlistToCsv, csvToPlaylist, downloadCsv } from '../utils/csv';

// YouTube player states
const PLAYING = 1;
// PAUSED is intentionally not used directly here, but kept in mind: ytState
// is compared against PLAYING and everything else is treated as "not playing".

// Debounce window for slider-driven volume broadcasts. Long enough to coalesce
// the firehose of input events you get while dragging, short enough that the
// listener side feels live.
const VOLUME_BROADCAST_DEBOUNCE = 80;

const Host = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const session = useSelector((s) => s.session);
  const { items, currentIndex } = useSelector((s) => s.playlist);

  const isHosting = session.role === 'host';

  // --- setup form state ---
  const [room, setRoom] = useState('main');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('Host');
  // Surfaced on the setup form when a previous "Start hosting" attempt was
  // bounced back (e.g. the room name was already in use). Local state so it
  // survives across the role flip back to null.
  const [setupError, setSetupError] = useState('');

  // --- playback state ---
  // nowPlaying carries both the canonical title and the friendlier
  // displayTitle so we can broadcast both to guests.
  const [nowPlaying, setNowPlaying] = useState(null); // { videoId, title, displayTitle }
  const [urlInput, setUrlInput] = useState('');
  const [addError, setAddError] = useState('');
  const [playbackNote, setPlaybackNote] = useState('');

  // End-of-song behavior toggles.
  //   loopCurrent: re-play the current track when it ends.
  //   stopAtEnd:   stop instead of advancing to the next track.
  // If both are on, loopCurrent wins (handleNext checks it first).
  const [loopCurrent, setLoopCurrent] = useState(false);
  const [stopAtEnd, setStopAtEnd] = useState(false);

  // Volume the host wants guests to hear at (0-100). This is intentionally
  // separate from the host's own iframe volume, which we leave alone, so the
  // host can adjust what listeners hear without changing what they hear.
  const [guestVolume, setGuestVolume] = useState(100);
  const guestVolumeRef = useRef(100);
  useEffect(() => { guestVolumeRef.current = guestVolume; }, [guestVolume]);

  const playerRef = useRef(null);
  const nowPlayingRef = useRef(nowPlaying);
  useEffect(() => { nowPlayingRef.current = nowPlaying; }, [nowPlaying]);

  // Tab-visibility plumbing.
  // wantsPlayingRef captures what the HOST last intended (play/pause from a
  // user action), as opposed to what the iframe currently reports - browsers
  // auto-pause backgrounded iframes and we don't want that pause to silence
  // every guest in the room.
  // lastVisibleRef snapshots the last (position, timestamp) we observed
  // while the tab was visible, so heartbeats sent while hidden can project
  // the position forward instead of broadcasting a frozen one.
  const wantsPlayingRef = useRef(false);
  const lastVisibleRef = useRef({ position: 0, timestamp: Date.now() });

  const { status, error, errorKind, guestCount, send } = useConnection({
    role: isHosting ? 'host' : null,
    room: session.room,
    password: session.password,
    enabled: isHosting,
  });

  // The hook detected someone else already hosting this room name. Bounce
  // the user back to the setup form with the explanation - more helpful
  // than leaving them on a half-rendered hosting screen with a banner.
  useEffect(() => {
    if (!isHosting) return;
    if (errorKind === 'room-taken') {
      setSetupError(error || 'That room name is already taken. Pick a different one.');
      dispatch(leaveSession());
    }
  }, [isHosting, errorKind, error, dispatch]);

  // Broadcast current playback state to all guests.
  const broadcast = useCallback((override = {}) => {
    const player = playerRef.current;
    const np = nowPlayingRef.current;
    if (!np) return;
    const ytState = player ? player.getState() : -1;

    let isPlaying;
    let position;
    if (typeof document !== 'undefined' && document.hidden) {
      // Tab is in the background. The iframe may be auto-paused or its
      // currentTime may be frozen, so don't trust either. Stick with our
      // last known intent and project the playback head forward by the
      // wall-clock time elapsed since we last saw a fresh value.
      isPlaying = wantsPlayingRef.current;
      const since = (Date.now() - lastVisibleRef.current.timestamp) / 1000;
      position = lastVisibleRef.current.position + (isPlaying ? since : 0);
    } else {
      isPlaying = ytState === PLAYING;
      position = player ? player.getTime() : 0;
      wantsPlayingRef.current = isPlaying;
      lastVisibleRef.current = { position, timestamp: Date.now() };
    }

    const payload = {
      videoId: np.videoId,
      title: np.title,
      displayTitle: np.displayTitle,
      isPlaying,
      position,
      timestamp: Date.now(),
      // Always include the host-set guest volume so retained state carries
      // it for late joiners. Read from the ref so this callback doesn't have
      // to be re-bound (and the heartbeat re-started) on every slider tick.
      guestVolume: guestVolumeRef.current,
      ...override,
    };

    // If the caller explicitly overrode play state or position (e.g.
    // playVideo, handlePlayerError), make those values the new baseline
    // we project from.
    if (override.isPlaying !== undefined) {
      wantsPlayingRef.current = override.isPlaying;
    }
    if (override.position !== undefined) {
      lastVisibleRef.current = {
        position: override.position,
        timestamp: payload.timestamp,
      };
    }

    send({ type: 'state', payload });
  }, [send]);

  // Heartbeat so late joiners and drifting guests stay in sync.
  useEffect(() => {
    if (status !== 'connected') return undefined;
    const id = setInterval(() => broadcast(), 3000);
    return () => clearInterval(id);
  }, [status, broadcast]);

  // Push slider changes to guests sooner than the 3s heartbeat. Debounce so
  // a rapid drag doesn't fire one broker publish per input event.
  useEffect(() => {
    if (!nowPlayingRef.current) return undefined;
    const id = setTimeout(() => broadcast(), VOLUME_BROADCAST_DEBOUNCE);
    return () => clearTimeout(id);
  }, [guestVolume, broadcast]);

  // When the host returns to this tab from another, the iframe may have
  // been auto-paused while away. If the host was supposed to be playing,
  // jump forward to where guests have been listening (their local clocks
  // kept moving) and resume so nobody had to wait for the host.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) return;
      const player = playerRef.current;
      if (!player || !nowPlayingRef.current) return;
      if (wantsPlayingRef.current) {
        const projected = lastVisibleRef.current.position +
          (Date.now() - lastVisibleRef.current.timestamp) / 1000;
        try { player.seek(projected, true); } catch { /* ignore */ }
        if (player.getState() !== PLAYING) {
          try { player.play(); } catch { /* ignore */ }
        }
      }
      // Refresh everyone now that we're visible and authoritative again.
      broadcast();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [broadcast]);

  // Keep nowPlaying in sync with the current playlist row when the host
  // edits its title / displayTitle inline. The next heartbeat will then
  // broadcast the new values to guests.
  useEffect(() => {
    setNowPlaying((prev) => {
      if (!prev) return prev;
      const match = items.find((it) => it.videoId === prev.videoId);
      if (!match) return prev;
      if (match.title === prev.title && match.displayTitle === prev.displayTitle) {
        return prev;
      }
      return { ...prev, title: match.title, displayTitle: match.displayTitle };
    });
  }, [items]);

  const playVideo = useCallback((track) => {
    setPlaybackNote('');
    const title = track.title || watchUrl(track.videoId);
    const np = {
      videoId: track.videoId,
      title,
      displayTitle: track.displayTitle || title,
    };
    setNowPlaying(np);
    nowPlayingRef.current = np;
    if (playerRef.current) playerRef.current.load(np.videoId, 0, true);
    // Push the new video id to guests right away.
    broadcast({
      videoId: np.videoId,
      title: np.title,
      displayTitle: np.displayTitle,
      isPlaying: true,
      position: 0,
      timestamp: Date.now(),
    });
  }, [broadcast]);

  const handleStartHosting = (e) => {
    e.preventDefault();
    setSetupError('');
    dispatch(startHosting({ room, password, displayName }));
  };

  const resolveInput = () => {
    const id = parseVideoId(urlInput);
    if (!id) {
      setAddError('Could not find a YouTube video in that link.');
      return null;
    }
    setAddError('');
    return id;
  };

  const handlePlayNow = async () => {
    const id = resolveInput();
    if (!id) return;
    // Start with a placeholder so playback begins immediately. displayTitle
    // is the literal default; title is the URL until oEmbed fills it in.
    const url = watchUrl(id);
    playVideo({ videoId: id, title: url, displayTitle: 'Funky Tune' });
    setUrlInput('');

    const fetched = await fetchYouTubeTitle(id);
    if (!fetched) return;
    // Only patch if the user is still on this track (they might have hit
    // Play on something else before oEmbed resolved).
    setNowPlaying((prev) => {
      if (!prev || prev.videoId !== id) return prev;
      return { ...prev, title: fetched };
    });
    // Push the updated title to guests so their "Now playing" updates too.
    if (nowPlayingRef.current && nowPlayingRef.current.videoId === id) {
      broadcast({ title: fetched });
    }
  };

  const handleAddToPlaylist = async () => {
    const id = resolveInput();
    if (!id) return;
    // Add now with a placeholder title so the row appears instantly.
    const action = dispatch(addTrack({ videoId: id }));
    setUrlInput('');
    // Fill in the real title in the background; ignore failures (the user
    // can still rename the row inline).
    const title = await fetchYouTubeTitle(id);
    if (title) dispatch(updateTrack({ id: action.payload.id, title }));
  };

  const handlePlayFromList = (index) => {
    const item = items[index];
    if (!item) return;
    // Re-parse the (possibly edited) link so we always play whatever URL
    // is currently in the row, not a stale cached videoId.
    const videoId = parseVideoId(item.url);
    if (!videoId) {
      setPlaybackNote('That link couldn\u2019t be parsed as a YouTube video.');
      return;
    }
    dispatch(setCurrentIndex(index));
    playVideo({
      videoId,
      title: item.title,
      displayTitle: item.displayTitle,
    });
  };

  // Called on natural end-of-video (YT.PlayerState.ENDED). Honors the
  // loop / stop-at-end toggles before falling back to advancing the queue.
  // Loop wins when both toggles are on.
  const handleNext = useCallback(() => {
    if (items.length === 0) return;

    if (loopCurrent) {
      const np = nowPlayingRef.current;
      if (np && playerRef.current) {
        playerRef.current.load(np.videoId, 0, true);
        broadcast({
          videoId: np.videoId,
          title: np.title,
          displayTitle: np.displayTitle,
          isPlaying: true,
          position: 0,
          timestamp: Date.now(),
        });
      }
      return;
    }

    if (stopAtEnd) {
      // Treat this song as the end of the playlist for the moment. The
      // current video stays loaded so "Now playing" still reads correctly;
      // guests are pushed into a paused state via the broadcast.
      broadcast({ isPlaying: false });
      return;
    }

    const next = currentIndex + 1;
    if (next < items.length) handlePlayFromList(next);
  }, [items, currentIndex, loopCurrent, stopAtEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Called when the YouTube player can't play the current video.
  const handlePlayerError = useCallback((code) => {
    const messages = {
      2: 'YouTube rejected that video ID.',
      5: 'This video can\'t be played in an embedded player.',
      100: 'That video was removed or is private.',
      101: 'The owner disabled embedding for this video, so it can\'t play here.',
      150: 'The owner disabled embedding for this video, so it can\'t play here.',
    };
    const np = nowPlayingRef.current;
    const label = np ? ` (${np.displayTitle || np.title})` : '';
    setPlaybackNote(`${messages[code] || 'This video could not be played.'}${label}`);
    // Stop guests from trying to play the broken video.
    broadcast({ isPlaying: false });
    // Skip ahead to the next track if there is one.
    const next = currentIndex + 1;
    if (items.length > 0 && next < items.length) handlePlayFromList(next);
  }, [broadcast, items, currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const base = 'ServerTunes';
    const label = nowPlaying?.displayTitle || nowPlaying?.title;
    document.title = label ? `${label} - ${base}` : base;
    return () => { document.title = base; };
  }, [nowPlaying]);

  // Don't broadcast a "paused" event that fired only because the tab went
  // hidden (i.e. the browser auto-paused the iframe). While visible we
  // forward every state change so user play/pause clicks still reach guests.
  const handlePlayerStateChange = useCallback(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    broadcast();
  }, [broadcast]);

  // CSV import/export
  const handleExport = () => {
    downloadCsv('servertunes-playlist.csv', playlistToCsv(items));
  };
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = csvToPlaylist(text);
    if (parsed.length === 0) {
      setAddError('No valid rows found in that CSV.');
    } else {
      dispatch(appendPlaylist(parsed));
    }
    e.target.value = '';
  };

  // Playlist row callbacks (passed to <PlaylistTable />). Kept here so the
  // child stays a pure view and never imports Redux.
  const handleFieldChange = (id, field, value) => {
    dispatch(updateTrack({ id, [field]: value }));
  };
  const handleMoveUp = (index) => dispatch(moveTrack({ from: index, to: index - 1 }));
  const handleMoveDown = (index) => dispatch(moveTrack({ from: index, to: index + 1 }));
  const handleRemove = (id) => dispatch(removeTrack(id));

  const handleLeave = () => {
    dispatch(leaveSession());
    navigate('/');
  };

  // ---- setup screen ----
  if (!isHosting) {
    return (
      <HostSetupForm
        displayName={displayName}
        room={room}
        password={password}
        onDisplayNameChange={setDisplayName}
        onRoomChange={setRoom}
        onPasswordChange={setPassword}
        onBack={() => navigate('/')}
        onSubmit={handleStartHosting}
        setupError={setupError}
      />
    );
  }

  // ---- hosting screen ----
  const statusLabel = status === 'connected'
    ? `Live · ${guestCount} listening`
    : status;

  return (
    <div className="page host">
      <SessionHeader
        onLeave={handleLeave}
        leaveLabel="End session"
        status={status}
        statusLabel={statusLabel}
      />
      {error && <div className="banner error">{error}</div>}

      <div className="host-grid">
        <section className="player-col">
          <YouTubePlayer
            ref={playerRef}
            controllable
            onStateChange={handlePlayerStateChange}
            onEnded={handleNext}
            onError={handlePlayerError}
          />
          <div className="now-playing">
            {nowPlaying
              ? `Now playing: ${nowPlaying.displayTitle || nowPlaying.title}`
              : 'Nothing playing yet'}
          </div>
          {playbackNote && <div className="banner error">{playbackNote}</div>}

          <HostControls
            loopCurrent={loopCurrent}
            stopAtEnd={stopAtEnd}
            onLoopCurrentChange={setLoopCurrent}
            onStopAtEndChange={setStopAtEnd}
            guestVolume={guestVolume}
            onGuestVolumeChange={setGuestVolume}
            urlInput={urlInput}
            onUrlInputChange={setUrlInput}
            onPlayNow={handlePlayNow}
            onAddToPlaylist={handleAddToPlaylist}
            addError={addError}
          />
        </section>

        <section className="playlist-col">
          <PlaylistToolbar
            count={items.length}
            onImportFile={handleImportFile}
            onExport={handleExport}
            onClear={() => dispatch(clearPlaylist())}
          />
          <PlaylistTable
            items={items}
            currentIndex={currentIndex}
            onFieldChange={handleFieldChange}
            onPlay={handlePlayFromList}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onRemove={handleRemove}
          />
        </section>
      </div>
    </div>
  );
};

export default Host;
