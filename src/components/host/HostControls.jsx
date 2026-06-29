// src/components/host/HostControls.jsx
import React from 'react';
import { RxLoop } from 'react-icons/rx';
import { PiNumberCircleOneBold } from 'react-icons/pi';

/**
 * Host-side controls rendered below the YouTube player:
 *   - end-of-song toggles (loop current / stop after this song) and the
 *     little icon that hints which mode is active
 *   - listener volume slider (host-controlled, broadcast to guests)
 *   - "play now / add to playlist" input row
 *
 * Props:
 *   - loopCurrent, stopAtEnd: booleans for the toggles
 *   - onLoopCurrentChange, onStopAtEndChange: setters for the toggles
 *   - guestVolume: number (0-100)
 *   - onGuestVolumeChange: setter for guest volume
 *   - urlInput: controlled value for the URL/video-id input
 *   - onUrlInputChange: setter for urlInput
 *   - onPlayNow: handler for the "Play now" button (also wired to Enter key)
 *   - onAddToPlaylist: handler for the "Add to playlist" button
 *   - addError: optional error string shown beneath the row
 */
const HostControls = ({
  loopCurrent,
  stopAtEnd,
  onLoopCurrentChange,
  onStopAtEndChange,
  guestVolume,
  onGuestVolumeChange,
  urlInput,
  onUrlInputChange,
  onPlayNow,
  onAddToPlaylist,
  addError,
}) => (
  <>
    <div className="playback-toggles">
      <label>
        <input
          type="checkbox"
          checked={loopCurrent}
          onChange={(e) => onLoopCurrentChange(e.target.checked)}
        />
        Loop current song
      </label>
      <label>
        <input
          type="checkbox"
          checked={stopAtEnd}
          onChange={(e) => onStopAtEndChange(e.target.checked)}
        />
        Stop after this song
      </label>
      <label>
        {loopCurrent ? (
          <RxLoop size="1.3rem" />
        ) : (
          stopAtEnd && <PiNumberCircleOneBold size="1.3rem" />
        )}
      </label>
    </div>

    <div className="guest-volume">
      <label htmlFor="guest-volume-slider">Listener volume</label>
      <input
        id="guest-volume-slider"
        type="range"
        min="0"
        max="100"
        step="1"
        value={guestVolume}
        onChange={(e) => onGuestVolumeChange(Number(e.target.value))}
        aria-label="Listener volume"
      />
      <span className="guest-volume-readout">{guestVolume}%</span>
    </div>
    <p className="hint">
      Sets the volume for everyone listening. Your own audio isn't affected.
    </p>

    <div className="add-row">
      <input
        placeholder="Paste a YouTube link or video ID"
        value={urlInput}
        onChange={(e) => onUrlInputChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onPlayNow()}
      />
      <button className="primary" onClick={onPlayNow}>Play now</button>
      <button className="secondary" onClick={onAddToPlaylist}>Add to playlist</button>
    </div>
    {addError && <div className="hint error">{addError}</div>}
  </>
);

export default HostControls;
