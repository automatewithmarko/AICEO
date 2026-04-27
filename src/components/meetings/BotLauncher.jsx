import { useState, useEffect, useRef } from 'react';
import { Send, ChevronDown, Upload, X } from 'lucide-react';
import { createMeeting, getTemplates } from '../../lib/meetings-api';
import './BotLauncher.css';

const AVATAR_STORAGE_KEY = 'pp.botAvatar.v1';
const AVATAR_MAX_BYTES = 1024 * 1024; // 1MB

function readStoredAvatar() {
  try {
    const raw = localStorage.getItem(AVATAR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredAvatar(value) {
  try {
    if (value) localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(AVATAR_STORAGE_KEY);
  } catch {
    // localStorage may throw on quota exceeded — non-fatal, the avatar
    // still applies for this session.
  }
}

export default function BotLauncher({ onClose, onCreated }) {
  const [meetingUrl, setMeetingUrl] = useState('');
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState('general');
  const [botName, setBotName] = useState('PurelyPersonal Notetaker');
  const [botAvatar, setBotAvatar] = useState(() => readStoredAvatar()); // { dataUrl, mime, name }
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const dropdownRef = useRef(null);
  const avatarInputRef = useRef(null);

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

  const handleAvatarPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png)$/i.test(file.type)) {
      setError('Display photo must be a JPEG or PNG image.');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError('Display photo must be under 1MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const value = { dataUrl, mime: file.type, name: file.name };
      setBotAvatar(value);
      writeStoredAvatar(value);
      setError('');
    };
    reader.onerror = () => setError('Could not read image file.');
    reader.readAsDataURL(file);
  };

  const handleAvatarReset = () => {
    setBotAvatar(null);
    writeStoredAvatar(null);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!meetingUrl.trim()) return;

    setLoading(true);
    setError('');

    try {
      const avatarPayload = botAvatar?.dataUrl
        ? {
            bot_avatar_b64: botAvatar.dataUrl.split(',')[1],
            bot_avatar_mime: botAvatar.mime,
          }
        : {};
      const result = await createMeeting({
        meeting_url: meetingUrl.trim(),
        title: title.trim() || undefined,
        bot_name: botName.trim() || undefined,
        template,
        ...avatarPayload,
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

              <div className="bot-launcher-field">
                <label>Display Photo</label>
                <div className="bot-avatar-row">
                  <button
                    type="button"
                    className="bot-avatar-preview"
                    onClick={() => avatarInputRef.current?.click()}
                    title="Click to change photo"
                  >
                    {botAvatar?.dataUrl ? (
                      <img src={botAvatar.dataUrl} alt="Bot display" />
                    ) : (
                      <div className="bot-avatar-default">
                        <Upload size={16} />
                      </div>
                    )}
                  </button>
                  <div className="bot-avatar-actions">
                    <button
                      type="button"
                      className="bot-avatar-btn"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      {botAvatar ? 'Replace' : 'Upload photo'}
                    </button>
                    {botAvatar && (
                      <button
                        type="button"
                        className="bot-avatar-btn bot-avatar-btn--ghost"
                        onClick={handleAvatarReset}
                      >
                        <X size={12} /> Reset
                      </button>
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    style={{ display: 'none' }}
                    onChange={handleAvatarPick}
                  />
                </div>
                <span className="bot-avatar-hint">
                  JPEG or PNG, up to 1MB. Shown to participants in the meeting.
                </span>
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
