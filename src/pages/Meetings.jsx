import { useState, useEffect } from 'react';
import { Plus, Filter } from 'lucide-react';
import { getMeetings, getActiveBots } from '../lib/meetings-api';
import MeetingCard from '../components/meetings/MeetingCard';
import MeetingSearch from '../components/meetings/MeetingSearch';
import BotLauncher from '../components/meetings/BotLauncher';
import './Meetings.css';

export default function Meetings() {
  const [meetings, setMeetings] = useState([]);
  const [activeBots, setActiveBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLauncher, setShowLauncher] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState({ platform: '', status: '' });

  const loadMeetings = async () => {
    setLoading(true);
    try {
      const [meetingsData, botsData] = await Promise.all([
        getMeetings({ page, ...filter }),
        getActiveBots(),
      ]);
      setMeetings(meetingsData.meetings || []);
      setTotalPages(meetingsData.totalPages || 1);
      setActiveBots(botsData.bots || []);
    } catch (err) {
      console.error('Failed to load meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeetings();
  }, [page, filter.platform, filter.status]);

  // Poll for active bots
  useEffect(() => {
    if (activeBots.length === 0) return;
    const interval = setInterval(loadMeetings, 10000);
    return () => clearInterval(interval);
  }, [activeBots.length]);

  const handleCreated = () => {
    loadMeetings();
  };

  return (
    <div className="meetings-page">
      <div className="meetings-header">
        <div className="meetings-header-left">
          <img src="/icon-call-recording.png" alt="Call Recording" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          <h1>Call Recording</h1>
        </div>
        <div className="meetings-header-right">
          <MeetingSearch />
          <button className="meetings-new-btn" onClick={() => setShowLauncher(true)}>
            <Plus size={18} />
            <span>New Meeting</span>
          </button>
        </div>
      </div>

      {activeBots.length > 0 && (
        <div className="meetings-active-banner">
          <span className="meetings-active-pulse" />
          {activeBots.length} active recording{activeBots.length > 1 ? 's' : ''}
        </div>
      )}

      <div className="meetings-filters">
        <select
          value={filter.platform}
          onChange={e => { setFilter(f => ({ ...f, platform: e.target.value })); setPage(1); }}
          className="meetings-filter-select"
        >
          <option value="">All Platforms</option>
          <option value="zoom">Zoom</option>
          <option value="google_meet">Google Meet</option>
          <option value="microsoft_teams">Teams</option>
        </select>
        <select
          value={filter.status}
          onChange={e => { setFilter(f => ({ ...f, status: e.target.value })); setPage(1); }}
          className="meetings-filter-select"
        >
          <option value="">All Status</option>
          <option value="processed">Processed</option>
          <option value="in_call_recording">Recording</option>
          <option value="done">Processing</option>
          <option value="fatal">Failed</option>
        </select>
      </div>

      {loading && meetings.length === 0 ? (
        <div className="meetings-loading">
          <div className="spinner" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="meetings-empty">
          <img src="/icon-call-recording.png" alt="Call Recording" style={{ width: 48, height: 48, objectFit: 'contain' }} />
          <h3>No meetings yet</h3>
          <p>Send a bot to record your next meeting and get AI-powered notes.</p>
          <button className="meetings-new-btn" onClick={() => setShowLauncher(true)}>
            <Plus size={18} />
            Record a Meeting
          </button>
        </div>
      ) : (
        <>
          <div className="meetings-grid">
            {meetings.map(m => (
              <MeetingCard key={m.id} meeting={m} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="meetings-pagination">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <span>Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {showLauncher && (
        <BotLauncher onClose={() => setShowLauncher(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
