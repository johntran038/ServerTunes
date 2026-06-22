import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import YouTubePlayer from '../components/YouTubePlayer';
import useConnection from '../hooks/useConnection';
import { startJoining, leaveSession } from '../redux/slices/sessionSlice';

const PLAYING = 1;
const DRIFT_TOLERANCE = 1.5; // seconds before we hard-seek a guest

const Join = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const session = useSelector((s) => s.session);
  const isJoined = session.role === 'guest';

  const [room, setRoom] = useState('main');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('Guest');

  const [nowPlaying, setNowPlaying] = useState(null);
  const [needsGesture, setNeedsGesture] = useState(false);

  const playerRef = useRef(null);
  const currentVideoRef = useRef(null);

  // Apply incoming host state to the local player.
  const applyState = useCallback((payload) => {
    const player = playerRef.current;
    if (!player || !payload || !payload.videoId) return;

    const elapsed = payload.isPlaying ? (Date.now() - payload.timestamp) / 1000 : 0;
    const targetTime = Math.max(0, payload.position + elapsed);

    setNowPlaying({ videoId: payload.videoId, title: payload.title });

    if (currentVideoRef.current !== payload.videoId) {
      currentVideoRef.current = payload.videoId;
      player.load(payload.videoId, targetTime, payload.isPlaying);
      if (payload.isPlaying && !player.isReady()) setNeedsGesture(true);
      return;
    }

    // Same video: correct drift and match play/pause.
    const drift = Math.abs(player.getTime() - targetTime);
    if (drift > DRIFT_TOLERANCE) player.seek(targetTime);

    if (payload.isPlaying && player.getState() !== PLAYING) {
      player.play();
    } else if (!payload.isPlaying && player.getState() === PLAYING) {
      player.pause();
    }
  }, []);

  const handleHostLeft = useCallback(() => {
    if (playerRef.current) playerRef.current.pause();
  }, []);

  const { status, error, send } = useConnection({
    role: isJoined ? 'guest' : null,
    room: session.room,
    password: session.password,
    onState: applyState,
    onHostLeft: handleHostLeft,
    enabled: isJoined,
  });

  void send;

  // Re-apply latest state once the player becomes ready isn't tracked here;
  // the host heartbeat (every 3s) will re-sync us automatically.

  const handleJoin = (e) => {
    e.preventDefault();
    dispatch(startJoining({ room, password, displayName }));
  };

  const handleLeave = () => {
    dispatch(leaveSession());
    navigate('/');
  };

  // Browsers block autoplay with sound until the user interacts.
  const handleEnableAudio = () => {
    setNeedsGesture(false);
    if (playerRef.current) playerRef.current.play();
  };

  if (!isJoined) {
    return (
      <div className="page join-setup">
        <button className="link-back" onClick={() => navigate('/')}>&larr; Back</button>
        <h1>Join a session</h1>
        <form className="form" onSubmit={handleJoin}>
          <label>Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label>Room name (from the host)
            <input value={room} onChange={(e) => setRoom(e.target.value)} required />
          </label>
          <label>Room password (if set)
            <input value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="submit" className="primary">Join</button>
        </form>
      </div>
    );
  }

  return (
    <div className="page join">
      <header className="bar">
        <button className="link-back" onClick={handleLeave}>&larr; Leave</button>
        <div className={`status status-${status}`}>
          {status === 'connected' ? 'Connected to host' : status}
        </div>
      </header>
      {error && <div className="banner error">{error}</div>}
      {needsGesture && (
        <button className="banner gesture" onClick={handleEnableAudio}>
          Tap to enable audio and sync with the host
        </button>
      )}

      <div className="join-stage">
        <YouTubePlayer ref={playerRef} controllable={false} />
        <div className="now-playing">
          {nowPlaying ? `Now playing: ${nowPlaying.title}` : 'Waiting for the host to start...'}
        </div>
        <p className="hint">Playback is controlled by the host.</p>
      </div>
    </div>
  );
};

export default Join;
