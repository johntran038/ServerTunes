import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import YouTubePlayer from '../components/YouTubePlayer';
import useConnection from '../hooks/useConnection';
import { startJoining, leaveSession } from '../redux/slices/sessionSlice';

const PLAYING = 1;
const DRIFT_TOLERANCE = 1.5; // seconds before we hard-seek a guest
const MUTE_CHECK_INTERVAL = 750; // poll for YT auto-mute on the guest player

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
  // True while we believe the host has gone (cleared retained host topic).
  // We unmount the YouTubePlayer in this state so the embed visibly clears.
  const [hostLeft, setHostLeft] = useState(false);

  const playerRef = useRef(null);
  const currentVideoRef = useRef(null);
  // Latest host payload, kept around so we can re-apply it once the player
  // remounts after the host returns.
  const lastPayloadRef = useRef(null);

  // Try to keep the YT player audible. YouTube's cross-origin autoplay policy
  // will auto-mute fresh loads (host change, new track, fresh iframe). Calling
  // unMute + setVolume after every load/play recovers audio whenever the
  // iframe still has user activation. If it doesn't, the poller below will
  // notice it's still muted and surface the gesture banner.
  const ensureAudible = useCallback(() => {
    const player = playerRef.current;
    if (!player || !player.isReady()) return;
    try {
      player.unMute();
      player.setVolume(100);
    } catch { /* ignore */ }
  }, []);

  // Apply incoming host state to the local player.
  const applyState = useCallback((payload) => {
    if (!payload || !payload.videoId) return;

    // Remember the latest payload so we can replay it after a remount, and
    // mark the host as present (any state message proves they're back).
    lastPayloadRef.current = payload;
    setHostLeft(false);

    const player = playerRef.current;
    if (!player) return; // player is being remounted; the effect below will replay

    const elapsed = payload.isPlaying ? (Date.now() - payload.timestamp) / 1000 : 0;
    const targetTime = Math.max(0, payload.position + elapsed);

    setNowPlaying({ videoId: payload.videoId, title: payload.title });

    if (currentVideoRef.current !== payload.videoId) {
      currentVideoRef.current = payload.videoId;
      player.load(payload.videoId, targetTime, payload.isPlaying);
      ensureAudible();
      return;
    }

    // Same video: correct drift and match play/pause.
    const drift = Math.abs(player.getTime() - targetTime);
    if (drift > DRIFT_TOLERANCE) player.seek(targetTime);

    if (payload.isPlaying && player.getState() !== PLAYING) {
      player.play();
      ensureAudible();
    } else if (!payload.isPlaying && player.getState() === PLAYING) {
      player.pause();
    }
  }, [ensureAudible]);

  const handleHostLeft = useCallback(() => {
    const player = playerRef.current;
    if (player) player.stop();
    currentVideoRef.current = null;
    lastPayloadRef.current = null;
    setNowPlaying(null);
    setNeedsGesture(false);
    setHostLeft(true);
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

  // Reset everything when the user leaves the session entirely.
  useEffect(() => {
    if (!isJoined) {
      currentVideoRef.current = null;
      lastPayloadRef.current = null;
      setNowPlaying(null);
      setNeedsGesture(false);
      setHostLeft(false);
    }
  }, [isJoined]);

  // After the host comes back the player remounts; re-apply the most recent
  // payload so the guest doesn't have to wait for the next 3s heartbeat.
  useEffect(() => {
    if (hostLeft) return undefined;
    const id = setTimeout(() => {
      if (lastPayloadRef.current && playerRef.current) {
        applyState(lastPayloadRef.current);
      }
    }, 50);
    return () => clearTimeout(id);
  }, [hostLeft, applyState]);

  // Poll the player. If the host is playing but YT has muted us (autoplay
  // policy on a new iframe / new load), prompt the user to tap once.
  useEffect(() => {
    if (!isJoined || hostLeft) return undefined;
    const id = setInterval(() => {
      const player = playerRef.current;
      if (!player || !player.isReady()) return;
      const isPlaying = player.getState() === PLAYING;
      if (isPlaying && player.isMuted()) {
        setNeedsGesture(true);
      } else if (!player.isMuted()) {
        setNeedsGesture(false);
      }
    }, MUTE_CHECK_INTERVAL);
    return () => clearInterval(id);
  }, [isJoined, hostLeft]);

  const handleJoin = (e) => {
    e.preventDefault();
    dispatch(startJoining({ room, password, displayName }));
  };

  const handleLeave = () => {
    dispatch(leaveSession());
    navigate('/');
  };

  // Browsers/YT block audible autoplay in cross-origin iframes without a
  // direct gesture. This handler IS that gesture: explicitly unmute, restore
  // volume, then resume playback.
  const handleEnableAudio = () => {
    const player = playerRef.current;
    if (player) {
      try {
        player.unMute();
        player.setVolume(100);
        player.play();
      } catch { /* ignore */ }
    }
    setNeedsGesture(false);
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
      {needsGesture && !hostLeft && (
        <button className="banner gesture" onClick={handleEnableAudio}>
          Tap to enable audio and sync with the host
        </button>
      )}

      <div className="join-stage">
        {hostLeft ? (
          <div className="host-gone">
            <div className="host-gone-title">The host left the session</div>
            <div className="host-gone-sub">
              Waiting for them to come back, or you can leave.
            </div>
          </div>
        ) : (
          <>
            <YouTubePlayer ref={playerRef} controllable={false} />
            <div className="now-playing">
              {nowPlaying ? `Now playing: ${nowPlaying.title}` : 'Waiting for the host to start...'}
            </div>
            <p className="hint">Playback is controlled by the host.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default Join;
