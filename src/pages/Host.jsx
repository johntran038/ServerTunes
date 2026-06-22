import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import YouTubePlayer from '../components/YouTubePlayer';
import useConnection from '../hooks/useConnection';
import {
  addTrack, removeTrack, moveTrack, setCurrentIndex,
  replacePlaylist, appendPlaylist, clearPlaylist,
} from '../redux/slices/playlistSlice';
import { startHosting, leaveSession } from '../redux/slices/sessionSlice';
import { parseVideoId, watchUrl } from '../utils/youtube';
import { playlistToCsv, csvToPlaylist, downloadCsv } from '../utils/csv';

// YouTube player states
const PLAYING = 1;
const PAUSED = 2;

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

  // --- playback state ---
  const [nowPlaying, setNowPlaying] = useState(null); // { videoId, title }
  const [urlInput, setUrlInput] = useState('');
  const [addError, setAddError] = useState('');
  const [playbackNote, setPlaybackNote] = useState('');

  const playerRef = useRef(null);
  const fileInputRef = useRef(null);
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

  const { status, error, guestCount, send } = useConnection({
    role: isHosting ? 'host' : null,
    room: session.room,
    password: session.password,
    enabled: isHosting,
  });

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
      isPlaying,
      position,
      timestamp: Date.now(),
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

  const playVideo = useCallback((videoId, title) => {
    setPlaybackNote('');
    setNowPlaying({ videoId, title });
    nowPlayingRef.current = { videoId, title };
    if (playerRef.current) playerRef.current.load(videoId, 0, true);
    // Push the new video id to guests right away.
    broadcast({ videoId, title, isPlaying: true, position: 0, timestamp: Date.now() });
  }, [broadcast]);

  const handleStartHosting = (e) => {
    e.preventDefault();
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

  const handlePlayNow = () => {
    const id = resolveInput();
    if (!id) return;
    playVideo(id, watchUrl(id));
    setUrlInput('');
  };

  const handleAddToPlaylist = () => {
    const id = resolveInput();
    if (!id) return;
    dispatch(addTrack({ videoId: id, title: watchUrl(id) }));
    setUrlInput('');
  };

  const handlePlayFromList = (index) => {
    const item = items[index];
    if (!item) return;
    dispatch(setCurrentIndex(index));
    playVideo(item.videoId, item.title);
  };

  const handleNext = useCallback(() => {
    if (items.length === 0) return;
    const next = currentIndex + 1;
    if (next < items.length) handlePlayFromList(next);
  }, [items, currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const label = np ? ` (${np.title})` : '';
    setPlaybackNote(`${messages[code] || 'This video could not be played.'}${label}`);
    // Stop guests from trying to play the broken video.
    broadcast({ isPlaying: false });
    // Skip ahead to the next track if there is one.
    const next = currentIndex + 1;
    if (items.length > 0 && next < items.length) handlePlayFromList(next);
  }, [broadcast, items, currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const handleImportClick = () => fileInputRef.current?.click();
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

  const handleLeave = () => {
    dispatch(leaveSession());
    navigate('/');
  };

  // ---- setup screen ----
  if (!isHosting) {
    return (
      <div className="page host-setup">
        <button className="link-back" onClick={() => navigate('/')}>&larr; Back</button>
        <h1>Host a session</h1>
        <p className="tagline">Sync runs through the public test.mosquitto.org broker. No port forwarding needed.</p>
        <form className="form" onSubmit={handleStartHosting}>
          <label>Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label>Room name (share this with guests)
            <input value={room} onChange={(e) => setRoom(e.target.value)} />
          </label>
          <label>Room password (optional)
            <input value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="submit" className="primary">Start hosting</button>
        </form>
      </div>
    );
  }

  // ---- hosting screen ----
  return (
    <div className="page host">
      <header className="bar">
        <button className="link-back" onClick={handleLeave}>&larr; End session</button>
        <div className={`status status-${status}`}>
          {status === 'connected' ? `Live · ${guestCount} listening` : status}
        </div>
      </header>
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
            {nowPlaying ? `Now playing: ${nowPlaying.title}` : 'Nothing playing yet'}
          </div>
          {playbackNote && <div className="banner error">{playbackNote}</div>}

          <div className="add-row">
            <input
              placeholder="Paste a YouTube link or video ID"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePlayNow()}
            />
            <button className="primary" onClick={handlePlayNow}>Play now</button>
            <button onClick={handleAddToPlaylist}>Add to playlist</button>
          </div>
          {addError && <div className="hint error">{addError}</div>}
        </section>

        <section className="playlist-col">
          <div className="playlist-head">
            <h2>Playlist ({items.length})</h2>
            <div className="playlist-actions">
              <button onClick={handleImportClick}>Import CSV</button>
              <button onClick={handleExport} disabled={items.length === 0}>Export CSV</button>
              <button onClick={() => dispatch(clearPlaylist())} disabled={items.length === 0}>Clear</button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={handleImportFile}
              />
            </div>
          </div>

          <ul className="playlist">
            {items.map((item, index) => (
              <li key={item.id} className={index === currentIndex ? 'active' : ''}>
                <span className="track-title" title={item.title}>{item.title}</span>
                <span className="track-controls">
                  <button onClick={() => handlePlayFromList(index)} title="Play">▶</button>
                  <button onClick={() => dispatch(moveTrack({ from: index, to: index - 1 }))} disabled={index === 0} title="Up">↑</button>
                  <button onClick={() => dispatch(moveTrack({ from: index, to: index + 1 }))} disabled={index === items.length - 1} title="Down">↓</button>
                  <button onClick={() => dispatch(removeTrack(item.id))} title="Remove">✕</button>
                </span>
              </li>
            ))}
            {items.length === 0 && <li className="empty">Add tracks with a YouTube link above.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default Host;
