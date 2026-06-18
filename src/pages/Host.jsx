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
  const [port, setPort] = useState(8080);
  const [room, setRoom] = useState('main');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('Host');

  // --- playback state ---
  const [nowPlaying, setNowPlaying] = useState(null); // { videoId, title }
  const [urlInput, setUrlInput] = useState('');
  const [addError, setAddError] = useState('');

  const playerRef = useRef(null);
  const fileInputRef = useRef(null);
  const nowPlayingRef = useRef(nowPlaying);
  useEffect(() => { nowPlayingRef.current = nowPlaying; }, [nowPlaying]);

  const { status, error, guestCount, send } = useConnection({
    role: isHosting ? 'host' : null,
    port: session.port,
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
    const payload = {
      videoId: np.videoId,
      title: np.title,
      isPlaying: ytState === PLAYING,
      position: player ? player.getTime() : 0,
      timestamp: Date.now(),
      ...override,
    };
    send({ type: 'state', payload });
  }, [send]);

  // Heartbeat so late joiners and drifting guests stay in sync.
  useEffect(() => {
    if (status !== 'connected') return undefined;
    const id = setInterval(() => broadcast(), 3000);
    return () => clearInterval(id);
  }, [status, broadcast]);

  const playVideo = useCallback((videoId, title) => {
    setNowPlaying({ videoId, title });
    nowPlayingRef.current = { videoId, title };
    if (playerRef.current) playerRef.current.load(videoId, 0, true);
    // Push the new video id to guests right away.
    broadcast({ videoId, title, isPlaying: true, position: 0, timestamp: Date.now() });
  }, [broadcast]);

  const handleStartHosting = (e) => {
    e.preventDefault();
    dispatch(startHosting({ port: Number(port), room, password, displayName }));
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
        <p className="tagline">Start the sync server first: <code>npm run server</code></p>
        <form className="form" onSubmit={handleStartHosting}>
          <label>Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label>Port (must match the server &amp; be port-forwarded)
            <input type="number" value={port} onChange={(e) => setPort(e.target.value)} />
          </label>
          <label>Room name
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
            onStateChange={() => broadcast()}
            onEnded={handleNext}
          />
          <div className="now-playing">
            {nowPlaying ? `Now playing: ${nowPlaying.title}` : 'Nothing playing yet'}
          </div>

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