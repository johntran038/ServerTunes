import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';

/**
 * Loads the YouTube IFrame Player API once and reuses it.
 */
let apiPromise = null;
function loadYouTubeApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return apiPromise;
}

/**
 * Thin wrapper around the YouTube IFrame player exposing an imperative API
 * via ref: load(videoId, startSeconds), play(), pause(), stop(), seek(seconds),
 * getTime(), getState(), getDuration(), mute/unMute/isMuted/setVolume.
 *
 * Props:
 *   controllable  when false (guests) pointer events are disabled so users
 *                 can't drive their own player - the host is in control.
 *   onStateChange (ytState) => void
 *   onReady       () => void
 *   onEnded       () => void
 *   onError       (code) => void   YT error codes: 2, 5, 100, 101, 150
 */
const YouTubePlayer = forwardRef(function YouTubePlayer(
  { controllable = true, onStateChange, onReady, onEnded, onError },
  ref,
) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const readyRef = useRef(false);
  const pendingRef = useRef(null); // {videoId, startSeconds, autoplay}

  // Keep the latest callbacks in refs. The YT player is created once, so its
  // event handlers would otherwise capture stale props (e.g. an empty
  // playlist for onEnded). Reading through refs always calls the latest.
  const onStateChangeRef = useRef(onStateChange);
  const onReadyRef = useRef(onReady);
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    let destroyed = false;

    loadYouTubeApi().then((YT) => {
      if (destroyed || !containerRef.current) return;
      playerRef.current = new YT.Player(containerRef.current, {
        height: '360',
        width: '640',
        playerVars: {
          autoplay: 0,
          controls: controllable ? 1 : 0,
          disablekb: controllable ? 0 : 1,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            if (pendingRef.current) {
              const { videoId, startSeconds, autoplay } = pendingRef.current;
              pendingRef.current = null;
              if (autoplay) {
                playerRef.current.loadVideoById({ videoId, startSeconds });
              } else {
                playerRef.current.cueVideoById({ videoId, startSeconds });
              }
            }
            if (onReadyRef.current) onReadyRef.current();
          },
          onStateChange: (e) => {
            if (onStateChangeRef.current) onStateChangeRef.current(e.data);
            // YT.PlayerState.ENDED === 0
            if (e.data === 0 && onEndedRef.current) onEndedRef.current();
          },
          // Fired when a video can't be played: 2 (bad id), 5 (HTML5 error),
          // 100 (removed/private), 101 & 150 (embedding disabled by owner).
          onError: (e) => {
            if (onErrorRef.current) onErrorRef.current(e.data);
          },
        },
      });
    });

    return () => {
      destroyed = true;
      if (playerRef.current && playerRef.current.destroy) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
      }
      playerRef.current = null;
      readyRef.current = false;
    };
    // controllable only affects initial creation; we intentionally don't
    // recreate the player when it toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    load(videoId, startSeconds = 0, autoplay = true) {
      if (!videoId) return;
      if (!readyRef.current || !playerRef.current) {
        pendingRef.current = { videoId, startSeconds, autoplay };
        return;
      }
      if (autoplay) {
        playerRef.current.loadVideoById({ videoId, startSeconds });
      } else {
        playerRef.current.cueVideoById({ videoId, startSeconds });
      }
    },
    play() {
      if (readyRef.current && playerRef.current) playerRef.current.playVideo();
    },
    pause() {
      if (readyRef.current && playerRef.current) playerRef.current.pauseVideo();
    },
    // Stops playback and unloads the current video. Used when the host leaves
    // so the guest doesn't sit on the last frame.
    stop() {
      if (readyRef.current && playerRef.current) {
        try { playerRef.current.stopVideo(); } catch { /* ignore */ }
      }
      // Drop any queued load so a stale video can't pop up after stop.
      pendingRef.current = null;
    },
    seek(seconds, allowSeekAhead = true) {
      if (readyRef.current && playerRef.current) {
        playerRef.current.seekTo(seconds, allowSeekAhead);
      }
    },
    getTime() {
      if (readyRef.current && playerRef.current) {
        return playerRef.current.getCurrentTime() || 0;
      }
      return 0;
    },
    getDuration() {
      if (readyRef.current && playerRef.current) {
        return playerRef.current.getDuration() || 0;
      }
      return 0;
    },
    getState() {
      if (readyRef.current && playerRef.current) {
        return playerRef.current.getPlayerState();
      }
      return -1;
    },
    mute() {
      if (readyRef.current && playerRef.current) playerRef.current.mute();
    },
    unMute() {
      if (readyRef.current && playerRef.current) playerRef.current.unMute();
    },
    isMuted() {
      if (readyRef.current && playerRef.current) {
        return playerRef.current.isMuted();
      }
      return false;
    },
    setVolume(v) {
      if (readyRef.current && playerRef.current) {
        playerRef.current.setVolume(Math.max(0, Math.min(100, v)));
      }
    },
    isReady() {
      return readyRef.current;
    },
  }), []);

  return (
    <div className="yt-wrapper">
      <div ref={containerRef} />
      {!controllable && <div className="yt-guard" title="The host controls playback" />}
    </div>
  );
});

export default YouTubePlayer;
