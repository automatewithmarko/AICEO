import { useState, useRef, useEffect } from 'react';
import { X, Copy, Send, Check, Mail, Code, FileText, PenTool, ChevronLeft, Rocket, ChevronDown, Search, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';
import { ARTIFACT_TYPES, parseEmailContent } from '../lib/artifacts';
import { sendEmailApi, deployToNetlify, getEmailAccounts, getContacts, getTemplates, getTemplate, saveTemplate } from '../lib/api';
import './ArtifactPanel.css';

export default function ArtifactPanel({ artifact, emailAccounts: externalAccounts, onClose, onChatMessage }) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(externalAccounts?.[0]?.id || null);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);
  const iframeRef = useRef(null);

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

  const handleDeploy = async () => {
    if (deploying) return;
    setDeploying(true);
    setDeployResult(null);
    setSendError('');
    try {
      const result = await deployToNetlify(htmlContent || content);
      setDeployResult(result);
      if (onChatMessage) onChatMessage(`Deployed to Netlify! Live at ${result.url}`);
    } catch (err) {
      setSendError(err.message);
    } finally {
      setDeploying(false);
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
      case 'code_block': return <Code size={16} />;
      default: return <FileText size={16} />;
    }
  };

  return (
    <div className="ap">
      <div className="ap-header">
        <div className="ap-header-left">
          <button className="ap-back-btn" onClick={onClose}>
            <ChevronLeft size={18} />
          </button>
          {renderIcon()}
          <span className="ap-title">{title}</span>
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
              <button className="ap-btn ap-btn--outline" onClick={() => handleCopy()}>
                {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy Code</>}
              </button>
              {isLanding && (
                <button
                  className={`ap-btn ${deployResult ? 'ap-btn--deploy-done' : 'ap-btn--deploy'}`}
                  onClick={handleDeploy}
                  disabled={deploying || !!deployResult}
                >
                  {deployResult ? <><Check size={14} /> Live</> : deploying ? 'Deploying...' : <><Rocket size={14} /> Deploy</>}
                </button>
              )}
            </>
          )}

          {deployResult && (
            <a href={deployResult.url} target="_blank" rel="noopener noreferrer" className="ap-btn ap-btn--outline ap-deploy-link">
              {deployResult.url.replace('https://', '')}
            </a>
          )}

          {/* Non-HTML types — just copy */}
          {!isHtml && type !== 'email' && (
            <button className="ap-btn ap-btn--outline" onClick={() => handleCopy()}>
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
          )}
          <button className="ap-close" onClick={onClose}><X size={18} /></button>
        </div>
      </div>

      {sendError && <div className="ap-error">{sendError}</div>}

      <div className="ap-body">
        {type === 'email' && <EmailRenderer content={content} />}
        {type === 'newsletter' && <HtmlRenderer content={htmlContent || content} iframeRef={iframeRef} />}
        {type === 'html_template' && <HtmlRenderer content={htmlContent || content} iframeRef={iframeRef} />}
        {type === 'content_post' && <ContentPostRenderer content={content} images={images} />}
        {type === 'code_block' && <CodeRenderer content={content} />}
        {type === 'markdown_doc' && <MarkdownRenderer content={content} />}
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
    </div>
  );
}

function EmailRenderer({ content }) {
  const email = parseEmailContent(content);
  return (
    <div className="ap-email">
      <div className="ap-email-field">
        <label>To</label>
        <span>{email.to || '(no recipient specified)'}</span>
      </div>
      <div className="ap-email-field">
        <label>Subject</label>
        <span>{email.subject || '(no subject)'}</span>
      </div>
      <div className="ap-email-divider" />
      <div className="ap-email-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(email.body_html, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'span', 'div', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'img', 'hr', 'b', 'i', 'u'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'class', 'width', 'height', 'target', 'rel'],
      }) }} />
    </div>
  );
}

function HtmlRenderer({ content, iframeRef }) {
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(content || '<html><body></body></html>');
    doc.close();
  }, [content, iframeRef]);

  return <iframe ref={iframeRef} className="ap-iframe" title="Preview" sandbox="allow-same-origin allow-scripts" />;
}

function ContentPostRenderer({ content, images }) {
  return (
    <div className="ap-content-post">
      {images?.length > 0 && (
        <div className="ap-post-images">
          {images.map((img, i) => <img key={i} src={img.src} alt="" className="ap-post-image" />)}
        </div>
      )}
      <div className="ap-post-text">{content}</div>
    </div>
  );
}

function CodeRenderer({ content }) {
  return <pre className="ap-code"><code>{content}</code></pre>;
}

function MarkdownRenderer({ content }) {
  return (
    <div className="ap-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
