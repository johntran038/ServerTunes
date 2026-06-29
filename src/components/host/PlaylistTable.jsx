// src/components/host/PlaylistTable.jsx
import React from 'react';
import { FaPlay } from 'react-icons/fa';
import { FaArrowUpLong, FaArrowDownLong } from 'react-icons/fa6';
import { ImCross } from 'react-icons/im';
import { watchUrl } from '../../utils/youtube';
import { normalizeCropText } from '../../utils/crop';

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
  onCropBlur,
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
    <td>
      {/*
        The crop field is corrected on blur, not on every keystroke, so the
        user can see exactly what they typed while editing. Playback uses
        the parsed/clamped version regardless, so behavior matches the
        corrected timestamp even before blur.
      */}
      <input
        className="cell-input"
        value={item.crop || ''}
        placeholder="start-end"
        aria-label="Crop (start-end in seconds)"
        onChange={(e) => onFieldChange(item.id, 'crop', e.target.value)}
        onBlur={(e) => onCropBlur(item.id, e.target.value)}
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
 *   - onFieldChange(id, field, value): inline edit of title/displayTitle/url/crop
 *   - onCropBlur(id, value): commit the normalized crop text on blur
 *   - onPlay(index): play the row at this index
 *   - onMoveUp(index) / onMoveDown(index): reorder a row
 *   - onRemove(id): drop the row
 *
 * onCropBlur is provided as a sensible default that calls
 * onFieldChange(id, 'crop', normalizeCropText(value)) when omitted, so
 * callers who don't care about customizing blur behavior can skip it.
 */
const PlaylistTable = ({
  items,
  currentIndex,
  onFieldChange,
  onCropBlur,
  onPlay,
  onMoveUp,
  onMoveDown,
  onRemove,
}) => {
  if (items.length === 0) {
    return <p className="hint empty-playlist">Add tracks with a YouTube link above.</p>;
  }

  const handleCropBlur = onCropBlur
    || ((id, value) => onFieldChange(id, 'crop', normalizeCropText(value)));

  return (
    <table className="playlist-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Display</th>
          <th>Link</th>
          <th>Crop</th>
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
            onCropBlur={handleCropBlur}
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
