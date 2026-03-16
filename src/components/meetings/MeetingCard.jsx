import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Users, FileText, Pencil, Trash2 } from 'lucide-react';
import { formatDuration, getPlatformInfo, getStatusInfo, updateMeeting, deleteMeeting } from '../../lib/meetings-api';
import AssignContactModal from './AssignContactModal';
import './MeetingCard.css';

export default function MeetingCard({ meeting }) {
  const navigate = useNavigate();
  const platform = getPlatformInfo(meeting.platform);
  const status = getStatusInfo(meeting.recall_bot_status);
  const isActive = ['joining_call', 'in_waiting_room', 'in_call_recording', 'in_call_not_recording'].includes(meeting.recall_bot_status);
  const showStatus = ['joining_call', 'in_waiting_room', 'in_call_not_recording', 'in_call_recording', 'recording_done', 'call_ended', 'done', 'fatal', 'error', 'creating', 'pending'].includes(meeting.recall_bot_status);

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
      // Remove card from DOM by hiding it
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

  return (
    <div
      className={`meeting-card ${isActive ? 'meeting-card--active' : ''}`}
      onClick={() => !editing && navigate(`/meetings/${meeting.id}`)}
    >
      <div className="meeting-card-top">
        {platform.icon ? (
          <img src={platform.icon} alt={platform.name} className="meeting-card-platform-icon" />
        ) : (
          <span className="meeting-card-platform-fallback">{platform.name}</span>
        )}
        <div className="meeting-card-top-right">
          <div className="meeting-card-header">
            {editing ? (
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
              <div className="meeting-card-title-row" onClick={startEditing}>
                <h3 className="meeting-card-title">{title}</h3>
                <Pencil size={13} className="meeting-card-edit-icon" />
              </div>
            )}
            {showStatus ? (
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
          onClose={() => setShowAssign(false)}
          onAssigned={(contact) => {
            console.log('Assigned contact:', contact.name);
          }}
        />
      )}
    </div>
  );
}
