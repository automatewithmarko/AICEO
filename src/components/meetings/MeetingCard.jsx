import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Users, FileText, Pencil, Trash2 } from 'lucide-react';
import { formatDuration, getPlatformInfo, getStatusInfo, getSourceInfo, updateMeeting, deleteMeeting } from '../../lib/meetings-api';
import AssignContactModal from './AssignContactModal';
import './MeetingCard.css';

export default function MeetingCard({ meeting }) {
  const navigate = useNavigate();
  const isExternal = meeting.is_external;
  const platform = getPlatformInfo(meeting.platform);
  const sourceInfo = getSourceInfo(meeting.source);
  const status = getStatusInfo(meeting.recall_bot_status);
  const isActive = !isExternal && ['joining_call', 'in_waiting_room', 'in_call_recording', 'in_call_not_recording'].includes(meeting.recall_bot_status);
  const showStatus = !isExternal && ['joining_call', 'in_waiting_room', 'in_call_not_recording', 'in_call_recording', 'recording_done', 'call_ended', 'done', 'fatal', 'error', 'creating', 'pending'].includes(meeting.recall_bot_status);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(meeting.title || 'Untitled Meeting');
  const [showAssign, setShowAssign] = useState(false);
  const inputRef = useRef(null);

  const date = meeting.started_at || meeting.created_at;
  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const formattedTime = new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });

  const participantCount = Array.isArray(meeting.participants) ? meeting.participants.length : 0;
  const actionItemCount = Array.isArray(meeting.action_items) ? meeting.action_items.length : 0;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEditing = (e) => {
    if (isExternal) return;
    e.stopPropagation();
    setEditing(true);
  };

  const saveTitle = async () => {
    setEditing(false);
    const trimmed = title.trim() || 'Untitled Meeting';
    setTitle(trimmed);
    if (trimmed !== (meeting.title || 'Untitled Meeting')) {
      try {
        await updateMeeting(meeting.id, { title: trimmed });
        meeting.title = trimmed;
      } catch (err) {
        console.error('Failed to rename meeting:', err);
        setTitle(meeting.title || 'Untitled Meeting');
      }
    }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this recording?')) return;
    try {
      await deleteMeeting(meeting.id);
      e.target.closest('.meeting-card').style.display = 'none';
    } catch (err) {
      console.error('Failed to delete meeting:', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTitle();
    } else if (e.key === 'Escape') {
      setTitle(meeting.title || 'Untitled Meeting');
      setEditing(false);
    }
  };

  const handleCardClick = () => {
    if (editing) return;
    if (isExternal) {
      navigate(`/meetings/${meeting.id}`, { state: { external: true, source: meeting.source } });
    } else {
      navigate(`/meetings/${meeting.id}`);
    }
  };

  // For external recordings, show source logo; for PP, show platform icon
  const iconSrc = isExternal ? sourceInfo.icon : platform.icon;
  const iconAlt = isExternal ? sourceInfo.name : platform.name;

  return (
    <div
      className={`meeting-card ${isActive ? 'meeting-card--active' : ''}`}
      onClick={handleCardClick}
    >
      <div className="meeting-card-top">
        {iconSrc ? (
          <img src={iconSrc} alt={iconAlt} className="meeting-card-platform-icon" />
        ) : (
          <span className="meeting-card-platform-fallback">{iconAlt}</span>
        )}
        <div className="meeting-card-top-right">
          <div className="meeting-card-header">
            {!isExternal && editing ? (
              <input
                ref={inputRef}
                className="meeting-card-title-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={handleKeyDown}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <div className="meeting-card-title-row" onClick={!isExternal ? startEditing : undefined}>
                <h3
                  className="meeting-card-title"
                  onMouseEnter={(e) => {
                    const el = e.currentTarget;
                    const overflow = el.scrollWidth - el.clientWidth;
                    if (overflow > 0) {
                      const duration = Math.max(3, (overflow / 60) * 2 + 1);
                      el.style.setProperty('--marquee-distance', `-${overflow}px`);
                      el.style.setProperty('--marquee-duration', `${duration}s`);
                      el.classList.add('meeting-card-title--scrolling');
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.classList.remove('meeting-card-title--scrolling');
                  }}
                ><span className="meeting-card-title-text">{title}</span></h3>
                {!isExternal && <Pencil size={13} className="meeting-card-edit-icon" />}
              </div>
            )}
            {isExternal ? (
              <div className="meeting-card-actions">
                <button className="meeting-card-assign-btn" onClick={(e) => { e.stopPropagation(); setShowAssign(true); }}>
                  <img src="/icon-assign-contact.png" alt="" className="meeting-card-assign-icon" />
                  Assign Contact
                </button>
              </div>
            ) : showStatus ? (
              <div className="meeting-card-status" style={{ color: status.color }}>
                {isActive && <span className="meeting-card-pulse" />}
                {status.label}
              </div>
            ) : (
              <div className="meeting-card-actions">
                <button className="meeting-card-assign-btn" onClick={(e) => { e.stopPropagation(); setShowAssign(true); }}>
                  <img src="/icon-assign-contact.png" alt="" className="meeting-card-assign-icon" />
                  Assign Contact
                </button>
                <button className="meeting-card-delete-btn" onClick={handleDelete}>
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>
          <div className="meeting-card-meta">
            <span className="meeting-card-date">{formattedDate} at {formattedTime}</span>
            {meeting.duration_seconds > 0 && (
              <span className="meeting-card-duration">
                <Clock size={13} />
                {formatDuration(meeting.duration_seconds)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="meeting-card-footer">
        {participantCount > 0 && (
          <span className="meeting-card-stat">
            <Users size={13} />
            {participantCount}
          </span>
        )}
        {actionItemCount > 0 && (
          <span className="meeting-card-stat">
            <FileText size={13} />
            {actionItemCount} action items
          </span>
        )}
        {isExternal && (
          <span className="meeting-card-stat" style={{ color: '#999', fontSize: 11 }}>
            via {sourceInfo.name}
          </span>
        )}
      </div>

      {meeting.summary?.overview && (
        <p className="meeting-card-summary">
          {typeof meeting.summary.overview === 'string'
            ? meeting.summary.overview.slice(0, 120) + (meeting.summary.overview.length > 120 ? '...' : '')
            : ''}
        </p>
      )}

      {showAssign && (
        <AssignContactModal
          meetingId={meeting.id}
          isExternal={isExternal}
          onClose={() => setShowAssign(false)}
          onAssigned={(contact) => {
            console.log('Assigned contact:', contact.name);
          }}
        />
      )}
    </div>
  );
}
