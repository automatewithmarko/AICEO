// Side-panel viewer for video scripts (reels / shorts / YouTube) in the
// /Content tab — the script-format sibling of LinkedInPreview /
// SocialPreview. Scripts arrive via the submit_script tool (chat) or the
// plan runner (reel_script / youtube_script pieces) and land on the
// message as msg.scriptDoc = { title, content, platform }. The chat shows
// a compact summary card; this panel is the full openable "canvas".
//
// The AI CEO tab renders the same content as a markdown_doc artifact in
// its ArtifactPanel — this keeps the /Content tab at parity.
import { useState, useEffect } from 'react';
import { X, Copy, Check, Download, Clapperboard } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './ScriptPreview.css';

export default function ScriptPreview({ title, content, platform, onClose, onContentChange }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content || '');

  // Re-bind when the panel switches to a different script — the
  // "adjust state when props change during render" pattern, so there's
  // no setState-in-effect cascade.
  const [lastContent, setLastContent] = useState(content);
  if (lastContent !== content) {
    setLastContent(content);
    setDraft(content || '');
    setEditing(false);
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !editing) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editing]);

  const label = platform === 'youtube' ? 'YouTube script' : 'Reel script';

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Script copy failed:', err);
    }
  };

  const downloadScript = () => {
    const blob = new Blob([content || ''], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || label).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'script'}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="script-preview" role="dialog" aria-label={label}>
      <div className="script-preview-header">
        <Clapperboard size={16} className="script-preview-icon" />
        <div className="script-preview-titles">
          <span className="script-preview-label">{label}</span>
          <span className="script-preview-title">{title || 'Untitled script'}</span>
        </div>
        <div className="script-preview-actions">
          {onContentChange && (
            <button
              type="button"
              className="script-preview-tool"
              title={editing ? 'Save edits' : 'Edit script'}
              onClick={() => {
                if (editing) {
                  onContentChange(draft);
                  setEditing(false);
                } else {
                  setEditing(true);
                }
              }}
            >
              {editing ? <Check size={15} /> : <span className="script-preview-edit-label">Edit</span>}
            </button>
          )}
          <button type="button" className="script-preview-tool" title="Copy script" onClick={copyScript}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button type="button" className="script-preview-tool" title="Download script" onClick={downloadScript}>
            <Download size={15} />
          </button>
          {onClose && (
            <button type="button" className="script-preview-close" title="Close (ESC)" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="script-preview-body">
        {editing ? (
          <textarea
            className="script-preview-editor"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            spellCheck
          />
        ) : (
          <div className="script-preview-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
