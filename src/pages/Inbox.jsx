import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useOutletContext } from 'react-router-dom';
import { Search, Star, Paperclip, ChevronDown, Reply, Forward, Trash2, Archive, MoreHorizontal, Plus, X, Bold, Italic, Link2, ImagePlus, Sparkles, FileText, Check, RefreshCw, Mail, Settings, LogOut, Loader2 } from 'lucide-react';
import { MOCK_CALLS } from './Sales';
import {
  addEmailAccount, syncEmailAccount,
  getEmails, getEmail, updateEmail, sendEmailApi, saveDraft, getEmailCounts, deleteEmail,
} from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './Pages.css';
import './Inbox.css';

export const MOCK_EMAILS = [];

const FOLDERS = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'starred', label: 'Starred' },
  { key: 'sent', label: 'Sent' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'archive', label: 'Archive' },
];

const PROVIDER_PRESETS = {
  gmail: {
    label: 'Gmail',
    imap_host: 'imap.gmail.com', imap_port: 993,
    smtp_host: 'smtp.gmail.com', smtp_port: 465,
    icon: <img src="/icon-gmail.webp" alt="Gmail" style={{ width: 28, height: 28, objectFit: 'contain' }} />,
  },
  outlook: {
    label: 'Outlook',
    imap_host: 'outlook.office365.com', imap_port: 993,
    smtp_host: 'smtp-mail.outlook.com', smtp_port: 587,
    icon: <img src="/icon-outlook.png" alt="Outlook" style={{ width: 28, height: 28, objectFit: 'contain' }} />,
  },
  imap: {
    label: 'Custom SMTP',
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <path d="M22 6.5l-10 6.5L2 6.5"/>
      </svg>
    ),
  },
};

const AI_DRAFT = `Hi there,

Thank you for reaching out! I wanted to follow up on our recent conversation and share a few thoughts.

Based on what we discussed, I believe the next steps would be:

1. **Review the proposal** I've attached
2. **Schedule a follow-up call** for next week
3. **Share any feedback** you have on the timeline

I'm confident we can make this work within your budget and timeline. Please don't hesitate to reach out if you have any questions.

Looking forward to hearing from you!

Best regards`;

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

function generatePreview(body) {
  if (!body) return '';
  return body.replace(/\n/g, ' ').slice(0, 120);
}

export default function Inbox() {
  // Shared account state from Layout
  const {
    accounts, selectedAccountId, setSelectedAccountId,
    addAccountOpen, setAddAccountOpen, loadAccounts, handleRemoveAccount,
  } = useOutletContext();
  const { user } = useAuth();

  // Data state
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [selectedEmailFull, setSelectedEmailFull] = useState(null);
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 30;
  const [syncProgress, setSyncProgress] = useState(null); // { synced: N } or null

  // Add account modal
  const [accountForm, setAccountForm] = useState({ provider: 'gmail', email: '', display_name: '', username: '', password: '', imap_host: '', imap_port: 993, smtp_host: '', smtp_port: 465 });
  const [accountError, setAccountError] = useState('');
  const [accountSaving, setAccountSaving] = useState(false);

  // Compose state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState('new'); // 'new', 'reply', 'forward'
  const [composeAccountId, setComposeAccountId] = useState('');
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeInReplyTo, setComposeInReplyTo] = useState(null);
  const [composeReferences, setComposeReferences] = useState(null);
  const [composeDraftId, setComposeDraftId] = useState(null);
  const [composeSending, setComposeSending] = useState(false);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [aiPopoverOpen, setAiPopoverOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextTab, setContextTab] = useState('calls');
  const [selectedCalls, setSelectedCalls] = useState(new Set());
  const [selectedContextEmails, setSelectedContextEmails] = useState(new Set());

  // Reply bar state
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);

  const bodyRef = useRef(null);
  const fileInputRef = useRef(null);
  const contextRef = useRef(null);
  const aiRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Data fetching ──

  const emailCountRef = useRef(0);
  useEffect(() => { emailCountRef.current = emails.length; }, [emails.length]);

  const loadEmails = useCallback(async (folder, search, accountId, append = false) => {
    const params = { limit: PAGE_SIZE, offset: append ? emailCountRef.current : 0 };
    if (folder === 'starred') {
      params.starred = true;
    } else {
      params.folder = folder || 'inbox';
    }
    if (search) params.search = search;
    if (accountId) params.accountId = accountId;
    const { emails: data } = await getEmails(params);
    const fetched = data || [];
    if (append) {
      setEmails(prev => [...prev, ...fetched]);
    } else {
      setEmails(fetched);
    }
    setHasMore(fetched.length >= PAGE_SIZE);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadEmails(activeFolder, searchQuery, selectedAccountId, true);
    setLoadingMore(false);
  }, [loadingMore, hasMore, activeFolder, searchQuery, selectedAccountId, loadEmails]);

  const loadCounts = useCallback(async (accountId) => {
    const { counts: c } = await getEmailCounts(accountId);
    setCounts(c || {});
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([
        loadEmails('inbox', '', null),
        loadCounts(null),
      ]);
      setLoading(false);
    })();
  }, [loadEmails, loadCounts]);

  // Set default compose account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && !composeAccountId) {
      setComposeAccountId(accounts[0].id);
    }
  }, [accounts]);

  // Reload on folder/search/account change
  useEffect(() => {
    if (loading) return;
    loadEmails(activeFolder, searchQuery, selectedAccountId);
  }, [activeFolder, selectedAccountId, loading, loadEmails]);

  // Debounced search
  useEffect(() => {
    if (loading) return;
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      loadEmails(activeFolder, searchQuery, selectedAccountId);
    }, 300);
    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery]);

  // Realtime: subscribe to new emails via Supabase Realtime
  useEffect(() => {
    if (!user?.id || loading) return;

    const channel = supabase
      .channel('emails-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'emails',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const newEmail = payload.new;
        // Only add if it matches current folder/account filter
        const matchesFolder = activeFolder === 'starred'
          ? newEmail.is_starred
          : (newEmail.folder || 'inbox') === (activeFolder || 'inbox');
        const matchesAccount = !selectedAccountId || newEmail.account_id === selectedAccountId;

        if (matchesFolder && matchesAccount) {
          setEmails(prev => {
            // Dedup
            if (prev.some(e => e.id === newEmail.id)) return prev;
            return [newEmail, ...prev];
          });
        }
        // Always refresh counts
        loadCounts(selectedAccountId);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'emails',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const updated = payload.new;
        setEmails(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e));
        if (selectedEmail?.id === updated.id) {
          setSelectedEmailFull(prev => prev ? { ...prev, ...updated } : prev);
        }
        loadCounts(selectedAccountId);
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'emails',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setEmails(prev => prev.filter(e => e.id !== payload.old.id));
        loadCounts(selectedAccountId);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, loading, activeFolder, selectedAccountId]);

  // ── Account actions ──

  const handleAddAccount = async () => {
    setAccountError('');
    setAccountSaving(true);
    try {
      const preset = PROVIDER_PRESETS[accountForm.provider] || {};
      const result = await addEmailAccount({
        provider: accountForm.provider,
        email: accountForm.email,
        display_name: accountForm.display_name,
        username: accountForm.username || accountForm.email,
        password: accountForm.password,
        imap_host: accountForm.imap_host || preset.imap_host,
        imap_port: accountForm.imap_port || preset.imap_port,
        smtp_host: accountForm.smtp_host || preset.smtp_host,
        smtp_port: accountForm.smtp_port || preset.smtp_port,
      });
      const accs = await loadAccounts();
      if (accs.length === 1) setComposeAccountId(accs[0].id);
      setAddAccountOpen(false);
      setAccountForm({ provider: 'gmail', email: '', display_name: '', username: '', password: '', imap_host: '', imap_port: 993, smtp_host: '', smtp_port: PROVIDER_PRESETS.gmail.smtp_port });
      if (result.warning) {
        showToast('Account connected — sending may be limited', 'error');
      } else {
        showToast('Email account connected');
      }
      // Auto-sync the new account — poll for progress while syncing
      const newAcc = accs[accs.length - 1];
      if (newAcc) {
        setSyncing(true);
        setSyncProgress({ synced: 0 });
        // Poll every 2s to show emails as they arrive
        const pollId = setInterval(async () => {
          try {
            await loadEmails(activeFolder, searchQuery, selectedAccountId);
            await loadCounts(selectedAccountId);
            setSyncProgress((prev) => {
              const count = emails.length;
              return count > (prev?.synced || 0) ? { synced: count } : prev;
            });
          } catch {}
        }, 2000);
        try {
          const syncResult = await syncEmailAccount(newAcc.id);
          clearInterval(pollId);
          await loadEmails(activeFolder, searchQuery, selectedAccountId);
          await loadCounts(selectedAccountId);
          showToast(`Synced ${syncResult.synced} emails`);
        } catch (err) {
          clearInterval(pollId);
          showToast(err.message, 'error');
        }
        setSyncing(false);
        setSyncProgress(null);
      }
    } catch (err) {
      setAccountError(err.message);
    }
    setAccountSaving(false);
  };

  const handleSync = async () => {
    if (accounts.length === 0) return;
    setSyncing(true);
    setSyncProgress({ synced: 0 });
    // Poll every 2s so user sees emails appearing
    const pollId = setInterval(async () => {
      try {
        await loadEmails(activeFolder, searchQuery, selectedAccountId);
        await loadCounts(selectedAccountId);
      } catch {}
    }, 2000);
    try {
      let totalSynced = 0;
      for (const acc of accounts) {
        if (selectedAccountId && acc.id !== selectedAccountId) continue;
        const result = await syncEmailAccount(acc.id);
        totalSynced += result.synced;
      }
      clearInterval(pollId);
      await loadEmails(activeFolder, searchQuery, selectedAccountId);
      await loadCounts(selectedAccountId);
      showToast(`Synced ${totalSynced} new emails`);
    } catch (err) {
      clearInterval(pollId);
      showToast(err.message, 'error');
    }
    setSyncing(false);
    setSyncProgress(null);
  };

  // ── Email actions ──

  const openEmail = async (email) => {
    setSelectedEmail(email);
    setReplyText('');
    // Mark as read
    if (!email.is_read) {
      await updateEmail(email.id, { is_read: true });
      setEmails((prev) => prev.map((em) => em.id === email.id ? { ...em, is_read: true } : em));
      loadCounts(selectedAccountId);
    }
    // Load full body
    const full = await getEmail(email.id);
    setSelectedEmailFull(full);
  };

  const toggleStar = async (id, e) => {
    e.stopPropagation();
    const email = emails.find((em) => em.id === id);
    if (!email) return;
    const newVal = !email.is_starred;
    setEmails((prev) => prev.map((em) => em.id === id ? { ...em, is_starred: newVal } : em));
    if (selectedEmail?.id === id) {
      setSelectedEmail((prev) => prev ? { ...prev, is_starred: newVal } : prev);
    }
    await updateEmail(id, { is_starred: newVal });
  };

  const handleArchive = async () => {
    if (!selectedEmail) return;
    await updateEmail(selectedEmail.id, { folder: 'archive' });
    setEmails((prev) => prev.filter((em) => em.id !== selectedEmail.id));
    setSelectedEmail(null);
    setSelectedEmailFull(null);
    showToast('Moved to archive');
    loadCounts(selectedAccountId);
  };

  const handleDelete = async () => {
    if (!selectedEmail) return;
    await updateEmail(selectedEmail.id, { folder: 'trash' });
    setEmails((prev) => prev.filter((em) => em.id !== selectedEmail.id));
    setSelectedEmail(null);
    setSelectedEmailFull(null);
    showToast('Moved to trash');
    loadCounts(selectedAccountId);
  };

  const handleReply = () => {
    if (!selectedEmail) return;
    const full = selectedEmailFull || selectedEmail;
    setComposeMode('reply');
    setComposeAccountId(full.account_id || accounts[0]?.id || '');
    setComposeTo(full.from_email || '');
    setComposeSubject(full.subject?.startsWith('Re:') ? full.subject : `Re: ${full.subject || ''}`);
    setComposeBody(`\n\n---\nOn ${new Date(full.date).toLocaleDateString()}, ${full.from_name || full.from_email} wrote:\n> ${(full.body_text || '').split('\n').join('\n> ')}`);
    setComposeInReplyTo(full.message_id || null);
    setComposeReferences(full.thread_id ? [full.thread_id] : null);
    setComposeDraftId(null);
    setComposeOpen(true);
  };

  const handleForward = () => {
    if (!selectedEmail) return;
    const full = selectedEmailFull || selectedEmail;
    setComposeMode('forward');
    setComposeAccountId(full.account_id || accounts[0]?.id || '');
    setComposeTo('');
    setComposeSubject(full.subject?.startsWith('Fwd:') ? full.subject : `Fwd: ${full.subject || ''}`);
    setComposeBody(`\n\n--- Forwarded message ---\nFrom: ${full.from_name || ''} <${full.from_email || ''}>\nDate: ${new Date(full.date).toLocaleDateString()}\nSubject: ${full.subject || ''}\n\n${full.body_text || ''}`);
    setComposeInReplyTo(null);
    setComposeReferences(null);
    setComposeDraftId(null);
    setComposeOpen(true);
  };

  const handleQuickReply = async () => {
    if (!selectedEmail || !replyText.trim()) return;
    const full = selectedEmailFull || selectedEmail;
    setReplySending(true);
    try {
      await sendEmailApi({
        account_id: full.account_id || accounts[0]?.id,
        to: [{ name: full.from_name || '', email: full.from_email }],
        subject: full.subject?.startsWith('Re:') ? full.subject : `Re: ${full.subject || ''}`,
        body_text: replyText,
        in_reply_to: full.message_id || undefined,
        references: full.thread_id ? [full.thread_id] : undefined,
      });
      setReplyText('');
      showToast('Reply sent');
    } catch (err) {
      showToast(err.message, 'error');
    }
    setReplySending(false);
  };

  // ── Compose helpers ──

  const resetCompose = useCallback(() => {
    setComposeOpen(false);
    setComposeMode('new');
    setComposeTo('');
    setComposeSubject('');
    setComposeBody('');
    setComposeInReplyTo(null);
    setComposeReferences(null);
    setComposeDraftId(null);
    setComposeSending(false);
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

  const openNewCompose = () => {
    resetCompose();
    setComposeAccountId(accounts[0]?.id || '');
    setComposeOpen(true);
  };

  const openDraft = (email) => {
    setComposeMode('new');
    setComposeAccountId(email.account_id || accounts[0]?.id || '');
    setComposeTo(email.to_emails?.[0]?.email || '');
    setComposeSubject(email.subject || '');
    setComposeBody(email.body_text || '');
    setComposeDraftId(email.id);
    setComposeOpen(true);
  };

  const handleSend = async () => {
    if (!composeTo.trim() || !composeAccountId) {
      showToast('Recipient and account are required', 'error');
      return;
    }
    setComposeSending(true);
    try {
      await sendEmailApi({
        account_id: composeAccountId,
        to: [{ name: '', email: composeTo.trim() }],
        subject: composeSubject,
        body_text: composeBody,
        in_reply_to: composeInReplyTo || undefined,
        references: composeReferences || undefined,
      });
      // Delete draft if was editing one
      if (composeDraftId) {
        await deleteEmail(composeDraftId);
      }
      resetCompose();
      showToast('Email sent');
      if (activeFolder === 'sent') {
        loadEmails('sent', searchQuery, selectedAccountId);
      }
      loadCounts(selectedAccountId);
    } catch (err) {
      showToast(err.message, 'error');
      setComposeSending(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!composeAccountId) return;
    try {
      const { draft_id } = await saveDraft({
        account_id: composeAccountId,
        to: composeTo ? [{ name: '', email: composeTo.trim() }] : [],
        subject: composeSubject,
        body_text: composeBody,
        draft_id: composeDraftId || undefined,
      });
      setComposeDraftId(draft_id);
      showToast('Draft saved');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

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

  // Close popovers on outside click
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

  const hasAccounts = accounts.length > 0;
  const displayEmail = selectedEmailFull || selectedEmail;

  return (
    <div className="inbox-page">
      <div className="inbox-layout">
        {/* Sidebar */}
        <div className="inbox-sidebar">
          {FOLDERS.map((folder) => (
            <button
              key={folder.key}
              className={`inbox-folder ${activeFolder === folder.key ? 'inbox-folder--active' : ''}`}
              onClick={() => { setActiveFolder(folder.key); setSelectedEmail(null); setSelectedEmailFull(null); }}
            >
              <span>{folder.label}</span>
              {folder.key === 'inbox' && (counts.inbox_unread || 0) > 0 && (
                <span className="inbox-folder-badge">{counts.inbox_unread}</span>
              )}
              {folder.key === 'drafts' && (counts.drafts || 0) > 0 && (
                <span className="inbox-folder-badge inbox-folder-badge--muted">{counts.drafts}</span>
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
            {hasAccounts && (
              <>
                <button className={`inbox-sync-btn ${syncing ? 'inbox-sync-btn--spinning' : ''}`} onClick={handleSync} title="Sync emails" disabled={syncing}>
                  <RefreshCw size={14} />
                </button>
                {syncing && (
                  <span style={{ fontSize: 11, color: '#888', marginLeft: 6, whiteSpace: 'nowrap' }}>
                    Syncing... {emails.length > 0 ? `${emails.length} emails` : ''}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="inbox-emails">
            {loading ? (
              <div className="inbox-loading">
                <Loader2 size={20} className="inbox-spinner" />
                <span>Loading...</span>
              </div>
            ) : !hasAccounts ? (
              <div className="inbox-empty-state">
                <Mail size={32} />
                <p>No email accounts connected</p>
                <button className="inbox-empty-btn" onClick={() => setAddAccountOpen(true)}>
                  <Plus size={14} /> Add Account
                </button>
              </div>
            ) : emails.length === 0 ? (
              <div className="inbox-empty-state">
                <Mail size={32} />
                <p>
                  {activeFolder === 'inbox' ? 'Your inbox is empty' :
                   activeFolder === 'starred' ? 'No starred emails' :
                   activeFolder === 'sent' ? 'No sent emails' :
                   activeFolder === 'drafts' ? 'No drafts' :
                   activeFolder === 'archive' ? 'Archive is empty' : 'No emails'}
                </p>
              </div>
            ) : (
              <>
              {emails.map((email) => (
                <div
                  key={email.id}
                  className={`inbox-email-row ${!email.is_read ? 'inbox-email-row--unread' : ''} ${selectedEmail?.id === email.id ? 'inbox-email-row--selected' : ''}`}
                  onClick={() => activeFolder === 'drafts' ? openDraft(email) : openEmail(email)}
                >
                  <button
                    className={`inbox-star ${email.is_starred ? 'inbox-star--active' : ''}`}
                    onClick={(e) => toggleStar(email.id, e)}
                  >
                    <Star size={14} fill={email.is_starred ? 'currentColor' : 'none'} />
                  </button>
                  <div className="inbox-email-content">
                    <div className="inbox-email-top">
                      <span className="inbox-email-from">
                        {activeFolder === 'sent' ? (email.to_emails?.[0]?.email || 'Unknown') : (email.from_name || email.from_email || 'Unknown')}
                      </span>
                      <span className="inbox-email-date">{new Date(email.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="inbox-email-subject">
                      {email.subject || '(no subject)'}
                      {email.has_attachments && <Paperclip size={12} className="inbox-attachment-icon" />}
                    </div>
                    <div className="inbox-email-preview">{generatePreview(email.body_text)}</div>
                  </div>
                </div>
              ))}
              {hasMore && (
                <button className="inbox-load-more" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              )}
              </>
            )}
          </div>
        </div>

        {/* Email Detail */}
        <div className="inbox-detail">
          {displayEmail && activeFolder !== 'drafts' ? (
            <>
              <div className="inbox-detail-header">
                <h2 className="inbox-detail-subject">{displayEmail.subject || '(no subject)'}</h2>
                <div className="inbox-detail-actions">
                  <button className="inbox-detail-action" title="Reply" onClick={handleReply}><Reply size={16} /></button>
                  <button className="inbox-detail-action" title="Forward" onClick={handleForward}><Forward size={16} /></button>
                  <button className="inbox-detail-action" title="Archive" onClick={handleArchive}><Archive size={16} /></button>
                  <button className="inbox-detail-action" title="Delete" onClick={handleDelete}><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="inbox-detail-meta">
                <div className="inbox-detail-avatar">{(displayEmail.from_name || displayEmail.from_email || '?')[0].toUpperCase()}</div>
                <div className="inbox-detail-sender">
                  <span className="inbox-detail-name">{displayEmail.from_name || displayEmail.from_email}</span>
                  <span className="inbox-detail-email">&lt;{displayEmail.from_email}&gt;</span>
                </div>
                <span className="inbox-detail-time">{new Date(displayEmail.date).toLocaleString()}</span>
              </div>
              {displayEmail.labels?.length > 0 && (
                <div className="inbox-detail-labels">
                  {displayEmail.labels.map((label) => (
                    <span key={label} className="inbox-detail-label">{label}</span>
                  ))}
                </div>
              )}
              {displayEmail.body_html ? (
                <div className="inbox-detail-body inbox-detail-body--html">
                  <iframe
                    className="inbox-html-frame"
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    referrerPolicy="no-referrer"
                    srcDoc={(() => {
                      const clean = DOMPurify.sanitize(displayEmail.body_html, {
                        ALLOW_TAGS: ['a','abbr','address','article','aside','b','bdi','bdo','blockquote','br','caption','cite','code','col','colgroup','dd','del','details','dfn','div','dl','dt','em','figcaption','figure','footer','h1','h2','h3','h4','h5','h6','header','hr','i','img','ins','kbd','li','main','mark','nav','ol','p','pre','q','rp','rt','ruby','s','samp','section','small','span','strong','sub','summary','sup','table','tbody','td','tfoot','th','thead','time','tr','u','ul','var','wbr','style','center','font'],
                        ALLOW_ATTR: ['href','src','alt','title','width','height','style','class','id','dir','lang','colspan','rowspan','align','valign','bgcolor','color','border','cellpadding','cellspacing','face','size','target','rel'],
                        ALLOW_DATA_ATTR: false,
                        ADD_TAGS: ['style'],
                        FORCE_BODY: true,
                      });
                      return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>
                        *{margin:0;padding:0;box-sizing:border-box}
                        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;word-wrap:break-word;overflow-wrap:break-word;padding:0;margin:0;background:transparent}
                        img{max-width:100%;height:auto}
                        a{color:#1a73e8;text-decoration:underline}
                        table{max-width:100%!important;width:auto!important}
                        pre{white-space:pre-wrap;overflow-x:auto}
                        blockquote{border-left:3px solid #ddd;padding-left:12px;margin:8px 0;color:#555}
                      </style></head><body>${clean}</body></html>`;
                    })()}
                    onLoad={(e) => {
                      const frame = e.target;
                      try {
                        const h = frame.contentDocument?.documentElement?.scrollHeight || frame.contentDocument?.body?.scrollHeight;
                        if (h) frame.style.height = h + 'px';
                      } catch {}
                    }}
                  />
                </div>
              ) : (
                <div className="inbox-detail-body">
                  {(displayEmail.body_text || '').split('\n').map((line, i) => (
                    <p key={i}>{line || '\u00A0'}</p>
                  ))}
                </div>
              )}
              <div className="inbox-reply-bar">
                <textarea
                  className="inbox-reply-input"
                  placeholder="Write a reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={1}
                  onInput={(e) => {
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }}
                />
                <button
                  className="inbox-reply-btn"
                  onClick={handleQuickReply}
                  disabled={!replyText.trim() || replySending}
                >
                  {replySending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </>
          ) : (
            <div className="inbox-detail-empty">
              <p>{activeFolder === 'drafts' ? 'Click a draft to edit' : 'Select an email to read'}</p>
            </div>
          )}
        </div>
      </div>

      {/* FAB */}
      {hasAccounts && (
        <button className="inbox-compose-fab" onClick={openNewCompose}>
          <Plus size={18} />
          <span className="inbox-compose-fab-label">Write new email</span>
        </button>
      )}

      {/* Compose Panel */}
      {composeOpen && (
        <div className="inbox-compose-panel">
          {/* Header */}
          <div className="inbox-compose-header">
            <h3 className="inbox-compose-title">
              {composeMode === 'reply' ? 'Reply' : composeMode === 'forward' ? 'Forward' : 'New Email'}
            </h3>
            <div className="inbox-compose-header-actions">
              <button className="inbox-compose-save-draft" onClick={handleSaveDraft} title="Save as draft">
                <FileText size={14} />
              </button>
              <button className="inbox-compose-close" onClick={resetCompose}>
                <X size={18} />
              </button>
            </div>
          </div>

          {/* From (account selector) */}
          {accounts.length > 1 && (
            <div className="inbox-compose-field">
              <label className="inbox-compose-label">From</label>
              <select
                className="inbox-compose-input inbox-compose-select"
                value={composeAccountId}
                onChange={(e) => setComposeAccountId(e.target.value)}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.display_name ? `${acc.display_name} <${acc.email}>` : acc.email}</option>
                ))}
              </select>
            </div>
          )}

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
                        emails.map((em) => (
                          <button
                            key={em.id}
                            className={`inbox-compose-context-row ${selectedContextEmails.has(em.id) ? 'inbox-compose-context-row--active' : ''}`}
                            onClick={() => toggleEmailContext(em.id)}
                          >
                            <div className="inbox-compose-context-check">
                              {selectedContextEmails.has(em.id) && <Check size={12} />}
                            </div>
                            <div className="inbox-compose-context-info">
                              <span className="inbox-compose-context-name">{em.from_name || em.from_email}</span>
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
                const em = emails.find((e) => e.id === id);
                return em ? (
                  <span key={`email-${id}`} className="inbox-compose-context-pill">
                    {em.from_name || em.from_email}: {em.subject}
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
            <button className="inbox-compose-send" onClick={handleSend} disabled={composeSending}>
              {composeSending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {addAccountOpen && (
        <div className="modal-overlay" onClick={() => setAddAccountOpen(false)}>
          <div className="modal inbox-account-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAddAccountOpen(false)}>
              <X size={18} />
            </button>

            <div className="inbox-account-modal-icon">
              <Mail size={32} />
            </div>

            <h3 className="inbox-account-modal-title">Connect Email Account</h3>
            <p className="inbox-account-modal-desc">
              Add your email account to send and receive emails directly from the inbox.
            </p>

            {accountError && (
              <div className="inbox-account-modal-error">{accountError}</div>
            )}

            <div className="inbox-provider-buttons">
              {Object.entries(PROVIDER_PRESETS).map(([key, p]) => (
                <button
                  key={key}
                  className={`inbox-provider-btn ${accountForm.provider === key ? 'inbox-provider-btn--active' : ''}`}
                  onClick={() => {
                    const preset = PROVIDER_PRESETS[key];
                    setAccountForm({
                      ...accountForm,
                      provider: key,
                      imap_host: preset.imap_host || '',
                      imap_port: preset.imap_port || 993,
                      smtp_host: preset.smtp_host || '',
                      smtp_port: preset.smtp_port || 587,
                    });
                  }}
                >
                  {p.icon}
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            <div className="modal-field">
              <label className="modal-label">Email address</label>
              <input
                type="email"
                className="modal-input"
                placeholder="you@gmail.com"
                value={accountForm.email}
                onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value, username: e.target.value })}
              />
            </div>

            <div className="modal-field">
              <label className="modal-label">Display name (optional)</label>
              <input
                type="text"
                className="modal-input"
                placeholder="Your Name"
                value={accountForm.display_name}
                onChange={(e) => setAccountForm({ ...accountForm, display_name: e.target.value })}
              />
            </div>

            <div className="modal-field">
              <label className="modal-label">
                {accountForm.provider === 'gmail' ? 'App Password' : 'Password'}
              </label>
              <input
                type="password"
                className="modal-input"
                placeholder={accountForm.provider === 'gmail' ? 'Generated app password' : 'Email password'}
                value={accountForm.password}
                onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
              />
              {accountForm.provider === 'gmail' && (
                <div className="inbox-account-modal-hint">
                  <strong>How to connect Gmail:</strong>
                  <ol className="inbox-connect-steps">
                    <li>Enable 2-Step Verification in your <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer">Google Account Security</a></li>
                    <li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">App Passwords</a> and generate a new app password</li>
                    <li>Paste the generated 16-character password above</li>
                  </ol>
                </div>
              )}
              {accountForm.provider === 'outlook' && (
                <div className="inbox-account-modal-hint">
                  <strong>How to connect Outlook:</strong>
                  <ol className="inbox-connect-steps">
                    <li>Go to <a href="https://account.microsoft.com/security" target="_blank" rel="noopener noreferrer">Microsoft Account Security</a></li>
                    <li>Enable Two-step verification if not already on</li>
                    <li>Under "App passwords", create a new app password</li>
                    <li>Paste the generated password above</li>
                  </ol>
                </div>
              )}
            </div>

            {accountForm.provider === 'imap' && (
              <>
                <div className="modal-field-row">
                  <div className="modal-field">
                    <label className="modal-label">IMAP Host</label>
                    <input
                      type="text"
                      className="modal-input"
                      placeholder="imap.example.com"
                      value={accountForm.imap_host}
                      onChange={(e) => setAccountForm({ ...accountForm, imap_host: e.target.value })}
                    />
                  </div>
                  <div className="modal-field modal-field--sm">
                    <label className="modal-label">Port</label>
                    <input
                      type="number"
                      className="modal-input"
                      value={accountForm.imap_port}
                      onChange={(e) => setAccountForm({ ...accountForm, imap_port: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="modal-field-row">
                  <div className="modal-field">
                    <label className="modal-label">SMTP Host</label>
                    <input
                      type="text"
                      className="modal-input"
                      placeholder="smtp.example.com"
                      value={accountForm.smtp_host}
                      onChange={(e) => setAccountForm({ ...accountForm, smtp_host: e.target.value })}
                    />
                  </div>
                  <div className="modal-field modal-field--sm">
                    <label className="modal-label">Port</label>
                    <input
                      type="number"
                      className="modal-input"
                      value={accountForm.smtp_port}
                      onChange={(e) => setAccountForm({ ...accountForm, smtp_port: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Username</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Username (if different from email)"
                    value={accountForm.username}
                    onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })}
                  />
                </div>
              </>
            )}

            <button
              className="modal-btn modal-btn--primary"
              disabled={!accountForm.email || !accountForm.password || accountSaving}
              onClick={handleAddAccount}
            >
              {accountSaving ? 'Connecting...' : 'Connect Account'}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`inbox-toast ${toast.type === 'error' ? 'inbox-toast--error' : ''}`}>
          {toast.type === 'error' ? <X size={14} /> : <Check size={14} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
