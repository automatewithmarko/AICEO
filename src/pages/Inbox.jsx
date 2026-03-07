import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Star, Paperclip, ChevronDown, Reply, Forward, Trash2, Archive, MoreHorizontal, Plus, X, Bold, Italic, Link2, ImagePlus, Sparkles, FileText, Check } from 'lucide-react';
import { MOCK_CALLS } from './Sales';
import './Pages.css';
import './Inbox.css';

const MOCK_EMAILS = [
  {
    id: 1,
    from: 'Alex Thompson',
    email: 'alex@thompson.com',
    subject: 'Re: Coaching Program — Next Steps',
    preview: 'Thanks for the call yesterday! I reviewed the proposal and I\'m ready to move forward with the Premium tier. Can we schedule onboarding for next week?',
    body: 'Hi,\n\nThanks for the call yesterday! I reviewed the proposal and I\'m ready to move forward with the Premium tier. Can we schedule onboarding for next week?\n\nI\'ve already looped in my team so they can be part of the kickoff. Let me know what times work for you.\n\nBest,\nAlex',
    date: 'Mar 7',
    time: '2:34 PM',
    read: false,
    starred: true,
    hasAttachment: false,
    labels: ['Client'],
  },
  {
    id: 2,
    from: 'Sarah Chen',
    email: 'sarah.chen@company.io',
    subject: 'Content Strategy Q2 — Draft Attached',
    preview: 'Hey! Attached is the Q2 content strategy draft we discussed. Let me know your thoughts on the LinkedIn cadence.',
    body: 'Hey!\n\nAttached is the Q2 content strategy draft we discussed during our last session. Let me know your thoughts on the LinkedIn cadence — I think we could push to 5x/week given the recent engagement numbers.\n\nAlso, I wanted to flag that the Instagram Reels are performing 3x better than static posts. Should we shift budget?\n\nTalk soon,\nSarah',
    date: 'Mar 7',
    time: '11:20 AM',
    read: false,
    starred: false,
    hasAttachment: true,
    labels: ['Client'],
  },
  {
    id: 3,
    from: 'Stripe',
    email: 'notifications@stripe.com',
    subject: 'Payment received — $2,500.00',
    preview: 'You received a payment of $2,500.00 from Mike Johnson for "1:1 Consulting Package".',
    body: 'You received a payment of $2,500.00 from Mike Johnson for "1:1 Consulting Package".\n\nTransaction ID: pi_3Ox2kL2eZvKYlo2C1\nDate: March 7, 2026\nStatus: Succeeded\n\nView this payment in your Stripe Dashboard.',
    date: 'Mar 6',
    time: '4:15 PM',
    read: true,
    starred: false,
    hasAttachment: false,
    labels: ['Payment'],
  },
  {
    id: 4,
    from: 'Emily Davis',
    email: 'emily.d@startup.co',
    subject: 'Question about your Online Course',
    preview: 'Hi there! I came across your course and had a few questions about the curriculum. Is there a preview or trial available?',
    body: 'Hi there!\n\nI came across your online course and had a few questions about the curriculum. Specifically:\n\n1. How many modules are included?\n2. Is there a preview or trial available?\n3. Do you offer any group discounts?\n\nWe have a team of 8 who would be interested.\n\nThanks,\nEmily',
    date: 'Mar 6',
    time: '9:42 AM',
    read: true,
    starred: false,
    hasAttachment: false,
    labels: ['Lead'],
  },
  {
    id: 5,
    from: 'Jordan Lee',
    email: 'jordan@lee-consulting.com',
    subject: 'Monthly Report — February Results',
    preview: 'Attached is the February performance report. Revenue is up 23% MoM and we hit our lead gen target for the first time.',
    body: 'Hi,\n\nAttached is the February performance report. Here are the highlights:\n\n• Revenue: $47,200 (+23% MoM)\n• New leads: 142 (target was 130)\n• Conversion rate: 4.2% (up from 3.8%)\n• Top channel: LinkedIn (38% of leads)\n\nLet\'s discuss the March targets on our next call.\n\nBest,\nJordan',
    date: 'Mar 5',
    time: '3:00 PM',
    read: true,
    starred: true,
    hasAttachment: true,
    labels: ['Client'],
  },
  {
    id: 6,
    from: 'Whop',
    email: 'noreply@whop.com',
    subject: 'New member joined your community',
    preview: 'A new member has joined your "Growth Accelerator" community. You now have 234 active members.',
    body: 'A new member has joined your "Growth Accelerator" community.\n\nNew member: Chris Martinez\nJoined: March 5, 2026\nPlan: Monthly ($49/mo)\n\nYou now have 234 active members.\n\nView your community dashboard for more details.',
    date: 'Mar 5',
    time: '10:15 AM',
    read: true,
    starred: false,
    hasAttachment: false,
    labels: ['Notification'],
  },
];

const FOLDERS = ['Inbox', 'Starred', 'Sent', 'Drafts', 'Archive'];

const AI_DRAFT = `Hi there,

Thank you for reaching out! I wanted to follow up on our recent conversation and share a few thoughts.

Based on what we discussed, I believe the next steps would be:

1. **Review the proposal** I\'ve attached
2. **Schedule a follow-up call** for next week
3. **Share any feedback** you have on the timeline

I\'m confident we can make this work within your budget and timeline. Please don\'t hesitate to reach out if you have any questions.

Looking forward to hearing from you!

Best regards,
Marko`;

function insertAtCursor(textareaRef, before, after, placeholder) {
  const ta = textareaRef.current;
  if (!ta) return '';
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;
  const selected = text.substring(start, end);
  const insert = selected || placeholder;
  return text.substring(0, start) + before + insert + after + text.substring(end);
}

export default function Inbox() {
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [activeFolder, setActiveFolder] = useState('Inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [emails, setEmails] = useState(MOCK_EMAILS);

  // Compose state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [aiPopoverOpen, setAiPopoverOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextTab, setContextTab] = useState('calls');
  const [selectedCalls, setSelectedCalls] = useState(new Set());
  const [selectedContextEmails, setSelectedContextEmails] = useState(new Set());

  const bodyRef = useRef(null);
  const fileInputRef = useRef(null);
  const contextRef = useRef(null);
  const aiRef = useRef(null);

  const toggleStar = (id, e) => {
    e.stopPropagation();
    setEmails((prev) => prev.map((em) => em.id === id ? { ...em, starred: !em.starred } : em));
  };

  const markAsRead = (id) => {
    setEmails((prev) => prev.map((em) => em.id === id ? { ...em, read: true } : em));
  };

  const openEmail = (email) => {
    markAsRead(email.id);
    setSelectedEmail(email);
  };

  const filteredEmails = emails.filter((em) => {
    if (activeFolder === 'Starred') return em.starred;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return em.from.toLowerCase().includes(q) || em.subject.toLowerCase().includes(q) || em.preview.toLowerCase().includes(q);
    }
    return true;
  });

  const unreadCount = emails.filter((em) => !em.read).length;

  // Compose helpers
  const resetCompose = useCallback(() => {
    setComposeOpen(false);
    setComposeTo('');
    setComposeSubject('');
    setComposeBody('');
    setLinkPopoverOpen(false);
    setLinkUrl('');
    setAiPopoverOpen(false);
    setAiPrompt('');
    setAiLoading(false);
    setContextOpen(false);
    setContextTab('calls');
    setSelectedCalls(new Set());
    setSelectedContextEmails(new Set());
  }, []);

  const handleBold = () => {
    setComposeBody(insertAtCursor(bodyRef, '**', '**', 'bold'));
  };

  const handleItalic = () => {
    setComposeBody(insertAtCursor(bodyRef, '_', '_', 'italic'));
  };

  const handleLinkInsert = () => {
    if (!linkUrl) return;
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selected = text.substring(start, end) || 'link text';
    setComposeBody(text.substring(0, start) + '[' + selected + '](' + linkUrl + ')' + text.substring(end));
    setLinkPopoverOpen(false);
    setLinkUrl('');
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ta = bodyRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const text = ta.value;
    setComposeBody(text.substring(0, pos) + '![image](' + file.name + ')' + text.substring(pos));
    e.target.value = '';
  };

  const handleAiGenerate = () => {
    if (!aiPrompt) return;
    setAiLoading(true);
    setTimeout(() => {
      setComposeBody(AI_DRAFT);
      setAiLoading(false);
      setAiPopoverOpen(false);
      setAiPrompt('');
    }, 1500);
  };

  const toggleCallContext = (id) => {
    setSelectedCalls((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEmailContext = (id) => {
    setSelectedContextEmails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Close context/ai popovers on outside click
  useEffect(() => {
    if (!contextOpen && !aiPopoverOpen) return;
    const handleClick = (e) => {
      if (contextOpen && contextRef.current && !contextRef.current.contains(e.target)) {
        setContextOpen(false);
      }
      if (aiPopoverOpen && aiRef.current && !aiRef.current.contains(e.target)) {
        setAiPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextOpen, aiPopoverOpen]);

  const contextCount = selectedCalls.size + selectedContextEmails.size;

  return (
    <div className="inbox-page">
      <div className="inbox-layout">
        {/* Sidebar */}
        <div className="inbox-sidebar">
          {FOLDERS.map((folder) => (
            <button
              key={folder}
              className={`inbox-folder ${activeFolder === folder ? 'inbox-folder--active' : ''}`}
              onClick={() => { setActiveFolder(folder); setSelectedEmail(null); }}
            >
              <span>{folder}</span>
              {folder === 'Inbox' && unreadCount > 0 && (
                <span className="inbox-folder-badge">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Email List */}
        <div className="inbox-list">
          <div className="inbox-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="inbox-emails">
            {filteredEmails.map((email) => (
              <div
                key={email.id}
                className={`inbox-email-row ${!email.read ? 'inbox-email-row--unread' : ''} ${selectedEmail?.id === email.id ? 'inbox-email-row--selected' : ''}`}
                onClick={() => openEmail(email)}
              >
                <button
                  className={`inbox-star ${email.starred ? 'inbox-star--active' : ''}`}
                  onClick={(e) => toggleStar(email.id, e)}
                >
                  <Star size={14} fill={email.starred ? 'currentColor' : 'none'} />
                </button>
                <div className="inbox-email-content">
                  <div className="inbox-email-top">
                    <span className="inbox-email-from">{email.from}</span>
                    <span className="inbox-email-date">{email.date}</span>
                  </div>
                  <div className="inbox-email-subject">
                    {email.subject}
                    {email.hasAttachment && <Paperclip size={12} className="inbox-attachment-icon" />}
                  </div>
                  <div className="inbox-email-preview">{email.preview}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Email Detail */}
        <div className="inbox-detail">
          {selectedEmail ? (
            <>
              <div className="inbox-detail-header">
                <h2 className="inbox-detail-subject">{selectedEmail.subject}</h2>
                <div className="inbox-detail-actions">
                  <button className="inbox-detail-action" title="Reply"><Reply size={16} /></button>
                  <button className="inbox-detail-action" title="Forward"><Forward size={16} /></button>
                  <button className="inbox-detail-action" title="Archive"><Archive size={16} /></button>
                  <button className="inbox-detail-action" title="Delete"><Trash2 size={16} /></button>
                  <button className="inbox-detail-action" title="More"><MoreHorizontal size={16} /></button>
                </div>
              </div>
              <div className="inbox-detail-meta">
                <div className="inbox-detail-avatar">{selectedEmail.from[0]}</div>
                <div className="inbox-detail-sender">
                  <span className="inbox-detail-name">{selectedEmail.from}</span>
                  <span className="inbox-detail-email">&lt;{selectedEmail.email}&gt;</span>
                </div>
                <span className="inbox-detail-time">{selectedEmail.date}, {selectedEmail.time}</span>
              </div>
              {selectedEmail.labels.length > 0 && (
                <div className="inbox-detail-labels">
                  {selectedEmail.labels.map((label) => (
                    <span key={label} className="inbox-detail-label">{label}</span>
                  ))}
                </div>
              )}
              <div className="inbox-detail-body">
                {selectedEmail.body.split('\n').map((line, i) => (
                  <p key={i}>{line || '\u00A0'}</p>
                ))}
              </div>
              <div className="inbox-reply-bar">
                <input type="text" className="inbox-reply-input" placeholder="Write a reply..." />
                <button className="inbox-reply-btn">Send</button>
              </div>
            </>
          ) : (
            <div className="inbox-detail-empty">
              <p>Select an email to read</p>
            </div>
          )}
        </div>
      </div>

      {/* FAB */}
      <button className="inbox-compose-fab" onClick={() => setComposeOpen(true)}>
        <Plus size={18} />
        <span className="inbox-compose-fab-label">Write new email</span>
      </button>

      {/* Compose Panel */}
      {composeOpen && (
        <div className="inbox-compose-panel">
            {/* Header */}
            <div className="inbox-compose-header">
              <h3 className="inbox-compose-title">New Email</h3>
              <button className="inbox-compose-close" onClick={resetCompose}>
                <X size={18} />
              </button>
            </div>

            {/* To */}
            <div className="inbox-compose-field">
              <label className="inbox-compose-label">To</label>
              <input
                type="email"
                className="inbox-compose-input"
                placeholder="recipient@email.com"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
              />
            </div>

            {/* Subject */}
            <div className="inbox-compose-field">
              <label className="inbox-compose-label">Subject</label>
              <input
                type="text"
                className="inbox-compose-input"
                placeholder="Email subject"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
              />
            </div>

            {/* Toolbar */}
            <div className="inbox-compose-toolbar">
              <div className="inbox-compose-toolbar-left">
                <button className="inbox-compose-tool" title="Bold" onClick={handleBold}>
                  <Bold size={15} />
                </button>
                <button className="inbox-compose-tool" title="Italic" onClick={handleItalic}>
                  <Italic size={15} />
                </button>
                <div className="inbox-compose-tool-wrap">
                  <button className="inbox-compose-tool" title="Insert link" onClick={() => { setLinkPopoverOpen(!linkPopoverOpen); setAiPopoverOpen(false); setContextOpen(false); }}>
                    <Link2 size={15} />
                  </button>
                  {linkPopoverOpen && (
                    <div className="inbox-compose-link-popover">
                      <input
                        type="url"
                        className="inbox-compose-link-input"
                        placeholder="https://..."
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLinkInsert()}
                        autoFocus
                      />
                      <button className="inbox-compose-link-btn" onClick={handleLinkInsert}>Insert</button>
                    </div>
                  )}
                </div>
                <button className="inbox-compose-tool" title="Upload image" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus size={15} />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
              </div>

              <div className="inbox-compose-toolbar-divider" />

              <div className="inbox-compose-toolbar-right">
                <div className="inbox-compose-tool-wrap" ref={aiRef}>
                  <button
                    className="inbox-compose-ai-btn"
                    onClick={() => { setAiPopoverOpen(!aiPopoverOpen); setLinkPopoverOpen(false); setContextOpen(false); }}
                  >
                    <Sparkles size={14} />
                    <span>{aiLoading ? 'Generating...' : 'Write with AI'}</span>
                  </button>
                  {aiPopoverOpen && (
                    <div className="inbox-compose-ai-popover">
                      <input
                        type="text"
                        className="inbox-compose-ai-input"
                        placeholder="Describe what you want to write..."
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAiGenerate()}
                        autoFocus
                      />
                      <button
                        className="inbox-compose-ai-generate"
                        onClick={handleAiGenerate}
                        disabled={aiLoading || !aiPrompt}
                      >
                        {aiLoading ? 'Generating...' : 'Generate'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="inbox-compose-tool-wrap" ref={contextRef}>
                  <button
                    className="inbox-compose-context-btn"
                    onClick={() => { setContextOpen(!contextOpen); setLinkPopoverOpen(false); setAiPopoverOpen(false); }}
                  >
                    <FileText size={14} />
                    <span>Add Context</span>
                    {contextCount > 0 && <span className="inbox-compose-context-badge">{contextCount}</span>}
                  </button>
                  {contextOpen && (
                    <div className="inbox-compose-context-panel">
                      <div className="inbox-compose-context-tabs">
                        <button
                          className={`inbox-compose-context-tab ${contextTab === 'calls' ? 'inbox-compose-context-tab--active' : ''}`}
                          onClick={() => setContextTab('calls')}
                        >
                          Sales Calls
                        </button>
                        <button
                          className={`inbox-compose-context-tab ${contextTab === 'emails' ? 'inbox-compose-context-tab--active' : ''}`}
                          onClick={() => setContextTab('emails')}
                        >
                          Emails
                        </button>
                      </div>
                      <div className="inbox-compose-context-list">
                        {contextTab === 'calls' ? (
                          MOCK_CALLS.map((call) => (
                            <button
                              key={call.id}
                              className={`inbox-compose-context-row ${selectedCalls.has(call.id) ? 'inbox-compose-context-row--active' : ''}`}
                              onClick={() => toggleCallContext(call.id)}
                            >
                              <div className="inbox-compose-context-check">
                                {selectedCalls.has(call.id) && <Check size={12} />}
                              </div>
                              <div className="inbox-compose-context-info">
                                <span className="inbox-compose-context-name">{call.name}</span>
                                <span className="inbox-compose-context-date">{call.date}</span>
                              </div>
                            </button>
                          ))
                        ) : (
                          MOCK_EMAILS.map((em) => (
                            <button
                              key={em.id}
                              className={`inbox-compose-context-row ${selectedContextEmails.has(em.id) ? 'inbox-compose-context-row--active' : ''}`}
                              onClick={() => toggleEmailContext(em.id)}
                            >
                              <div className="inbox-compose-context-check">
                                {selectedContextEmails.has(em.id) && <Check size={12} />}
                              </div>
                              <div className="inbox-compose-context-info">
                                <span className="inbox-compose-context-name">{em.from}</span>
                                <span className="inbox-compose-context-date">{em.subject}</span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Context Pills */}
            {contextCount > 0 && (
              <div className="inbox-compose-context-pills">
                {[...selectedCalls].map((id) => {
                  const call = MOCK_CALLS.find((c) => c.id === id);
                  return call ? (
                    <span key={`call-${id}`} className="inbox-compose-context-pill">
                      {call.name}
                      <button className="inbox-compose-context-pill-x" onClick={() => toggleCallContext(id)}><X size={10} /></button>
                    </span>
                  ) : null;
                })}
                {[...selectedContextEmails].map((id) => {
                  const em = MOCK_EMAILS.find((e) => e.id === id);
                  return em ? (
                    <span key={`email-${id}`} className="inbox-compose-context-pill">
                      {em.from}: {em.subject}
                      <button className="inbox-compose-context-pill-x" onClick={() => toggleEmailContext(id)}><X size={10} /></button>
                    </span>
                  ) : null;
                })}
              </div>
            )}

            {/* Body */}
            <textarea
              ref={bodyRef}
              className="inbox-compose-body"
              placeholder="Write your email here... (supports markdown)"
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
            />

            {/* Footer */}
            <div className="inbox-compose-footer">
              <button className="inbox-compose-discard" onClick={resetCompose}>Discard</button>
              <button className="inbox-compose-send" onClick={resetCompose}>Send</button>
            </div>
        </div>
      )}
    </div>
  );
}
