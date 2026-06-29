// src/components/host/HostSetupForm.jsx
import React from 'react';

/**
 * Setup form rendered before the host clicks "Start hosting".
 *
 * Props:
 *   - displayName, room, password: controlled values
 *   - onDisplayNameChange, onRoomChange, onPasswordChange: setters
 *   - onBack: handler for the back button
 *   - onSubmit: form submit handler (already calls preventDefault in parent)
 *   - setupError: optional error string from a rejected hosting attempt
 */
const HostSetupForm = ({
  displayName,
  room,
  password,
  onDisplayNameChange,
  onRoomChange,
  onPasswordChange,
  onBack,
  onSubmit,
  setupError,
}) => (
  <div className="page host-setup">
    <button className="link-back" onClick={onBack}>&larr; Back</button>
    <h1>Host a session</h1>
    <p className="tagline">
      Sync runs through the public test.mosquitto.org broker. No port forwarding needed.
    </p>
    {setupError && <div className="banner error">{setupError}</div>}
    <form className="form" onSubmit={onSubmit}>
      <label>Display name
        <input value={displayName} onChange={(e) => onDisplayNameChange(e.target.value)} />
      </label>
      <label>Room name (share this with guests)
        <input value={room} onChange={(e) => onRoomChange(e.target.value)} />
      </label>
      <label>Room password (optional)
        <input value={password} onChange={(e) => onPasswordChange(e.target.value)} />
      </label>
      <button type="submit" className="primary">Start hosting</button>
    </form>
  </div>
);

export default HostSetupForm;
