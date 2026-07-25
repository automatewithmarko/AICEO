// Top-right toast stack for finished generation runs (carousels, image
// posts, stories). Fired by src/lib/generationTracker.js via the
// 'generation-toast' window event; clicking a toast deep-links back to
// the chat that produced the result. Lives in Layout so it renders on
// every page — the whole point is catching completions while the user
// is somewhere else.
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import './GenerationToasts.css';

const AUTO_DISMISS_MS = 10000;

export default function GenerationToasts() {
  const [toasts, setToasts] = useState([]);
  const navigate = useNavigate();

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    let nextId = 1;
    const onToast = (e) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-2), { id, ...e.detail }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    };
    window.addEventListener('generation-toast', onToast);
    return () => window.removeEventListener('generation-toast', onToast);
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="gen-toast-stack">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`gen-toast${t.ok ? '' : ' gen-toast--warn'}${t.deepLink ? ' gen-toast--link' : ''}`}
          onClick={() => {
            if (t.deepLink) navigate(t.deepLink);
            dismiss(t.id);
          }}
        >
          <span className="gen-toast-icon">
            {t.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          </span>
          <span className="gen-toast-body">
            <span className="gen-toast-title">{t.title}</span>
            {t.deepLink && <span className="gen-toast-hint">Click to open in chat</span>}
          </span>
          <button
            type="button"
            className="gen-toast-close"
            onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
