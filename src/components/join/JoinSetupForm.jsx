// src/components/join/JoinSetupForm.jsx
import React from 'react';

/**
 * Setup form shown before the guest joins a session.
 *
 * Props:
 *   - displayName, room, password: controlled values
 *   - onDisplayNameChange, onRoomChange, onPasswordChange: setters
 *   - onBack: handler for the back button
 *   - onSubmit: form submit handler (already calls preventDefault in parent)
 */
const JoinSetupForm = ({
  displayName,
  room,
  password,
  onDisplayNameChange,
  onRoomChange,
  onPasswordChange,
  onBack,
  onSubmit,
}) => (
  <div className="page join-setup">
    <button className="link-back" onClick={onBack}>&larr; Back</button>
    <h1>Join a session</h1>
    <form className="form" onSubmit={onSubmit}>
      <label>Display name
        <input value={displayName} onChange={(e) => onDisplayNameChange(e.target.value)} />
      </label>
      <label>Room name (from the host)
        <input value={room} onChange={(e) => onRoomChange(e.target.value)} required />
      </label>
      <label>Room password (if set)
        <input value={password} onChange={(e) => onPasswordChange(e.target.value)} />
      </label>
      <button type="submit" className="primary">Join</button>
    </form>
  </div>
);

export default JoinSetupForm;
