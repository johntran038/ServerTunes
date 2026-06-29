// src/components/host/PlaylistToolbar.jsx
import React, { useRef } from 'react';

/**
 * Toolbar above the playlist table on the host page.
 *
 * The hidden <input type="file"> lives here so the Import button and the
 * picker stay co-located. The parent only sees the parsed change event.
 *
 * Props:
 *   - count: number of tracks (drives the title and the disabled state of
 *     Export/Clear)
 *   - onImportFile: change handler for the file input
 *   - onExport: click handler for "Export CSV"
 *   - onClear: click handler for "Clear"
 */
const PlaylistToolbar = ({ count, onImportFile, onExport, onClear }) => {
  const fileInputRef = useRef(null);
  const handleImportClick = () => fileInputRef.current?.click();

  return (
    <div className="playlist-head">
      <h2>Playlist ({count})</h2>
      <div className="playlist-actions">
        <button className="secondary" onClick={handleImportClick}>Import CSV</button>
        <button className="secondary" onClick={onExport} disabled={count === 0}>
          Export CSV
        </button>
        <button className="secondary" onClick={onClear} disabled={count === 0}>
          Clear
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={onImportFile}
        />
      </div>
    </div>
  );
};

export default PlaylistToolbar;
