// src/components/join/HostGoneNotice.jsx
import React from 'react';

/**
 * Placeholder rendered on the join page after the host leaves the session.
 *
 * The parent unmounts the YouTubePlayer while this is on screen so the
 * iframe visibly clears; this component just fills the space with a clear
 * status message.
 */
const HostGoneNotice = () => (
  <div className="host-gone">
    <div className="host-gone-title">The host left the session</div>
    <div className="host-gone-sub">
      Waiting for them to come back, or you can leave.
    </div>
  </div>
);

export default HostGoneNotice;
