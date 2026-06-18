import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Entry screen: choose to host a session or join an existing one.
 */
const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="page landing">
      <h1 className="brand">ServerTunes</h1>
      <p className="tagline">Host a YouTube listening party. Everyone hears the same thing, in sync.</p>

      <div className="choice-grid">
        <button className="choice-card" onClick={() => navigate('/host')}>
          <span className="choice-icon">🎧</span>
          <span className="choice-title">Host</span>
          <span className="choice-sub">Run a session and control playback for everyone.</span>
        </button>

        <button className="choice-card" onClick={() => navigate('/join')}>
          <span className="choice-icon">🔗</span>
          <span className="choice-title">Join</span>
          <span className="choice-sub">Enter a host&apos;s IP and port to listen along.</span>
        </button>
      </div>

      <p className="fine-print">
        Hosting requires running the sync server (<code>npm run server</code>) and
        forwarding its port so invitees can reach you.
      </p>
    </div>
  );
};

export default Landing;
