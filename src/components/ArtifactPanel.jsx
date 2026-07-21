import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Copy, Send, Check, Mail, Code, FileText, PenTool, ChevronLeft, Rocket, ChevronDown, Search, Download, ChevronRight, History, Undo2, Maximize2, Image as ImageIcon } from 'lucide-react';
import SocialPreview from './SocialPreview';
import LinkedInPreview from './LinkedInPreview';
import CanvasActionsBar from './CanvasActionsBar';
import CarouselPlanCard from './social-canvas/CarouselPlanCard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';
import { ARTIFACT_TYPES, parseEmailContent } from '../lib/artifacts';
import { sendEmailApi, deployToNetlify, getEmailAccounts, getContacts, getTemplates, getTemplate, saveTemplate, connectIntegration, checkNetlifyName, getNetlifyStatus, listArtifactVersions, getArtifactVersion, restoreArtifactVersion, postToLinkedIn, schedulePost, uploadImageToStorage, getLinkedInAuthUrl, getIntegrations, createCalendarPost, publishCalendarPost } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { injectEditIds, applyTextEdit } from '../lib/editableHtml';
import { getIframeEditScript } from '../lib/iframeEditScript';
import { getIframeImageScript } from '../lib/iframeImageScript';
import './ArtifactPanel.css';

export default function ArtifactPanel({ artifact, emailAccounts: externalAccounts, onClose, onChatMessage, onContentChange, onArtifactChange, onApproveCarousel = null, onEditCarouselSlide = null, onRegenerateCarouselSlide = null, onDeleteCarouselSlide = null, onUpdateCarouselPlan = null, onRetryFailedSlides = null, sessionId = null, brandDna = null, user = null, isLinkedInConnected = false }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(externalAccounts?.[0]?.id || null);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);

  // Canvas Schedule / Upload / Post handlers — parity with Content.jsx so
  // the buttons inside LinkedInPreview + SocialPreview actually work when
  // the preview is rendered inside the AICEO chat's canvas panel.
  // Track which social integrations the user has connected so the canvas
  // toolbar can show the right CTA ("Post to Instagram" vs "Connect
  // Instagram"). One /api/integrations call on mount; short-lived local
  // state — a full auth resolution would fire on the next chat cycle
  // anyway, so we don't need to re-poll aggressively.
  const [connectedSocials, setConnectedSocials] = useState({});
  useEffect(() => {
    let cancelled = false;
    getIntegrations().then(({ integrations }) => {
      if (cancelled) return;
      const map = {};
      for (const i of integrations || []) {
        if (i.is_active) map[i.provider] = true;
      }
      setConnectedSocials(map);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleCanvasPostToInstagram = async ({ text, images: imgs, connect, reconnect }) => {
    if (connect || reconnect) {
      // Instagram publishing runs through BooSend. When the token no
      // longer authorizes the target account (Meta "does not exist,
      // cannot be loaded due to missing permissions"), the user needs
      // to paste a fresh BooSend API key. Deep-link straight into that
      // modal so the fix is one step.
      navigate('/settings', { state: { scrollTo: 'integrations', highlight: 'boosend' } });
      return;
    }
    // Meta / BooSend can only fetch publicly-reachable URLs. Blob URLs
    // (from URL.createObjectURL) and data: URLs live in the browser
    // and produce the "image URL not attached / does not exist" error
    // when forwarded verbatim. Upload every non-public slide to
    // Supabase storage first, then publish.
    const orderedImgs = Array.isArray(imgs)
      ? [...imgs].sort((a, b) => (a?.idx || 0) - (b?.idx || 0))
      : [];
    const publicUrls = [];
    for (const im of orderedImgs) {
      const src = im?.src;
      if (!src) continue;
      if (src.startsWith('data:')) {
        const commaIdx = src.indexOf(',');
        const mime = (src.match(/^data:([^;]+);/) || [])[1] || 'image/png';
        const base64 = src.slice(commaIdx + 1);
        const uploaded = await uploadImageToStorage(base64, mime);
        const url = uploaded?.url || uploaded?.publicUrl || null;
        if (url) publicUrls.push(url);
      } else if (src.startsWith('blob:')) {
        // Fetch the blob → data URL → upload. Blob URLs are only valid
        // in the current tab, so this is the only reliable path.
        const blob = await (await fetch(src)).blob();
        const base64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => {
            const s = String(r.result || '');
            resolve(s.slice(s.indexOf(',') + 1));
          };
          r.onerror = () => reject(new Error('read failed'));
          r.readAsDataURL(blob);
        });
        const uploaded = await uploadImageToStorage(base64, blob.type || 'image/png');
        const url = uploaded?.url || uploaded?.publicUrl || null;
        if (url) publicUrls.push(url);
      } else {
        publicUrls.push(src);
      }
    }
    if (publicUrls.length === 0) throw new Error('No images to publish. Attach at least one image before posting.');

    // Publish through the calendar-row pipeline — the same
    // publishSocialPostRow path /Content and the scheduler use — so
    // publish-now / scheduled / draft are ONE code path and the post
    // lands in the Content Calendar.
    const { post } = await createCalendarPost({
      platform: 'instagram',
      caption: text,
      content_type: publicUrls.length > 1 ? 'carousel' : 'image',
      scheduled_at: null,
      media: publicUrls.map((url) => ({ type: 'image', url })),
      status: 'draft',
    });
    await publishCalendarPost(post.id);
  };

  const handleCanvasConnectInstagram = () => {
    // Instagram OAuth flow lives on the Settings page (BooSend integration
    // block). Deep-link there and open the BooSend modal, same pattern
    // as the LinkedIn "Connect" fallback.
    navigate('/settings', { state: { scrollTo: 'integrations', highlight: 'boosend' } });
  };

  const handleCanvasPostToLinkedIn = async ({ text, images: imgs, connect, reconnect }) => {
    if (connect || reconnect) {
      // Kick straight into LinkedIn's OAuth consent so the user doesn't
      // need to hunt through Settings after seeing a "token expired"
      // banner. On failure fall back to the Settings deep-link so they
      // can retry from a stable page.
      try {
        const { url } = await getLinkedInAuthUrl();
        if (url) { window.location.href = url; return; }
      } catch (err) {
        console.error('[linkedin] auth URL fetch failed:', err.message);
      }
      navigate('/settings', { state: { scrollTo: 'integrations' } });
      return;
    }
    // Pass every slide (sorted by idx) so LinkedIn ships a real
    // multi-image carousel instead of just the first slide.
    const orderedImgs = Array.isArray(imgs)
      ? [...imgs].sort((a, b) => (a?.idx || 0) - (b?.idx || 0)).map((im) => im?.src).filter(Boolean)
      : [];
    await postToLinkedIn(text, orderedImgs);
  };
  const handleCanvasSchedule = async ({ text, images: imgs, date, time, platform }) => {
    // Build the ISO string from a real Date so the user's local timezone
    // is preserved. The previous `${date}T${time}:00` shape had no offset,
    // which Supabase interpreted as UTC — scheduled posts were firing at
    // the wrong hour (or, with the dispatcher missing, silently drifting
    // when re-read).
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const scheduledAt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0).toISOString();
    await schedulePost({
      platform,
      caption: text,
      scheduledAt,
      images: imgs,
      contentType: (imgs?.length || 0) > 1 ? 'carousel' : (imgs?.length ? 'image' : 'text'),
    });
  };
  const handleCanvasUploadImages = async (files) => {
    if (!files?.length || !onArtifactChange) return;
    // Optimistic blob URLs first so the preview updates instantly, then
    // swap to real Supabase URLs after upload — same pattern as Content.
    const startIdx = (artifact?.images?.length || 0);
    const optimistic = files.map((file, i) => ({
      src: URL.createObjectURL(file),
      idx: startIdx + i,
      _uploading: true,
    }));
    onArtifactChange((prev) => ({
      ...prev,
      images: [...(prev?.images || []), ...optimistic],
      totalSlides: optimistic.length > 1
        ? (prev?.images?.length || 0) + optimistic.length
        : (prev?.totalSlides || 0),
    }));
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const idx = startIdx + i;
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result || '');
            const comma = result.indexOf(',');
            resolve(comma !== -1 ? result.slice(comma + 1) : result);
          };
          reader.onerror = () => reject(new Error('read failed'));
          reader.readAsDataURL(file);
        });
        const uploaded = await uploadImageToStorage(base64, file.type || 'image/png');
        // uploadImageToStorage returns the response JSON `{ url, path, ... }`
        // — need to extract .url. Previously we treated the whole object as
        // the src string, which rendered as [object Object] and produced
        // the "image appears then disappears" bug.
        const url = uploaded?.url || uploaded?.publicUrl || null;
        if (!url) throw new Error('upload returned no URL');
        onArtifactChange((prev) => ({
          ...prev,
          images: (prev?.images || []).map((im) =>
            im.idx === idx ? { src: url, idx } : im
          ),
        }));
      } catch (err) {
        console.error('[canvas-upload] failed for slot', idx, err);
        // Clear the broken blob placeholder instead of leaving it hanging.
        onArtifactChange((prev) => ({
          ...prev,
          images: (prev?.images || []).filter((im) => im.idx !== idx),
        }));
      }
    }
  };

  // Netlify connection modal (triggered when deploy hits 400/401 token issue)
  const [netlifyModalOpen, setNetlifyModalOpen] = useState(false);
  const [netlifyModalMode, setNetlifyModalMode] = useState('connect'); // 'connect' | 'reconnect'
  const [netlifyToken, setNetlifyToken] = useState('');
  const [netlifyConnecting, setNetlifyConnecting] = useState(false);
  const [netlifyConnectError, setNetlifyConnectError] = useState('');

  // Version history (AI CEO chat artifacts — landing pages, newsletters)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versionList, setVersionList] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoring, setRestoring] = useState(null); // version id currently being restored

  const openHistory = async () => {
    setHistoryOpen(true);
    setVersionsLoading(true);
    try {
      const { versions } = await listArtifactVersions({
        sessionId: sessionId || undefined,
        agent: artifact?.agentSource || undefined,
      });
      setVersionList(versions || []);
    } catch {
      setVersionList([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleRestore = async (versionId) => {
    if (restoring) return;
    setRestoring(versionId);
    try {
      // First fetch full content and apply locally (instant feedback), then
      // persist the restore on the server so the history list shows it.
      const data = await getArtifactVersion(versionId);
      if (!data?.version?.content) throw new Error('Version not found');
      if (onContentChange) onContentChange(data.version.content);
      await restoreArtifactVersion(versionId);
      // Refresh list so the new "Reverted to v…" row appears.
      const { versions } = await listArtifactVersions({
        sessionId: sessionId || undefined,
        agent: artifact?.agentSource || undefined,
      });
      setVersionList(versions || []);
      setHistoryOpen(false);
      if (onChatMessage) onChatMessage(`Restored v${data.version.version_number}${data.version.summary ? ` — ${data.version.summary}` : ''}`);
    } catch (err) {
      setSendError(err.message || 'Restore failed');
    } finally {
      setRestoring(null);
    }
  };

  // Netlify "name your site" modal (triggered on Deploy click)
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [siteNameInput, setSiteNameInput] = useState('');
  const [nameCheck, setNameCheck] = useState(null); // { available, owned, reason, normalized }
  const [nameChecking, setNameChecking] = useState(false);
  const nameCheckTimerRef = useRef(null);
  const iframeRef = useRef(null);
  const editMapRef = useRef(new Map());
  const skipIframeWriteRef = useRef(false);

  // Send Email modal state
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [accounts, setAccounts] = useState(externalAccounts || []);
  const [contacts, setContacts] = useState([]);
  const [sendSubject, setSendSubject] = useState('');
  const [sendSearch, setSendSearch] = useState('');
  const [sendSelected, setSendSelected] = useState(new Set());
  const [sendSelectAll, setSendSelectAll] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Save Template modal state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Import Template modal state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // Content state for editable HTML
  const [htmlContent, setHtmlContent] = useState('');

  useEffect(() => {
    if (artifact?.content) setHtmlContent(artifact.content);
  }, [artifact?.content]);

  useEffect(() => {
    if (externalAccounts?.length) {
      setAccounts(externalAccounts);
      if (!selectedAccountId) setSelectedAccountId(externalAccounts[0]?.id);
    }
  }, [externalAccounts]);

  // Listen for CTA link edits and text edits from the iframe
  useEffect(() => {
    function handleMessage(e) {
      if (e.data?.type === 'cta-link-edit') {
        const { oldHref, newHref } = e.data;
        setHtmlContent(prev => {
          if (!prev) return prev;
          const escaped = oldHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp('href="' + escaped + '"', 'g');
          const updated = prev.replace(regex, 'href="' + newHref.replace(/"/g, '&quot;') + '"');
          if (onContentChange) onContentChange(updated);
          return updated;
        });
      } else if (e.data?.type === 'text-edit') {
        const { editId, newHtml } = e.data;
        skipIframeWriteRef.current = true;
        setHtmlContent(prev => {
          const updated = applyTextEdit(prev, editMapRef.current, editId, newHtml);
          if (onContentChange) onContentChange(updated);
          return updated;
        });
      } else if (e.data?.type === 'image-edit') {
        const { src, width, marginLeft, marginRight, textAlign } = e.data;
        if (!src) return;
        skipIframeWriteRef.current = true;
        setHtmlContent(prev => {
          if (!prev) return prev;
          const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const simpleImgRegex = new RegExp('(<div[^>]*>\\s*)?(<img[^>]*src="' + escapedSrc + '"[^>]*/?>)(\\s*</div>)?', 'i');
          const match = prev.match(simpleImgRegex);
          if (match) {
            let newImg = match[2];
            if (width) {
              newImg = newImg.replace(/style="[^"]*"/, (s) => {
                let style = s.slice(7, -1);
                style = style.replace(/width:\s*[^;]+;?/g, '');
                style = 'width:' + width + ';' + style;
                return 'style="' + style + '"';
              });
              if (!/style="/.test(newImg)) {
                newImg = newImg.replace(/<img/, '<img style="width:' + width + ';height:auto;display:block;"');
              }
            }
            const alignStyle = textAlign ? 'text-align:' + textAlign + ';' : 'text-align:center;';
            const mStyle = (marginLeft ? 'margin-left:' + marginLeft + ';' : '') + (marginRight ? 'margin-right:' + marginRight + ';' : '');
            const wrapDiv = '<div style="' + alignStyle + 'margin:0 auto;max-width:600px;"><div style="display:inline-block;' + mStyle + 'width:' + (width || '100%') + ';max-width:100%;">' + newImg + '</div></div>';
            const updated = prev.replace(match[0], wrapDiv);
            if (onContentChange) onContentChange(updated);
            return updated;
          }
          return prev;
        });
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onContentChange]);

  if (!artifact) return null;

  const { type, title, content, images } = artifact;
  const agentSource = artifact.agentSource || '';
  const typeInfo = ARTIFACT_TYPES[type] || { label: 'Output', icon: 'FileText' };
  const isHtml = type === 'newsletter' || type === 'html_template';
  const isNewsletter = type === 'newsletter' || agentSource === 'newsletter';
  const isLanding = agentSource === 'landing-page' || agentSource === 'squeeze-page';

  const toolType = isNewsletter ? 'newsletter' : isLanding ? (agentSource || 'landing') : type;

  const handleCopy = async (text) => {
    await navigator.clipboard.writeText(text || htmlContent || content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([htmlContent || content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'output').replace(/\s+/g, '-').toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Suggest a default name from the artifact title, normalized to Netlify's
  // allowed character set.
  const suggestSiteName = () => {
    const raw = (title || 'my-site').toString();
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63) || 'my-site';
  };

  // Deploy click: open the "Name your site" modal pre-filled with the last
  // name the user used (if any) or a slugified suggestion from the title.
  const handleDeploy = async () => {
    if (deploying) return;
    setSendError('');

    let initial = suggestSiteName();
    try {
      const status = await getNetlifyStatus();
      if (status?.connected && status?.last_site_name) initial = status.last_site_name;
    } catch {
      // status is optional — we can always fall back to the suggestion.
    }

    setSiteNameInput(initial);
    setNameCheck(null);
    setNameModalOpen(true);
  };

  // Debounced availability check while the user types in the name modal.
  useEffect(() => {
    if (!nameModalOpen) return;
    const raw = siteNameInput.trim().toLowerCase();
    if (!raw) { setNameCheck(null); return; }
    if (nameCheckTimerRef.current) clearTimeout(nameCheckTimerRef.current);
    setNameChecking(true);
    nameCheckTimerRef.current = setTimeout(async () => {
      try {
        const result = await checkNetlifyName(raw);
        setNameCheck(result);
      } finally {
        setNameChecking(false);
      }
    }, 400);
    return () => { if (nameCheckTimerRef.current) clearTimeout(nameCheckTimerRef.current); };
  }, [siteNameInput, nameModalOpen]);

  // Runs the actual deploy with a confirmed name.
  const performDeploy = async (name) => {
    if (deploying) return;
    setDeploying(true);
    setDeployResult(null);
    setSendError('');
    try {
      const result = await deployToNetlify(htmlContent || content, name);
      setDeployResult(result);
      setNameModalOpen(false);
      if (onChatMessage) onChatMessage(`Deployed to Netlify! Live at ${result.url}`);
    } catch (err) {
      if (err.code === 'netlify_not_connected' || err.code === 'netlify_unauthorized') {
        setNameModalOpen(false);
        setNetlifyModalMode(err.code === 'netlify_unauthorized' ? 'reconnect' : 'connect');
        setNetlifyToken('');
        setNetlifyConnectError('');
        setNetlifyModalOpen(true);
      } else if (err.code === 'netlify_name_taken' || err.code === 'netlify_invalid_name') {
        // Keep the name modal open so the user can pick another.
        setNameCheck({ available: false, reason: err.code === 'netlify_name_taken' ? 'taken' : 'invalid_chars' });
        setSendError(err.message);
      } else {
        setNameModalOpen(false);
        setSendError(err.message);
      }
    } finally {
      setDeploying(false);
    }
  };

  const handleConfirmName = () => {
    const name = siteNameInput.trim().toLowerCase();
    if (!name || (nameCheck && nameCheck.available === false)) return;
    performDeploy(name);
  };

  const handleNetlifyConnectAndDeploy = async () => {
    const token = netlifyToken.trim();
    if (!token || netlifyConnecting) return;
    setNetlifyConnecting(true);
    setNetlifyConnectError('');
    try {
      await connectIntegration('netlify', token);
      setNetlifyModalOpen(false);
      setNetlifyToken('');
      // Immediately retry the deploy the user originally asked for.
      await handleDeploy();
    } catch (err) {
      setNetlifyConnectError(err.message || 'Could not validate token');
    } finally {
      setNetlifyConnecting(false);
    }
  };

  // ── Send Email Modal Logic ──
  const openSendModal = async () => {
    setSendModalOpen(true);
    setSendLoading(true);
    setSendResult(null);
    setSendSubject('');
    setSendSearch('');
    setSendSelected(new Set());
    setSendSelectAll(false);
    try {
      const [accRes, conRes] = await Promise.all([getEmailAccounts(), getContacts()]);
      const accs = accRes.accounts || accRes || [];
      setAccounts(Array.isArray(accs) ? accs : []);
      const cons = conRes.contacts || conRes || [];
      setContacts(Array.isArray(cons) ? cons : []);
      if (Array.isArray(accs) && accs.length > 0 && !selectedAccountId) setSelectedAccountId(accs[0].id);
    } catch {}
    setSendLoading(false);
  };

  const filteredContacts = contacts.filter(c => {
    if (!c.email) return false;
    if (!sendSearch) return true;
    const q = sendSearch.toLowerCase();
    return (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
  });

  useEffect(() => {
    if (sendSelectAll) setSendSelected(new Set(filteredContacts.map(c => c.id)));
  }, [sendSelectAll, filteredContacts.length]);

  const handleSendBulk = async () => {
    if (!selectedAccountId || sendSelected.size === 0) return;
    setSending(true);
    const recipients = contacts.filter(c => sendSelected.has(c.id) && c.email);
    let success = 0, failed = 0;
    for (let i = 0; i < recipients.length; i += 5) {
      const batch = recipients.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(c => sendEmailApi({
          account_id: selectedAccountId,
          to: c.email,
          subject: sendSubject || title || 'Newsletter',
          body_html: htmlContent || content,
          body_text: '',
        }))
      );
      results.forEach(r => r.status === 'fulfilled' ? success++ : failed++);
    }
    setSendResult({ success, failed, total: recipients.length });
    setSending(false);
  };

  // ── Save Template Logic ──
  const openSaveModal = () => {
    setSaveModalOpen(true);
    setSaveName('');
    setSaveDesc('');
    setSaved(false);
  };

  const handleSaveTemplate = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      await saveTemplate({ name: saveName.trim(), description: saveDesc.trim(), tool: toolType, html: htmlContent || content });
      setSaved(true);
    } catch {}
    setSaving(false);
  };

  // ── Import Template Logic ──
  const openImportModal = async () => {
    setImportModalOpen(true);
    setTemplatesLoading(true);
    try {
      const res = await getTemplates(toolType);
      setTemplates(res.templates || []);
    } catch {}
    setTemplatesLoading(false);
  };

  const handleImportTemplate = async (id) => {
    try {
      const { template } = await getTemplate(id);
      if (template?.html) setHtmlContent(template.html);
      setImportModalOpen(false);
    } catch {}
  };

  const handleSendEmail = async () => {
    if (!selectedAccountId) return;
    const email = parseEmailContent(content);
    setSending(true);
    setSendError('');
    try {
      await sendEmailApi({
        account_id: selectedAccountId,
        to: email.to,
        subject: email.subject,
        body_html: email.body_html,
        body_text: new DOMParser().parseFromString(email.body_html, 'text/html').body.textContent || '',
      });
      setSent(true);
    } catch (err) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  };

  const renderIcon = () => {
    switch (type) {
      case 'email': return <Mail size={16} />;
      case 'newsletter': return <Mail size={16} />;
      case 'html_template': return <FileText size={16} />;
      case 'content_post': return <PenTool size={16} />;
      case 'story_sequence': return <FileText size={16} />;
      case 'code_block': return <Code size={16} />;
      default: return <FileText size={16} />;
    }
  };

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="ap">
      <div className="ap-header">
        <div className="ap-header-left">
          <button className="ap-back-btn" onClick={onClose}>
            <X size={20} />
          </button>
          {renderIcon()}
          <span
            className="ap-title"
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              const overflow = el.scrollWidth - el.clientWidth;
              if (overflow > 0) {
                const speed = 60;
                const duration = Math.max(3, (overflow / speed) * 2 + 1);
                el.style.setProperty('--marquee-distance', `-${overflow}px`);
                el.style.setProperty('--marquee-duration', `${duration}s`);
                el.classList.add('ap-title--scrolling');
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.classList.remove('ap-title--scrolling');
            }}
          ><span className="ap-title-text">{title}</span></span>
          <span className="ap-type-badge">{typeInfo.label}</span>
        </div>
        <div className="ap-header-right">
          {/* Email type — simple send */}
          {type === 'email' && externalAccounts?.length > 0 && (
            <>
              <select className="ap-account-select" value={selectedAccountId || ''} onChange={e => setSelectedAccountId(e.target.value)}>
                {(externalAccounts || []).map(acc => <option key={acc.id} value={acc.id}>{acc.email}</option>)}
              </select>
              <button className="ap-btn ap-btn--send" onClick={handleSendEmail} disabled={sending || sent}>
                {sent ? <><Check size={14} /> Sent</> : sending ? 'Sending...' : <><Send size={14} /> Send</>}
              </button>
            </>
          )}

          {/* Newsletter/Landing — Marketing-style toolbar */}
          {isHtml && (
            <>
              <button className="ap-btn ap-btn--outline" onClick={openImportModal}>
                Import Template
              </button>
              <button className="ap-btn ap-btn--outline" onClick={openSaveModal}>
                Save Template
              </button>
              {isNewsletter && (
                <button className="ap-btn ap-btn--send" onClick={openSendModal}>
                  <Mail size={14} /> Send Email
                </button>
              )}
              <button className="ap-btn ap-btn--outline" onClick={openHistory} title="Version history">
                <History size={14} /> History
              </button>
              <button className="ap-btn ap-btn--outline" onClick={handleDownload}>
                <Download size={14} /> Download
              </button>
              <button className="ap-btn ap-btn--outline" onClick={() => handleCopy()}>
                {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy Code</>}
              </button>
              {isLanding && (
                <button
                  className={`ap-btn ap-btn--netlify${deploying ? ' ap-btn--loading' : ''}`}
                  onClick={handleDeploy}
                  disabled={!(htmlContent || content) || deploying}
                >
                  {deploying ? 'Deploying...' : deployResult ? 'Redeploy' : 'Deploy to Netlify'}
                </button>
              )}
            </>
          )}

          {/* Non-HTML types — just copy */}
          {!isHtml && type !== 'email' && (
            <button className="ap-btn ap-btn--outline" onClick={() => handleCopy()}>
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
          )}

          <button className="ap-mobile-menu-toggle" onClick={() => setMobileMenuOpen(v => !v)} aria-label="Menu">
            {mobileMenuOpen ? <X size={18} /> : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            )}
          </button>
          <button className="ap-close" onClick={onClose} aria-label="Close panel"><X size={18} /></button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="ap-mobile-dropdown" onClick={() => setMobileMenuOpen(false)}>
          {isHtml && (
            <>
              <button className="ap-mobile-dropdown-item" onClick={openImportModal}>Import Template</button>
              <button className="ap-mobile-dropdown-item" onClick={openSaveModal}>Save Template</button>
              {isNewsletter && <button className="ap-mobile-dropdown-item" onClick={openSendModal}><Mail size={14} /> Send Email</button>}
              <button className="ap-mobile-dropdown-item" onClick={openHistory}><History size={14} /> History</button>
              <button className="ap-mobile-dropdown-item" onClick={handleDownload}><Download size={14} /> Download</button>
              <button className="ap-mobile-dropdown-item" onClick={() => handleCopy()}>
                {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy Code</>}
              </button>
              {isLanding && (
                <button className="ap-mobile-dropdown-item" onClick={handleDeploy} disabled={deploying}>
                  {deploying ? 'Deploying...' : deployResult ? 'Redeploy' : 'Deploy to Netlify'}
                </button>
              )}
            </>
          )}
          {!isHtml && type !== 'email' && (
            <button className="ap-mobile-dropdown-item" onClick={() => handleCopy()}>
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
          )}
        </div>
      )}

      {sendError && <div className="ap-error">{sendError}</div>}

      {deployResult && (
        <div className="ap-deploy-banner">
          <span className="ap-deploy-banner-dot" />
          Live at{' '}
          <a href={deployResult.url} target="_blank" rel="noopener noreferrer" className="ap-deploy-banner-link">
            {deployResult.url}
          </a>
        </div>
      )}

      <div className="ap-body">
        {artifact?.loading && !content ? (
          <div className="ap-loading-skeleton">
            <div className="ap-loading-pulse" />
            <div className="ap-loading-blocks">
              <div className="ap-loading-block ap-loading-block--nav" />
              <div className="ap-loading-block ap-loading-block--hero" />
              <div className="ap-loading-block ap-loading-block--row">
                <div className="ap-loading-block ap-loading-block--card" />
                <div className="ap-loading-block ap-loading-block--card" />
                <div className="ap-loading-block ap-loading-block--card" />
              </div>
              <div className="ap-loading-block ap-loading-block--section" />
            </div>
            <p className="ap-loading-text">Generating your page&hellip;</p>
          </div>
        ) : (
          <>
            {type === 'email' && <EmailRenderer content={content} />}
            {type === 'newsletter' && <HtmlRenderer content={htmlContent || content} iframeRef={iframeRef} editMapRef={editMapRef} skipIframeWriteRef={skipIframeWriteRef} />}
            {type === 'html_template' && <HtmlRenderer content={htmlContent || content} iframeRef={iframeRef} editMapRef={editMapRef} skipIframeWriteRef={skipIframeWriteRef} />}
            {type === 'story_sequence' && <StorySequenceRenderer frames={artifact.frames || []} />}
            {type === 'content_post' && (() => {
              // Pre-plan "AI is building the plan" state — Sonnet takes
              // 15-30s to stream a plan_carousel tool call, so AiCeo
              // pre-opens the canvas with an artifact._planPending=true
              // placeholder the moment the user picks Carousel from the
              // format popup. Without this, the panel was blank the whole
              // time and users thought the app was stuck.
              if (artifact._planPending) {
                return (
                  <div className="ap-plan-pending" role="status" aria-live="polite">
                    <div className="ap-plan-pending-spinner-wrap">
                      <div className="ap-plan-pending-spinner" />
                    </div>
                    <div className="ap-plan-pending-title">Building your carousel plan…</div>
                    <div className="ap-plan-pending-sub">
                      The AI CEO is picking a hook, drafting slides, and locking down the palette. This usually takes 15–30 seconds.
                    </div>
                    <div className="ap-plan-pending-steps">
                      <div className="ap-plan-pending-step ap-plan-pending-step--active">
                        <span className="ap-plan-pending-step-dot" />
                        Analyzing your topic
                      </div>
                      <div className="ap-plan-pending-step ap-plan-pending-step--active">
                        <span className="ap-plan-pending-step-dot" />
                        Drafting the slide roster
                      </div>
                      <div className="ap-plan-pending-step">
                        <span className="ap-plan-pending-step-dot" />
                        Selecting brand colors + typography
                      </div>
                      <div className="ap-plan-pending-step">
                        <span className="ap-plan-pending-step-dot" />
                        Writing the caption
                      </div>
                    </div>
                  </div>
                );
              }

              // Carousel two-step flow: plan_carousel tool call lands here
              // with carouselPlan.approved === false. Show the plan card
              // for user approval; only after Approve is clicked do we
              // flip approved=true and start the per-slide image gen loop
              // (handled by AiCeo.jsx handleApproveCarousel).
              const carouselPlan = artifact.carouselPlan;
              const awaitingApproval = !!(carouselPlan && carouselPlan.slides?.length > 0 && !carouselPlan.approved);
              if (awaitingApproval) {
                // The shared rich plan editor (same component /Content
                // uses): per-slide text editing, insert/delete/reorder,
                // palette editing, caption editing, and the saved
                // design-system template picker.
                return (
                  <CarouselPlanCard
                    plan={carouselPlan}
                    onApprove={() => onApproveCarousel && onApproveCarousel()}
                    onRetryFailed={() => onRetryFailedSlides && onRetryFailedSlides()}
                    onUpdatePlan={onUpdateCarouselPlan}
                  />
                );
              }

              // Post-approval failed-slide retry row. The server marks
              // failed indexes on carouselPlan.failedSlides; this surfaces
              // the same retry affordance /Content's plan card has,
              // without displacing the preview below.
              const failedSlides = !artifact.pendingImages
                ? (carouselPlan?.failedSlides || [])
                : [];
              const retryBanner = (failedSlides.length > 0 && onRetryFailedSlides) ? (
                <div className="ap-carousel-progress" role="alert" style={{ borderColor: '#e11d48' }}>
                  <span className="ap-carousel-progress-text" style={{ color: '#e11d48' }}>
                    {failedSlides.length === 1
                      ? `Slide ${failedSlides[0] + 1} failed to render.`
                      : `${failedSlides.length} slides failed: ${failedSlides.map((i) => i + 1).join(', ')}.`}
                  </span>
                  <button
                    type="button"
                    className="cab-btn cab-btn--outline"
                    onClick={() => onRetryFailedSlides()}
                  >
                    Retry {failedSlides.length === 1 ? 'slide' : `${failedSlides.length} slides`}
                  </button>
                </div>
              ) : null;

              // Carousel generation banner — visible feedback while the
              // per-slide image gen loop runs. Sits above whichever
              // preview component renders below. Shows the CURRENT
              // progress even after the first slide has landed (unlike
              // SocialPreview's skeleton which vanishes as soon as
              // images.length > 0). Hides itself once every slide is
              // done or when the artifact isn't a carousel.
              const totalPlanSlides = artifact.carouselPlan?.slides?.length || artifact.totalSlides || 0;
              const pending = artifact.pendingImages || 0;
              const rendered = Math.max(0, totalPlanSlides - pending);
              const carouselGenerating = totalPlanSlides > 0 && pending > 0;
              const carouselBanner = carouselGenerating ? (
                <div className="ap-carousel-progress" role="status" aria-live="polite">
                  <span className="ap-carousel-progress-spinner" aria-hidden="true" />
                  <span className="ap-carousel-progress-text">
                    Generating slide {rendered + 1} of {totalPlanSlides}…
                  </span>
                  <div className="ap-carousel-progress-bar">
                    <div
                      className="ap-carousel-progress-bar-fill"
                      style={{ width: `${(rendered / Math.max(1, totalPlanSlides)) * 100}%` }}
                    />
                  </div>
                </div>
              ) : null;

              // LinkedIn posts route to LinkedInPreview (proper LI chrome,
              // text-only support). SocialPreview is image-based and falls
              // into a "preparing post…" skeleton when images=[] — fine
              // for IG carousels, but breaks LinkedIn text posts which
              // never have images. Substring match on agentSource so
              // 'linkedin', 'linkedin_post', 'linkedin-post' all match.
              const isLinkedin = /linkedin/i.test(String(agentSource || ''));
              if (isLinkedin) {
                return (
                  <>
                    {carouselBanner}
                    {retryBanner}
                    <LinkedInPreview
                      content={content || ''}
                      images={images || []}
                      userName={user?.user_metadata?.full_name || user?.email || ''}
                      userAvatar={user?.user_metadata?.avatar_url || null}
                      userSubtitle={brandDna?.description?.split(/[.!?]/)[0]?.trim().slice(0, 80) || 'Author'}
                      followerCount={brandDna?.linkedin_followers || '1,200'}
                      postAge="1w"
                      totalSlides={artifact.totalSlides || 0}
                      plan={artifact.carouselPlan || null}
                      streaming={!!artifact.streaming}
                      isGenerating={(artifact.pendingImages || 0) > 0}
                      pendingImages={artifact.pendingImages || 0}
                      failedSlides={artifact.carouselPlan?.failedSlides || []}
                      regeneratingIdx={artifact.editingSlideIdx ?? null}
                      onContentChange={onContentChange}
                      onUploadImages={handleCanvasUploadImages}
                      onPostToLinkedIn={handleCanvasPostToLinkedIn}
                      onSchedule={handleCanvasSchedule}
                      onEditSlide={onEditCarouselSlide}
                      onRegenerateSlide={onRegenerateCarouselSlide}
                      onRemoveSlide={onDeleteCarouselSlide}
                      isLinkedInConnected={isLinkedInConnected}
                      actionsSlot={
                        // LinkedInPreview renders Upload / Post-to-LI
                        // inline for text posts, but its Schedule
                        // button hides for carousels (assumes the
                        // parent passes a schedule-capable actionsSlot).
                        // We plug both Download AND Schedule in here so
                        // the LinkedIn carousel canvas has parity with
                        // /Content: schedule the carousel, download the
                        // PDF for manual upload if wanted.
                        <CanvasActionsBar
                          text={content || ''}
                          images={images || []}
                          platform="linkedin"
                          streaming={!!artifact.streaming}
                          onSchedule={handleCanvasSchedule}
                          hook={artifact.carouselPlan?.hook || ''}
                        />
                      }
                    />
                  </>
                );
              }
              // Derive platform from agentSource so the preview chrome +
              // toolbar match the network the CEO tagged the artifact for.
              // Falls back to Instagram (parity with prior default) when
              // nothing usable is set on agentSource.
              const src = String(agentSource || '').toLowerCase();
              const socialPlatform =
                src.includes('instagram') ? 'instagram'
                : src.includes('twitter') || src === 'x' ? 'twitter'
                : src.includes('tiktok') ? 'tiktok'
                : src.includes('facebook') ? 'facebook'
                : 'instagram';
              // Post-to-platform handler + connection state per platform.
              // Instagram has a first-class handler; the other three have
              // no direct-publish endpoint yet, so we leave onPostToPlatform
              // undefined for them (the Post button just doesn't render).
              const onPost = socialPlatform === 'instagram'
                ? handleCanvasPostToInstagram
                : undefined;
              const onConnect = socialPlatform === 'instagram'
                ? handleCanvasConnectInstagram
                : undefined;
              const isPlatformConnected = socialPlatform === 'instagram'
                ? !!(connectedSocials.instagram || connectedSocials.boosend)
                : false;
              return (
                <>
                  {carouselBanner}
                  {retryBanner}
                  <SocialPreview
                    msg={{
                      id: artifact.id || `content-${type}-${(content || '').length}`,
                      platform: socialPlatform,
                      images: images || [],
                      content: content || '',
                      pendingImages: artifact.pendingImages,
                      // Single-slide regenerate marker — SocialPreview
                      // renders "Regenerating slide N…" for this slot.
                      editingIdx: artifact.editingSlideIdx ?? undefined,
                      // carouselPlan trips SocialPreview into the
                      // "Rendering N / M slides…" skeleton state while
                      // the per-slide image gen loop runs (see AiCeo.jsx
                      // plan_carousel handler). Without this, the panel
                      // sat empty for 30+ seconds giving no feedback.
                      carouselPlan: artifact.carouselPlan || null,
                    }}
                    brandDna={brandDna}
                    user={user}
                    showHeader={false}
                    onUploadImages={handleCanvasUploadImages}
                    onSchedule={handleCanvasSchedule}
                    onEdit={onEditCarouselSlide}
                    onRegenerate={onRegenerateCarouselSlide}
                    onContentChange={onContentChange}
                    actionsSlot={
                      <CanvasActionsBar
                        text={content || ''}
                        images={images || []}
                        platform={socialPlatform}
                        onUploadImages={handleCanvasUploadImages}
                        onSchedule={handleCanvasSchedule}
                        onPostToPlatform={onPost}
                        onConnect={onConnect}
                        isConnected={isPlatformConnected}
                        streaming={!!artifact.streaming}
                        hook={artifact.carouselPlan?.hook || ''}
                      />
                    }
                  />
                </>
              );
            })()}
            {type === 'image' && <ImageRenderer images={images} pendingImages={artifact.pendingImages} title={title} />}
            {type === 'code_block' && <CodeRenderer content={content} />}
            {type === 'markdown_doc' && <MarkdownRenderer content={content} onContentChange={onContentChange} />}
          </>
        )}
      </div>

      {/* ── Send Email Modal ── */}
      {sendModalOpen && (
        <div className="ap-modal-overlay" onClick={() => setSendModalOpen(false)}>
          <div className="ap-modal" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3>Send Newsletter</h3>
              <button className="ap-modal-close" onClick={() => setSendModalOpen(false)}><X size={18} /></button>
            </div>
            {sendLoading ? (
              <div className="ap-modal-empty">Loading...</div>
            ) : sendResult ? (
              <div className="ap-modal-result">
                <div className="ap-modal-result-text">Sent to {sendResult.success} of {sendResult.total}{sendResult.failed > 0 && ` (${sendResult.failed} failed)`}</div>
                <button className="ap-btn ap-btn--send" onClick={() => setSendModalOpen(false)}>Done</button>
              </div>
            ) : (
              <>
                <div className="ap-modal-section">
                  <label>From</label>
                  <select className="ap-modal-input" value={selectedAccountId || ''} onChange={e => setSelectedAccountId(e.target.value)}>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.display_name || a.email}</option>)}
                  </select>
                </div>
                <div className="ap-modal-section">
                  <label>Subject</label>
                  <input className="ap-modal-input" placeholder="Subject line..." value={sendSubject} onChange={e => setSendSubject(e.target.value)} />
                </div>
                <div className="ap-modal-section">
                  <label>Recipients <span className="ap-modal-count">{sendSelected.size}</span></label>
                  <div className="ap-modal-search">
                    <Search size={13} />
                    <input placeholder="Search..." value={sendSearch} onChange={e => setSendSearch(e.target.value)} />
                  </div>
                  <label className="ap-modal-selectall">
                    <input type="checkbox" checked={sendSelectAll} onChange={e => { setSendSelectAll(e.target.checked); if (!e.target.checked) setSendSelected(new Set()); }} />
                    Select All ({filteredContacts.length})
                  </label>
                  <div className="ap-modal-contacts">
                    {filteredContacts.map(c => (
                      <label key={c.id} className={`ap-modal-contact ${sendSelected.has(c.id) ? 'ap-modal-contact--on' : ''}`}>
                        <input type="checkbox" checked={sendSelected.has(c.id)} onChange={() => {
                          setSendSelected(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; });
                        }} />
                        <span className="ap-modal-contact-name">{c.name || c.email}</span>
                        <span className="ap-modal-contact-email">{c.email}</span>
                      </label>
                    ))}
                    {filteredContacts.length === 0 && <div className="ap-modal-empty">No contacts with email</div>}
                  </div>
                </div>
                <div className="ap-modal-footer">
                  <button className="ap-btn ap-btn--outline" onClick={() => setSendModalOpen(false)}>Cancel</button>
                  <button className="ap-btn ap-btn--send" disabled={!selectedAccountId || sendSelected.size === 0 || sending} onClick={handleSendBulk}>
                    {sending ? 'Sending...' : `Send to ${sendSelected.size}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Save Template Modal ── */}
      {saveModalOpen && (
        <div className="ap-modal-overlay" onClick={() => setSaveModalOpen(false)}>
          <div className="ap-modal ap-modal--sm" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3>Save As Template</h3>
              <button className="ap-modal-close" onClick={() => setSaveModalOpen(false)}><X size={18} /></button>
            </div>
            {saved ? (
              <div className="ap-modal-result">
                <div className="ap-modal-result-text">Template saved!</div>
                <button className="ap-btn ap-btn--send" onClick={() => setSaveModalOpen(false)}>Done</button>
              </div>
            ) : (
              <>
                <div className="ap-modal-section">
                  <label>Name</label>
                  <input className="ap-modal-input" placeholder="Template name..." value={saveName} onChange={e => setSaveName(e.target.value)} />
                </div>
                <div className="ap-modal-section">
                  <label>Description</label>
                  <input className="ap-modal-input" placeholder="Optional..." value={saveDesc} onChange={e => setSaveDesc(e.target.value)} />
                </div>
                <div className="ap-modal-footer">
                  <button className="ap-btn ap-btn--outline" onClick={() => setSaveModalOpen(false)}>Cancel</button>
                  <button className="ap-btn ap-btn--send" disabled={!saveName.trim() || saving} onClick={handleSaveTemplate}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Import Template Modal ── */}
      {importModalOpen && (
        <div className="ap-modal-overlay" onClick={() => setImportModalOpen(false)}>
          <div className="ap-modal" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3>Import Template</h3>
              <button className="ap-modal-close" onClick={() => setImportModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="ap-modal-list">
              {templatesLoading ? (
                <div className="ap-modal-empty">Loading...</div>
              ) : templates.length === 0 ? (
                <div className="ap-modal-empty">No saved templates yet</div>
              ) : (
                templates.map(t => (
                  <div key={t.id} className="ap-modal-tpl-item" onClick={() => handleImportTemplate(t.id)}>
                    <div className="ap-modal-tpl-name">{t.name}</div>
                    {t.description && <div className="ap-modal-tpl-desc">{t.description}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Version History Modal ── */}
      {historyOpen && (
        <div className="ap-modal-overlay" onClick={() => setHistoryOpen(false)}>
          <div className="ap-modal ap-history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3>Version history</h3>
              <button className="ap-modal-close" onClick={() => setHistoryOpen(false)}><X size={18} /></button>
            </div>
            <div className="ap-history-list">
              {versionsLoading && <div className="ap-history-empty">Loading…</div>}
              {!versionsLoading && versionList.length === 0 && (
                <div className="ap-history-empty">No history yet. Make an edit and it'll show up here.</div>
              )}
              {!versionsLoading && versionList.map((v, idx) => (
                <div key={v.id} className={`ap-history-item${idx === 0 ? ' ap-history-item--current' : ''}`}>
                  <div className="ap-history-item-info">
                    <div className="ap-history-item-title">
                      v{v.version_number}
                      {v.is_revert && <span className="ap-history-item-badge">reverted</span>}
                      {idx === 0 && <span className="ap-history-item-current">current</span>}
                    </div>
                    {v.summary && <div className="ap-history-item-summary">{v.summary}</div>}
                    <div className="ap-history-item-meta">
                      {new Date(v.created_at).toLocaleString()}
                    </div>
                  </div>
                  {idx !== 0 && (
                    <button
                      className="ap-btn ap-btn--outline"
                      onClick={() => handleRestore(v.id)}
                      disabled={restoring === v.id}
                    >
                      <Undo2 size={14} /> {restoring === v.id ? 'Restoring…' : 'Restore'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Name Your Netlify Site Modal ── */}
      {nameModalOpen && (
        <div className="ap-modal-overlay" onClick={() => !deploying && setNameModalOpen(false)}>
          <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3>Name your site</h3>
              <button className="ap-modal-close" onClick={() => !deploying && setNameModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="ap-netlify-connect">
              <p className="ap-netlify-connect-desc">
                This becomes your Netlify subdomain. Pick something memorable — you can share the URL anywhere.
              </p>
              <label className="ap-netlify-label">Site name</label>
              <div className="ap-sitename-row">
                <input
                  type="text"
                  className="ap-netlify-input ap-sitename-input"
                  placeholder="my-awesome-page"
                  value={siteNameInput}
                  onChange={(e) => setSiteNameInput(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmName(); }}
                  autoFocus
                  maxLength={63}
                />
                <span className="ap-sitename-suffix">.netlify.app</span>
              </div>
              <div className="ap-sitename-status">
                {nameChecking && <span className="ap-sitename-status--checking">Checking availability…</span>}
                {!nameChecking && nameCheck && nameCheck.available && nameCheck.owned && (
                  <span className="ap-sitename-status--owned">✓ You already own this site — we'll redeploy to it.</span>
                )}
                {!nameChecking && nameCheck && nameCheck.available && !nameCheck.owned && nameCheck.reason !== 'unverified' && (
                  <span className="ap-sitename-status--ok">✓ Available</span>
                )}
                {!nameChecking && nameCheck && nameCheck.available && nameCheck.reason === 'unverified' && (
                  <span className="ap-sitename-status--warn">Couldn't fully verify — deploy will confirm.</span>
                )}
                {!nameChecking && nameCheck && nameCheck.available === false && nameCheck.reason === 'taken' && (
                  <span className="ap-sitename-status--err">✗ This name is taken. Try another.</span>
                )}
                {!nameChecking && nameCheck && nameCheck.available === false && nameCheck.reason === 'invalid_chars' && (
                  <span className="ap-sitename-status--err">✗ Use only lowercase letters, digits, and hyphens.</span>
                )}
                {!nameChecking && nameCheck && nameCheck.available === false && nameCheck.reason === 'too_long' && (
                  <span className="ap-sitename-status--err">✗ Too long — keep it under 63 characters.</span>
                )}
                {!nameChecking && nameCheck && nameCheck.available === false && nameCheck.reason === 'empty' && (
                  <span className="ap-sitename-status--err">✗ Name can't be empty.</span>
                )}
                {!nameChecking && nameCheck && nameCheck.available === false && nameCheck.reason === 'unauthorized' && (
                  <span className="ap-sitename-status--err">✗ Netlify token rejected. Reconnect in Settings.</span>
                )}
              </div>
              {siteNameInput && (
                <div className="ap-sitename-preview">
                  Your URL: <strong>https://{siteNameInput}.netlify.app</strong>
                </div>
              )}
              {sendError && <div className="ap-netlify-error">{sendError}</div>}
              <div className="ap-netlify-actions">
                <button
                  className="ap-btn ap-btn--outline"
                  onClick={() => setNameModalOpen(false)}
                  disabled={deploying}
                >
                  Cancel
                </button>
                <button
                  className="ap-btn ap-btn--netlify"
                  onClick={handleConfirmName}
                  disabled={
                    !siteNameInput.trim() ||
                    deploying ||
                    nameChecking ||
                    (nameCheck && nameCheck.available === false)
                  }
                >
                  {deploying ? 'Deploying…' : 'Deploy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Connect / Reconnect Netlify Modal ── */}
      {netlifyModalOpen && (
        <div className="ap-modal-overlay" onClick={() => setNetlifyModalOpen(false)}>
          <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3>{netlifyModalMode === 'reconnect' ? 'Reconnect Netlify' : 'Connect Netlify to Deploy'}</h3>
              <button className="ap-modal-close" onClick={() => setNetlifyModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="ap-netlify-connect">
              <p className="ap-netlify-connect-desc">
                {netlifyModalMode === 'reconnect'
                  ? 'Your saved Netlify token was rejected (likely expired or revoked). Paste a fresh token to deploy this page.'
                  : 'Paste your Netlify personal access token to deploy this page with one click.'}
              </p>
              <div className="ap-netlify-steps">
                <div className="ap-netlify-steps-title">How to get a token (30 seconds)</div>
                <ol className="ap-netlify-steps-list">
                  <li>
                    Open{' '}
                    <a href="https://app.netlify.com/user/applications#personal-access-tokens" target="_blank" rel="noopener noreferrer">
                      app.netlify.com → User settings → Applications
                    </a>
                    .
                  </li>
                  <li>Under <strong>Personal access tokens</strong>, click <strong>New access token</strong>.</li>
                  <li>Name it (e.g. <em>PurelyPersonal</em>) and click <strong>Generate token</strong>.</li>
                  <li>Copy the token and paste it below.</li>
                </ol>
              </div>
              <label className="ap-netlify-label">Personal Access Token</label>
              <input
                type="text"
                className="ap-netlify-input"
                placeholder="nfp_..."
                value={netlifyToken}
                onChange={(e) => setNetlifyToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && netlifyToken.trim()) handleNetlifyConnectAndDeploy(); }}
                autoFocus
              />
              {netlifyConnectError && <div className="ap-netlify-error">{netlifyConnectError}</div>}
              <div className="ap-netlify-actions">
                <button
                  className="ap-btn ap-btn--outline"
                  onClick={() => setNetlifyModalOpen(false)}
                  disabled={netlifyConnecting}
                >
                  Cancel
                </button>
                <button
                  className="ap-btn ap-btn--netlify"
                  onClick={handleNetlifyConnectAndDeploy}
                  disabled={!netlifyToken.trim() || netlifyConnecting}
                >
                  {netlifyConnecting ? 'Validating…' : 'Connect & Deploy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmailRenderer({ content }) {
  const email = parseEmailContent(content);
  return (
    <div className="ap-email">
      {(email.to || email.subject) && (
        <div className="ap-email-header">
          {email.to && (
            <div className="ap-email-field">
              <label>To</label>
              <span>{email.to}</span>
            </div>
          )}
          {email.subject && (
            <div className="ap-email-field">
              <label>Subject</label>
              <span className="ap-email-subject">{email.subject}</span>
            </div>
          )}
        </div>
      )}
      <div className="ap-email-canvas">
        <div className="ap-email-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(email.body_html, {
          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'span', 'div', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'img', 'hr', 'b', 'i', 'u', 'blockquote'],
          ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'class', 'width', 'height', 'target', 'rel'],
        }) }} />
      </div>
    </div>
  );
}

// Shimmer CSS for image generation placeholders — injected into iframe <head> to survive DOMParser
const SHIMMER_CSS = '.gen-shimmer{width:100%;height:250px;background:#e2e2e2;border-radius:12px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}.gen-shimmer::before{content:"";position:absolute;width:300%;height:300%;top:-100%;left:-100%;background:linear-gradient(135deg,transparent 35%,rgba(255,255,255,0.5) 48%,rgba(255,255,255,0.8) 50%,rgba(255,255,255,0.5) 52%,transparent 65%);animation:genShimmer 2s linear infinite}.gen-shimmer-text{color:#9e9e9e;font-size:13px;font-weight:600;font-family:Inter,system-ui,sans-serif;position:relative;z-index:1;letter-spacing:0.5px}@keyframes genShimmer{0%{transform:translate(-33%,-33%)}100%{transform:translate(33%,33%)}}';

// Replace {{GENERATE:...}} placeholders with a shimmer div for display (self-contained with inline styles)
const SHIMMER_PLACEHOLDER = `<div class="gen-shimmer" style="width:100%;height:250px;background:#e2e2e2;border-radius:12px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden"><style>.gen-shimmer::before{content:'';position:absolute;width:300%;height:300%;top:-100%;left:-100%;background:linear-gradient(135deg,transparent 35%,rgba(255,255,255,0.5) 48%,rgba(255,255,255,0.8) 50%,rgba(255,255,255,0.5) 52%,transparent 65%);animation:genShimmer 2s linear infinite}@keyframes genShimmer{0%{transform:translate(-33%,-33%)}100%{transform:translate(33%,33%)}}</style><span style="color:#9e9e9e;font-size:13px;font-weight:600;font-family:Inter,system-ui,sans-serif;position:relative;z-index:1;letter-spacing:0.5px">Generating</span></div>`;

function replaceGeneratePlaceholders(html) {
  if (!html) return html;
  const hasGenerate = html.includes('{{GENERATE:');
  const hasCoverPlaceholder = html.includes('{{COVER_IMAGE_PLACEHOLDER}}');
  if (!hasGenerate && !hasCoverPlaceholder) return html;
  let result = html;
  if (hasGenerate) {
    // Replace full <img ... {{GENERATE:...}} ... > tags with shimmer div
    result = result.replace(/<img[^>]*\{\{GENERATE:[\s\S]*?\}\}[^>]*\/?>/gi, SHIMMER_PLACEHOLDER);
    // Also replace any remaining bare {{GENERATE:...}}
    result = result.replace(/\{\{GENERATE:[\s\S]*?\}\}/g, SHIMMER_PLACEHOLDER);
  }
  if (hasCoverPlaceholder) {
    result = result.replace('{{COVER_IMAGE_PLACEHOLDER}}', `<div style="max-width:600px;margin:0 auto;">${SHIMMER_PLACEHOLDER}</div>`);
  }
  return result;
}

function HtmlRenderer({ content, iframeRef, editMapRef, skipIframeWriteRef }) {
  const containerRef = useRef(null);

  // Write HTML to iframe with CTA link editor and text editor
  useEffect(() => {
    if (skipIframeWriteRef?.current) {
      skipIframeWriteRef.current = false;
      return;
    }

    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    if (content) {
      const needsShimmer = content.includes('{{GENERATE:') || content.includes('{{COVER_IMAGE_PLACEHOLDER}}');
      // Inject edit IDs for inline text editing
      let displayHtml = replaceGeneratePlaceholders(content);
      const { taggedHtml, editMap } = injectEditIds(displayHtml);
      if (editMapRef) editMapRef.current = editMap;

      doc.open();
      doc.write(taggedHtml);
      doc.close();

      // Inject shimmer animation CSS directly into iframe head (survives DOMParser processing)
      if (needsShimmer) {
        const shimmerStyle = doc.createElement('style');
        shimmerStyle.textContent = SHIMMER_CSS;
        doc.head.appendChild(shimmerStyle);
      }

      // Inject CTA link editor script
      const script = doc.createElement('script');
      script.textContent = `
        (function() {
          var style = document.createElement('style');
          style.textContent = [
            '.cta-link-overlay { position: absolute; display: none; align-items: center; gap: 6px; padding: 6px 10px; background: #1a1a2e; color: #fff; border-radius: 8px; font: 12px/1.3 Inter, system-ui, sans-serif; z-index: 99999; box-shadow: 0 4px 16px rgba(0,0,0,0.25); pointer-events: auto; max-width: 340px; }',
            '.cta-link-overlay-url { color: #a78bfa; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; cursor: default; }',
            '.cta-link-overlay-edit { background: none; border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 3px 8px; border-radius: 4px; cursor: pointer; font: 11px/1 Inter, system-ui, sans-serif; white-space: nowrap; }',
            '.cta-link-overlay-edit:hover { background: rgba(255,255,255,0.1); }',
            '.cta-link-input-wrap { position: absolute; display: none; align-items: center; gap: 6px; padding: 6px 10px; background: #1a1a2e; border-radius: 8px; z-index: 100000; box-shadow: 0 4px 16px rgba(0,0,0,0.25); }',
            '.cta-link-input { background: #2a2a3e; border: 1px solid #4a4a6e; color: #fff; padding: 5px 8px; border-radius: 4px; font: 12px/1 Inter, system-ui, sans-serif; width: 220px; outline: none; }',
            '.cta-link-input:focus { border-color: #a78bfa; }',
            '.cta-link-save { background: #a78bfa; border: none; color: #fff; padding: 4px 10px; border-radius: 4px; cursor: pointer; font: 11px/1.2 Inter, system-ui, sans-serif; }',
            '.cta-link-save:hover { background: #8b6fe0; }',
            'a[href]:hover { outline: 2px solid rgba(167,139,250,0.5); outline-offset: 2px; border-radius: 2px; }',
          ].join('\\n');
          document.head.appendChild(style);

          var overlay = document.createElement('div');
          overlay.className = 'cta-link-overlay';
          overlay.innerHTML = '<span class="cta-link-overlay-url"></span><button class="cta-link-overlay-edit">Edit Link</button>';
          document.body.appendChild(overlay);

          var inputWrap = document.createElement('div');
          inputWrap.className = 'cta-link-input-wrap';
          inputWrap.innerHTML = '<input class="cta-link-input" type="text" placeholder="https://..." /><button class="cta-link-save">Save</button>';
          document.body.appendChild(inputWrap);

          var urlDisplay = overlay.querySelector('.cta-link-overlay-url');
          var editBtn = overlay.querySelector('.cta-link-overlay-edit');
          var linkInput = inputWrap.querySelector('.cta-link-input');
          var saveBtn = inputWrap.querySelector('.cta-link-save');
          var activeLink = null;
          var hideTimer = null;

          function positionOverlay(el, target) {
            var rect = target.getBoundingClientRect();
            var scrollY = window.scrollY || document.documentElement.scrollTop;
            el.style.left = Math.max(4, rect.left) + 'px';
            el.style.top = (rect.bottom + scrollY + 6) + 'px';
          }

          document.addEventListener('mouseover', function(e) {
            if (window.__textEditing) return;
            var link = e.target.closest('a[href]');
            if (!link) return;
            clearTimeout(hideTimer);
            activeLink = link;
            urlDisplay.textContent = link.getAttribute('href') || '#';
            positionOverlay(overlay, link);
            overlay.style.display = 'flex';
          });

          document.addEventListener('mouseout', function(e) {
            var link = e.target.closest('a[href]');
            if (!link) return;
            hideTimer = setTimeout(function() {
              if (!overlay.matches(':hover') && !inputWrap.matches(':hover')) {
                overlay.style.display = 'none';
              }
            }, 300);
          });

          overlay.addEventListener('mouseover', function() { clearTimeout(hideTimer); });
          overlay.addEventListener('mouseout', function() {
            hideTimer = setTimeout(function() {
              if (!inputWrap.matches(':hover')) overlay.style.display = 'none';
            }, 300);
          });

          document.addEventListener('click', function(e) {
            var link = e.target.closest('a[href]');
            if (link) e.preventDefault();
          });

          editBtn.addEventListener('click', function() {
            if (!activeLink) return;
            linkInput.value = activeLink.getAttribute('href') || '';
            positionOverlay(inputWrap, activeLink);
            inputWrap.style.display = 'flex';
            overlay.style.display = 'none';
            linkInput.focus();
            linkInput.select();
          });

          function saveLink() {
            if (!activeLink) return;
            var oldHref = activeLink.getAttribute('href') || '';
            var newHref = linkInput.value.trim();
            if (newHref && newHref !== oldHref) {
              activeLink.setAttribute('href', newHref);
              window.parent.postMessage({ type: 'cta-link-edit', oldHref: oldHref, newHref: newHref, linkText: activeLink.textContent.trim() }, '*');
            }
            inputWrap.style.display = 'none';
          }

          saveBtn.addEventListener('click', saveLink);
          linkInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') saveLink();
            if (e.key === 'Escape') inputWrap.style.display = 'none';
          });

          inputWrap.addEventListener('mouseover', function() { clearTimeout(hideTimer); });
          inputWrap.addEventListener('mouseout', function() {
            hideTimer = setTimeout(function() { inputWrap.style.display = 'none'; }, 500);
          });
        })();
      `;
      doc.body.appendChild(script);

      // Inject inline text editing script
      const editScript = doc.createElement('script');
      editScript.textContent = getIframeEditScript();
      doc.body.appendChild(editScript);

      // Inject image resize/move/align script
      const imgScript = doc.createElement('script');
      imgScript.textContent = getIframeImageScript();
      doc.body.appendChild(imgScript);
    } else {
      doc.open();
      doc.write('<html><body></body></html>');
      doc.close();
    }
  }, [content, iframeRef]);

  // Responsive iframe scaling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 620) {
        const scale = w / 620;
        iframe.style.transform = `scale(${scale})`;
        iframe.style.transformOrigin = 'top left';
        iframe.style.width = '620px';
        iframe.style.height = Math.round(h / scale) + 'px';
      } else {
        iframe.style.transform = '';
        iframe.style.transformOrigin = '';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
      }
    };
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [content, iframeRef]);

  return (
    <div ref={containerRef} className="ap-iframe-container">
      <iframe ref={iframeRef} className="ap-iframe" title="Preview" sandbox="allow-same-origin allow-scripts" />
    </div>
  );
}

// ImageRenderer — clean centered viewer for plain generated images.
// No social-mockup chrome, no fake username, no follow button. Used
// when the user asked "generate me an image of X" — i.e. the bot's
// generate_image tool with no platform context. Platform-targeted
// content (instagram_post / linkedin_post / etc.) routes to
// SocialPreview (shared with the Content page) where the social
// wrapper is meaningful.
function ImageRenderer({ images, pendingImages, title }) {
  const list = useMemo(
    () => [...(Array.isArray(images) ? images : [])].sort((a, b) => (a.idx || 0) - (b.idx || 0)),
    [images]
  );
  const total = list.length;
  const isLoading = (pendingImages || 0) > 0 && total === 0;
  const [idx, setIdx] = useState(0);
  const current = total > 0 ? list[Math.min(idx, total - 1)] : null;

  useEffect(() => {
    if (idx > total - 1) setIdx(Math.max(0, total - 1));
  }, [total, idx]);

  const handleDownload = async () => {
    if (!current?.src) return;
    try {
      const res = await fetch(current.src, { mode: 'cors' });
      const blob = await res.blob();
      const ext = (blob.type.split('/')[1] || 'png').split('+')[0];
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      const base = (title || 'image').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
      a.download = `${base}${total > 1 ? `-${idx + 1}` : ''}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    } catch (err) {
      console.error('Image download failed:', err);
      window.open(current.src, '_blank', 'noopener');
    }
  };

  const handleFullscreen = () => {
    if (!current?.src) return;
    window.open(current.src, '_blank', 'noopener');
  };

  return (
    <div className="ap-image-viewer">
      <div className="ap-image-stage">
        {isLoading ? (
          <div className="ap-post-loading">
            <div className="ap-image-loading-inner">
              <span className="ap-image-loading-spin" aria-hidden="true" />
              <span className="ap-image-loading-title">Generating your image…</span>
              <span className="ap-image-loading-sub">usually takes 1–3 minutes — it will appear right here</span>
            </div>
          </div>
        ) : current ? (
          <>
            <img src={current.src} alt={title || 'Generated image'} className="ap-image-img" />
            {total > 1 && (
              <>
                <span className="ap-image-counter">{idx + 1}/{total}</span>
                {idx > 0 && (
                  <button className="ap-image-nav ap-image-nav--prev" onClick={() => setIdx((i) => i - 1)} aria-label="Previous">
                    <ChevronLeft size={18} />
                  </button>
                )}
                {idx < total - 1 && (
                  <button className="ap-image-nav ap-image-nav--next" onClick={() => setIdx((i) => i + 1)} aria-label="Next">
                    <ChevronRight size={18} />
                  </button>
                )}
              </>
            )}
            <div className="ap-image-tools">
              <button className="ap-image-tool" onClick={handleFullscreen} title="Open in new tab">
                <Maximize2 size={14} />
              </button>
              <button className="ap-image-tool" onClick={handleDownload} title="Download">
                <Download size={14} />
              </button>
            </div>
          </>
        ) : (
          <div className="ap-post-loading">
            <span>No image</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CodeRenderer({ content }) {
  return <pre className="ap-code"><code>{content}</code></pre>;
}

// Markdown artifact renderer with a view/edit toggle. In view mode it renders
// the markdown normally; in edit mode it shows a textarea and pushes edits
// back up through onContentChange so downstream CEO messages (and version
// history) see the user's changes. Used by Plan Mode plans and detailed
// content briefs — the user can tweak the plan directly in the canvas
// before asking the CEO to generate the actual posts.
function MarkdownRenderer({ content, onContentChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content || '');
  const [dirty, setDirty] = useState(false);

  // Sync draft when the artifact content changes upstream (new artifact
  // loaded, version restored, edited elsewhere).
  useEffect(() => {
    setDraft(content || '');
    setDirty(false);
  }, [content]);

  const save = () => {
    if (onContentChange) onContentChange(draft);
    setDirty(false);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(content || '');
    setDirty(false);
    setEditing(false);
  };

  return (
    <div className="ap-markdown-wrap">
      <div className="ap-markdown-toolbar">
        {editing ? (
          <>
            <button
              type="button"
              className="ap-md-btn ap-md-btn--primary"
              onClick={save}
              disabled={!dirty}
              title="Save your edits — subsequent CEO messages will see this version"
            >
              <Check size={14} /> Save
            </button>
            <button type="button" className="ap-md-btn" onClick={cancel}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="ap-md-btn"
            onClick={() => setEditing(true)}
            title="Edit this document"
          >
            <PenTool size={14} /> Edit
          </button>
        )}
      </div>
      {editing ? (
        <textarea
          className="ap-markdown-editor"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setDirty(e.target.value !== content); }}
          spellCheck={true}
        />
      ) : (
        <div className="ap-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function StorySequenceRenderer({ frames }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);
  const touchStartRef = useRef(null);
  const DURATION = 5000;

  const total = frames.length;
  const frame = frames[activeIndex] || {};

  const readyCount = frames.filter(f => f.imageSrc && !f.loading).length;
  const prevReadyRef = useRef(0);
  useEffect(() => {
    if (readyCount > prevReadyRef.current) {
      const currentFrame = frames[activeIndex];
      if (!currentFrame?.imageSrc || currentFrame?.loading) {
        const firstReady = frames.findIndex(f => f.imageSrc && !f.loading);
        if (firstReady >= 0) setActiveIndex(firstReady);
      }
      prevReadyRef.current = readyCount;
    }
  }, [readyCount, frames, activeIndex]);

  useEffect(() => {
    if (total === 0 || paused) return;
    timerRef.current = setTimeout(() => {
      setActiveIndex(prev => (prev + 1) % total);
    }, DURATION);
    return () => clearTimeout(timerRef.current);
  }, [paused, total, activeIndex]);

  const goPrev = (e) => { e.stopPropagation(); setActiveIndex(prev => Math.max(0, prev - 1)); };
  const goNext = (e) => { e.stopPropagation(); setActiveIndex(prev => Math.min(total - 1, prev + 1)); };

  const onTouchStart = (e) => { touchStartRef.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartRef.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartRef.current;
    if (Math.abs(diff) > 40) {
      if (diff < 0) setActiveIndex(prev => Math.min(total - 1, prev + 1));
      else setActiveIndex(prev => Math.max(0, prev - 1));
    }
    touchStartRef.current = null;
  };

  if (total === 0) return <div className="ap-story-empty">No story frames</div>;

  return (
    <div className="ap-story-wrapper">
      <div
        className="ap-story-phone"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="ap-story-timeline">
          {frames.map((_, i) => (
            <div key={i} className="ap-story-timeline-bar" onClick={() => setActiveIndex(i)}>
              <div
                className={`ap-story-timeline-fill ${i === activeIndex ? (paused ? 'ap-story-timeline-fill--paused' : 'ap-story-timeline-fill--active') : i < activeIndex ? 'ap-story-timeline-fill--done' : ''}`}
                style={i === activeIndex ? { animationDuration: `${DURATION}ms` } : undefined}
              />
            </div>
          ))}
        </div>

        <div className="ap-story-tap ap-story-tap--left" onClick={goPrev} />
        <div className="ap-story-tap ap-story-tap--right" onClick={goNext} />

        {activeIndex > 0 && (
          <button className="ap-story-arrow ap-story-arrow--left" onClick={goPrev}>
            <ChevronRight size={20} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
        {activeIndex < total - 1 && (
          <button className="ap-story-arrow ap-story-arrow--right" onClick={goNext}>
            <ChevronRight size={20} />
          </button>
        )}

        <div className="ap-story-frame">
          {frame.loading ? (
            <div className="ap-story-frame-loading" />
          ) : frame.imageSrc ? (
            <img src={frame.imageSrc} alt={frame.caption || ''} className="ap-story-frame-img" />
          ) : frame.error ? (
            <div className="ap-story-frame-empty" style={{ background: '#1a1a1a' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <span style={{ color: '#ef4444', fontSize: 12, marginTop: 8, fontWeight: 500 }}>Failed to generate</span>
            </div>
          ) : (
            <div className="ap-story-frame-empty">
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Waiting...</span>
            </div>
          )}
          <div className="ap-story-overlay">
            <span className="ap-story-num">Story {activeIndex + 1} / {total}</span>
            {frame.caption && <span className="ap-story-caption">{frame.caption}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
