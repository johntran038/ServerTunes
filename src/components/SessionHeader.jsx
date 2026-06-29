// src/components/SessionHeader.jsx
import React from 'react';

/**
 * Top bar shared by the Host and Join pages.
 *
 * Props:
 *   - onLeave: handler for the back/leave button
 *   - leaveLabel: text for the back/leave button (e.g. "End session", "Leave")
 *   - status: connection status string from useConnection ("connected", etc.)
 *   - statusLabel: text shown inside the status pill
 */
const SessionHeader = ({ onLeave, leaveLabel, status, statusLabel }) => (
  <header className="bar">
    <button className="link-back" onClick={onLeave}>&larr; {leaveLabel}</button>
    <div className={`status status-${status}`}>{statusLabel}</div>
  </header>
);

export default SessionHeader;
