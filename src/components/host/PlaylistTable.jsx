// src/components/host/PlaylistTable.jsx
import React from 'react';
import { FaPlay } from 'react-icons/fa';
import { FaArrowUpLong, FaArrowDownLong } from 'react-icons/fa6';
import { ImCross } from 'react-icons/im';
import { watchUrl } from '../../utils/youtube';

/**
 * One editable row in the host playlist. Kept local to this file because it's
 * only ever rendered inside <PlaylistTable />.
 */
const PlaylistRow = ({
  item,
  index,
  isActive,
  isFirst,
  isLast,
  onFieldChange,
  onPlay,
  onMoveUp,
  onMoveDown,
  onRemove,
}) => (
  <tr className={isActive ? 'active' : ''}>
    <td>
      <input
        className="cell-input"
        value={item.title}
        placeholder={watchUrl(item.videoId)}
        aria-label="Title"
        onChange={(e) => onFieldChange(item.id, 'title', e.target.value)}
      />
    </td>
    <td>
      <input
        className="cell-input"
        value={item.displayTitle}
        placeholder={item.title || watchUrl(item.videoId)}
        aria-label="Display title"
        onChange={(e) => onFieldChange(item.id, 'displayTitle', e.target.value)}
      />
    </td>
    <td>
      <input
        className="cell-input"
        value={item.url}
        placeholder={watchUrl(item.videoId)}
        aria-label="Link"
        onChange={(e) => onFieldChange(item.id, 'url', e.target.value)}
      />
    </td>
    <td className="col-controls">
      <button className="secondary" onClick={() => onPlay(index)} title="Play">
        <FaPlay />
      </button>
      <button
        className="secondary"
        onClick={() => onMoveUp(index)}
        disabled={isFirst}
        title="Up"
      >
        <FaArrowUpLong />
      </button>
      <button
        className="secondary"
        onClick={() => onMoveDown(index)}
        disabled={isLast}
        title="Down"
      >
        <FaArrowDownLong />
      </button>
      <button className="secondary" onClick={() => onRemove(item.id)} title="Remove">
        <ImCross />
      </button>
    </td>
  </tr>
);

/**
 * Editable playlist table on the host page.
 *
 * Props:
 *   - items: array of playlist tracks
 *   - currentIndex: index of the currently playing track (for highlight)
 *   - onFieldChange(id, field, value): inline edit of title/displayTitle/url
 *   - onPlay(index): play the row at this index
 *   - onMoveUp(index) / onMoveDown(index): reorder a row
 *   - onRemove(id): drop the row
 */
const PlaylistTable = ({
  items,
  currentIndex,
  onFieldChange,
  onPlay,
  onMoveUp,
  onMoveDown,
  onRemove,
}) => {
  if (items.length === 0) {
    return <p className="hint empty-playlist">Add tracks with a YouTube link above.</p>;
  }

  return (
    <table className="playlist-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Display</th>
          <th>Link</th>
          <th className="col-controls">Controls</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <PlaylistRow
            key={item.id}
            item={item}
            index={index}
            isActive={index === currentIndex}
            isFirst={index === 0}
            isLast={index === items.length - 1}
            onFieldChange={onFieldChange}
            onPlay={onPlay}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onRemove={onRemove}
          />
        ))}
      </tbody>
    </table>
  );
};

export default PlaylistTable;
