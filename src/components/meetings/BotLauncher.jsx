import { useState, useEffect, useRef } from 'react';
import { Send, ChevronDown } from 'lucide-react';
import { createMeeting, getTemplates } from '../../lib/meetings-api';
import './BotLauncher.css';

export default function BotLauncher({ onClose, onCreated }) {
  const [meetingUrl, setMeetingUrl] = useState('');
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState('general');
  const [botName, setBotName] = useState('PurelyPersonal Notetaker');
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    getTemplates().then(d => setTemplates(d.templates || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const templateOptions = templates.length
    ? templates.map(t => ({ value: t.slug, label: t.name }))
    : [{ value: 'general', label: 'General Meeting' }];

  const selectedLabel = templateOptions.find(o => o.value === template)?.label || 'Select...';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!meetingUrl.trim()) return;

    setLoading(true);
    setError('');

    try {
      const result = await createMeeting({
        meeting_url: meetingUrl.trim(),
        title: title.trim() || undefined,
        bot_name: botName.trim() || undefined,
        template,
      });
      onCreated?.(result.meeting);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bot-launcher-overlay" onClick={onClose}>
      <div className="bot-launcher" onClick={e => e.stopPropagation()}>
        <div className="bot-launcher-hero">
          <img src="/icon-call-recording.png" alt="Call Recording" className="bot-launcher-hero-icon" />
          <h3>Record a Meeting</h3>
          <div className="bot-launcher-platforms">
            <img src="/icon-zoom.png" alt="Zoom" />
            <img src="/icon-google-meet.png" alt="Google Meet" />
            <img src="/icon-teams.png" alt="Teams" />
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bot-launcher-main-row">
            <div className="bot-launcher-field bot-launcher-field--url">
              <label>Meeting URL *</label>
              <input
                type="url"
                placeholder="https://zoom.us/j/... or meet.google.com/..."
                value={meetingUrl}
                onChange={e => setMeetingUrl(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="bot-launcher-field bot-launcher-field--type" ref={dropdownRef}>
              <label>Meeting Type</label>
              <div className="custom-select-wrapper">
                <button
                  type="button"
                  className={`custom-select-trigger ${dropdownOpen ? 'custom-select-trigger--open' : ''}`}
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                >
                  <span>{selectedLabel}</span>
                  <ChevronDown size={14} className={`custom-select-chevron ${dropdownOpen ? 'custom-select-chevron--open' : ''}`} />
                </button>
                {dropdownOpen && (
                  <div className="custom-select-menu">
                    {templateOptions.map(opt => (
                      <div
                        key={opt.value}
                        className={`custom-select-option ${template === opt.value ? 'custom-select-option--selected' : ''}`}
                        onClick={() => { setTemplate(opt.value); setDropdownOpen(false); }}
                      >
                        {opt.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="bot-launcher-toggle-options"
            onClick={() => setShowOptions(!showOptions)}
          >
            <ChevronDown size={14} className={`bot-launcher-toggle-chevron ${showOptions ? 'bot-launcher-toggle-chevron--open' : ''}`} />
            {showOptions ? 'Hide options' : 'Show all options'}
          </button>

          {showOptions && (
            <div className="bot-launcher-extra-options">
              <div className="bot-launcher-field">
                <label>Meeting Description</label>
                <input
                  type="text"
                  placeholder="Optional — will auto-generate if empty"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>

              <div className="bot-launcher-field">
                <label>Display Name</label>
                <input
                  type="text"
                  value={botName}
                  onChange={e => setBotName(e.target.value)}
                />
              </div>
            </div>
          )}

          {error && <div className="bot-launcher-error">{error}</div>}

          <div className="bot-launcher-actions">
            <button type="button" className="bot-launcher-btn-close" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="bot-launcher-btn-join" disabled={loading || !meetingUrl.trim()}>
              {loading ? 'Joining...' : 'Join Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
