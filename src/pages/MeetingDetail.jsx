import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, Trash2, RotateCw, Edit3, Check, Square } from 'lucide-react';
import { getMeeting, deleteMeeting, stopMeeting, reprocessMeeting, retryRecording, updateMeeting, getBotStatus, getStatusInfo, getPlatformInfo, formatDuration } from '../lib/meetings-api';
import TranscriptViewer from '../components/meetings/TranscriptViewer';
import SummaryPanel from '../components/meetings/SummaryPanel';
import RecordingPlayer from '../components/meetings/RecordingPlayer';
import ShareModal from '../components/meetings/ShareModal';
import AssignContactModal from '../components/meetings/AssignContactModal';
import './MeetingDetail.css';

export default function MeetingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [showShare, setShowShare] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [reprocessing, setReprocessing] = useState(false);

  const isActive = meeting && ['joining_call', 'in_waiting_room', 'in_call_recording', 'in_call_not_recording'].includes(meeting.recall_bot_status);

  const load = useCallback(async () => {
    try {
      const data = await getMeeting(id);
      setMeeting(data.meeting);
      setSegments(data.segments || []);
      setTitleValue(data.meeting.title || '');
    } catch (err) {
      console.error('Failed to load meeting:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Poll status for active meetings
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(async () => {
      try {
        const { status } = await getBotStatus(id);
        setMeeting(m => m ? { ...m, recall_bot_status: status } : m);
        if (['done', 'processed', 'error', 'fatal'].includes(status)) {
          load(); // Full reload on completion
        }
      } catch (e) {}
    }, 5000);
    return () => clearInterval(interval);
  }, [isActive, id, load]);

  const handleSeek = (time) => {
    setCurrentTime(time);
    window.__ppPlayerSeek?.(time);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this meeting and all its data?')) return;
    await deleteMeeting(id);
    navigate('/meetings');
  };

  const handleStop = async () => {
    await stopMeeting(id);
    load();
  };

  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      const result = await reprocessMeeting(id);
      setMeeting(m => ({ ...m, ...result.meeting }));
    } finally {
      setReprocessing(false);
    }
  };

  const handleRetryRecording = async () => {
    try {
      const result = await retryRecording(id);
      if (result?.meeting?.video_url) {
        setMeeting(m => ({ ...m, video_url: result.meeting.video_url, storage_path: result.meeting.storage_path }));
      }
    } catch (err) {
      console.error('Failed to retry recording:', err);
    }
  };

  const handleTitleSave = async () => {
    if (titleValue.trim() && titleValue !== meeting.title) {
      await updateMeeting(id, { title: titleValue.trim() });
      setMeeting(m => ({ ...m, title: titleValue.trim() }));
    }
    setEditingTitle(false);
  };

  if (loading) {
    return <div className="meeting-detail-loading"><div className="spinner" /></div>;
  }

  if (!meeting) {
    return <div className="meeting-detail-loading">Meeting not found</div>;
  }

  const status = getStatusInfo(meeting.recall_bot_status);
  const platform = getPlatformInfo(meeting.platform);

  return (
    <div className="meeting-detail">
      <div className="meeting-detail-top">
        <button className="meeting-detail-back" onClick={() => navigate('/meetings')}>
          <ArrowLeft size={18} />
          Back
        </button>

        <div className="meeting-detail-title-row">
          {editingTitle ? (
            <div className="meeting-detail-title-edit">
              <input
                value={titleValue}
                onChange={e => setTitleValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
                autoFocus
              />
              <button onClick={handleTitleSave}><Check size={16} /></button>
            </div>
          ) : (
            <h1 className="meeting-detail-title" onClick={() => setEditingTitle(true)}>
              {meeting.title || 'Untitled Meeting'}
              <Edit3 size={14} className="meeting-detail-edit-icon" />
            </h1>
          )}
        </div>

        <div className="meeting-detail-meta">
          {platform.icon ? (
            <img src={platform.icon} alt={platform.name} className="meeting-detail-platform-icon" />
          ) : (
            <span className="meeting-detail-platform" style={{ background: platform.color }}>{platform.name}</span>
          )}
          <span className="meeting-detail-status" style={{ color: status.color }}>
            {isActive && <span className="meeting-detail-pulse" />}
            {status.label}
          </span>
          {meeting.started_at && (
            <span>{new Date(meeting.started_at).toLocaleString()}</span>
          )}
          {meeting.duration_seconds > 0 && (
            <span>{formatDuration(meeting.duration_seconds)}</span>
          )}
          {meeting.participants?.length > 0 && (
            <span>{meeting.participants.length} participants</span>
          )}
        </div>

        <div className="meeting-detail-actions">
          {isActive && (
            <button className="meeting-detail-action meeting-detail-action--danger" onClick={handleStop}>
              <Square size={14} />
              Stop Recording
            </button>
          )}
          {meeting.recall_bot_status === 'processed' && (
            <button className="meeting-detail-action" onClick={handleReprocess} disabled={reprocessing}>
              <RotateCw size={14} className={reprocessing ? 'spinning' : ''} />
              Reprocess
            </button>
          )}
          {meeting.recall_bot_status === 'processed' && (
            <button className="meeting-detail-action" onClick={() => setShowAssign(true)}>
              <img src="/icon-assign-contact.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
              Assign Contact
            </button>
          )}
          <button className="meeting-detail-action" onClick={() => setShowShare(true)}>
            <Share2 size={14} />
            Share
          </button>
          <button className="meeting-detail-action meeting-detail-action--danger" onClick={handleDelete}>
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      <div className="meeting-detail-body">
        <div className="meeting-detail-left">
          <RecordingPlayer
            videoUrl={meeting.video_url}
            audioUrl={meeting.audio_url}
            onTimeUpdate={setCurrentTime}
            onRetry={!meeting.video_url && !meeting.audio_url && meeting.recall_bot_status === 'processed' ? handleRetryRecording : undefined}
          />
          <div className="meeting-detail-transcript">
            <h3>Transcript</h3>
            <TranscriptViewer
              segments={segments}
              currentTime={currentTime}
              onSeek={handleSeek}
              isLive={isActive}
            />
          </div>
        </div>

        <div className="meeting-detail-right">
          <SummaryPanel meeting={meeting} onSeek={handleSeek} onUpdate={setMeeting} />
        </div>
      </div>

      {showShare && (
        <ShareModal
          meeting={meeting}
          onClose={() => setShowShare(false)}
          onUpdate={setMeeting}
        />
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
